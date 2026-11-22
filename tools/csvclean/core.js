/* Original clean-room implementation. MIT license; see LICENSE. */
(function(root){
'use strict';
const DELIMITERS=[',','\t',';','|'], MAX=2000000, MAX_CELLS=300000;
function check(text){if(typeof text!=='string'||text.length>MAX)throw Error('Input must be at most 2,000,000 characters.');return text.charCodeAt(0)===0xFEFF?text.slice(1):text;}
function delimiter(value){if(!DELIMITERS.includes(value))throw Error('Choose comma, tab, semicolon or pipe.');return value;}
function detect(text){
  text=check(text);if(!text)return ',';
  const widths=DELIMITERS.map(()=>[]),counts=DELIMITERS.map(()=>1);let quoted=false,records=0;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;continue;}
    if(quoted)continue;
    DELIMITERS.forEach((d,k)=>{if(c===d)counts[k]++;});
    if(c==='\r'||c==='\n') {
      if(c==='\r'&&text[i+1]==='\n')i++;
      widths.forEach((a,k)=>{a.push(counts[k]);counts[k]=1;});records++;
      if(records>=100)break;
    } else if(i===text.length-1)widths.forEach((a,k)=>a.push(counts[k]));
  }
  if(!records&&widths[0].length===0)widths.forEach((a,k)=>a.push(counts[k]));
  let best=0,score=-Infinity;
  widths.forEach((a,k)=>{
    if(!a.length)a.push(counts[k]);
    const freq=new Map();for(const n of a)freq.set(n,(freq.get(n)||0)+1);
    let mode=1,times=0;for(const [n,f]of freq)if(f>times||(f===times&&n>mode)){mode=n;times=f;}
    const s=mode>1?(times/a.length)*100+Math.min(mode,100)/100:-1;
    if(s>score){score=s;best=k;}
  });
  return DELIMITERS[best];
}
function parse(text,delim=','){
  text=check(text);delimiter(delim);if(!text)return [];
  const rows=[];let row=[],field='',state='start',cells=0;
  function cell(){row.push(field);field='';state='start';if(++cells>MAX_CELLS||row.length>2000)throw Error('Limit: 300,000 cells and 2,000 columns.');}
  function record(){cell();rows.push(row);row=[];if(rows.length>50000)throw Error('At most 50,000 rows.');}
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(state==='quoted'){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else state='closed';}else field+=c;
      continue;
    }
    if(c===delim){cell();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record();continue;}
    if(state==='closed')throw Error(`Unexpected character after closing quote at character ${i+1}.`);
    if(c==='"'){if(state!=='start')throw Error(`Quote inside unquoted field at character ${i+1}.`);state='quoted';}
    else {field+=c;state='plain';}
  }
  if(state==='quoted')throw Error('Unclosed quoted field.');
  if(row.length||field!==''||state!=='start'||(!text.endsWith('\n')&&!text.endsWith('\r')))record();
  return rows;
}
function order(spec,width){
  if(typeof spec!=='string')throw Error('Column order must be text.');
  if(!spec.trim())return Array.from({length:width},(_,i)=>i);
  const pieces=spec.split(',').map(s=>s.trim());
  if(pieces.some(s=>!/^\d+$/.test(s)))throw Error('Column order needs comma-separated 1-based numbers.');
  const indexes=pieces.map(s=>Number(s)-1);
  if(indexes.some(i=>!Number.isSafeInteger(i)||i<0||i>=width)||new Set(indexes).size!==indexes.length)throw Error('Column indexes must be unique and within the table.');
  return indexes;
}
function transform(rows,options={}){
  if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.some(c=>typeof c!=='string')))throw Error('Expected rows of text cells.');
  if(rows.length>50000||rows.some(r=>r.length>2000)||rows.reduce((n,r)=>n+r.length,0)>MAX_CELLS)throw Error('Table limit exceeded.');
  const policy=options.width||'flag';if(!['flag','pad','header'].includes(policy))throw Error('Unknown row-width policy.');
  const base=rows[0]?.length||0,max=rows.reduce((m,r)=>Math.max(m,r.length),0);
  const jagged=rows.flatMap((r,i)=>r.length===base?[]:[{row:i+1,width:r.length,expected:base}]);
  const width=policy==='pad'?max:base,cols=order(options.order||'',width),seen=new Set();let duplicates=0,truncated=0,padded=0;
  if((policy!=='flag'||options.order?.trim())&&rows.length*(options.order?.trim()?cols.length:width)>MAX_CELLS)throw Error('Repaired table exceeds 300,000 cells.');
  const cleaned=[];
  rows.forEach((source,i)=>{
    let r=source.slice();
    if(policy!=='flag'){
      truncated+=Math.max(0,r.length-width);padded+=Math.max(0,width-r.length);
      r=r.slice(0,width);while(r.length<width)r.push('');
    }
    if(options.trim)r=r.map(c=>c.trim());
    // Explicit ordering projects missing cells to empty strings; flag mode without ordering preserves jagged rows.
    if(options.order?.trim())r=cols.map(k=>r[k]??'');
    const signature=JSON.stringify(r);
    if(options.dedupe&&!(options.header&&i===0)){
      if(seen.has(signature)){duplicates++;return;}seen.add(signature);
    }
    cleaned.push(r);
  });
  const warnings=[];
  cleaned.forEach((r,i)=>r.forEach((c,j)=>{if(/^[\s\uFEFF]*[=+@-]/u.test(c)||/^[\t\r\n]/.test(c))warnings.push({row:i+1,column:j+1});}));
  return {rows:cleaned,jagged,duplicates,truncated,padded,warnings,width:options.order?.trim()?cols.length:width};
}
function csv(rows,delim=','){
  delimiter(delim);
  return rows.map(row=>row.map(cell=>{
    if(typeof cell!=='string')throw Error('CSV cells must be text.');
    return cell.includes(delim)||/["\r\n]/.test(cell)||cell===''?'"'+cell.replace(/"/g,'""')+'"':cell;
  }).join(delim)).join('\r\n')+(rows.length?'\r\n':'');
}
function json(rows){return JSON.stringify(rows,null,2)+'\n';}
function markdown(rows,hasHeader=true){
  if(!rows.length)return '';
  const width=rows.reduce((m,r)=>Math.max(m,r.length),0);if(!width)return '';
  const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\/g,'&#92;').replace(/\|/g,'&#124;').replace(/`/g,'&#96;').replace(/\*/g,'&#42;').replace(/_/g,'&#95;').replace(/\[/g,'&#91;').replace(/\]/g,'&#93;').replace(/\r\n|\r|\n/g,'<br>');
  const row=r=>'| '+Array.from({length:width},(_,i)=>escape(r[i]??'')).join(' | ')+' |';
  const heading=hasHeader?rows[0]:Array.from({length:width},(_,i)=>`Column ${i+1}`);
  return [row(heading),row(Array(width).fill('---')),...(hasHeader?rows.slice(1):rows).map(row)].join('\n')+'\n';
}
const api={detect,parse,order,transform,csv,json,markdown};
if(typeof module!=='undefined')module.exports=api;else root.CSVClean=Object.freeze(api);
})(globalThis);
