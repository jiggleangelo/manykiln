/* Original clean-room implementation. MIT License. */
(function(root){'use strict';
const LIMITS=Object.freeze({chars:10000000,rows:100000,columns:256,field:1000000,issues:500});
function fail(s){throw new Error(s);}
class CSVParser {
 constructor({delimiter=',',onRow=()=>{}}={}){
  if(![',',';','\t','|'].includes(delimiter))fail('Delimiter must be comma, semicolon, tab or pipe.');
  this.d=delimiter;this.onRow=onRow;this.state='start';this.row=[];this.field='';this.offset=0;this.rows=0;this.done=false;this.skipLF=false;this.prevCR=false;
  this.stats={bom:false,embeddedBOM:0,crlf:0,loneCR:0,loneLF:0};
 }
 push(chunk){
  if(this.done)fail('Parser already finished.');if(typeof chunk!=='string')fail('CSV chunk must be text.');
  for(let index=0;index<chunk.length;index++){const c=chunk[index];
   if(++this.offset>LIMITS.chars)fail('CSV exceeds 10 million characters.');
   if(this.offset===1&&c==='\uFEFF'){this.stats.bom=true;continue;}
   if(c==='\uFEFF')this.stats.embeddedBOM++;
   if(c==='\n'){if(this.prevCR)this.stats.crlf++;else this.stats.loneLF++;}
   else if(this.prevCR)this.stats.loneCR++;
   this.prevCR=c==='\r';
   if(this.skipLF){this.skipLF=false;if(c==='\n')continue;}
   if(this.state==='quoted'){
    if(c==='"')this.state='afterQuote';else this.add(c);continue;
   }
   if(this.state==='afterQuote'){
    if(c==='"'){this.add('"');this.state='quoted';continue;}
    if(c!==this.d&&c!=='\r'&&c!=='\n')fail('Unexpected character after closing quote at character '+this.offset+'.');
   }else if(c==='"'){
    if(this.state!=='start')fail('Quote inside unquoted field at character '+this.offset+'.');
    this.state='quoted';continue;
   }
   if(c===this.d){this.endField();continue;}
   if(c==='\r'||c==='\n'){this.endField();this.endRow();this.skipLF=c==='\r';continue;}
   this.add(c);this.state='unquoted';
  }
  return this;
 }
 add(c){this.field+=c;if(this.field.length>LIMITS.field)fail('Field exceeds one million characters.');}
 endField(){if(this.row.length>=LIMITS.columns)fail('Row exceeds 256 columns.');this.row.push(this.field);this.field='';this.state='start';}
 endRow(){if(++this.rows>LIMITS.rows+1)fail('CSV exceeds 100000 data rows.');const row=this.row;this.row=[];this.onRow(row,this.rows);}
 finish(){if(this.done)fail('Parser already finished.');this.done=true;if(this.prevCR)this.stats.loneCR++;
  if(this.state==='quoted')fail('Unclosed quoted field at end of CSV.');
  if(this.state!=='start'||this.row.length){this.endField();this.endRow();}
  return {...this.stats,rows:this.rows};
 }
}
function parse(text,delimiter=','){const rows=[];const parser=new CSVParser({delimiter,onRow:r=>rows.push(r)});parser.push(text);return {rows,stats:parser.finish()};}
function detectDelimiter(text){
 if(typeof text!=='string'||!text.length)fail('CSV is empty.');
 const scores=[];
 for(const delimiter of [',',';','\t','|']){
  try{let rows=[];const parser=new CSVParser({delimiter,onRow:r=>{if(rows.length<30)rows.push(r);}});parser.push(text);parser.finish();
   rows=rows.slice(0,30);const width=rows[0]?.length||0;const consistent=rows.filter(r=>r.length===width).length;
   scores.push({delimiter,width,consistent,rows:rows.length,score:width>1?consistent/rows.length*100+Math.min(width,20):0});
  }catch{scores.push({delimiter,score:-1,width:0,consistent:0,rows:0});}
 }
 scores.sort((a,b)=>b.score-a.score);const best=scores[0];
 return {delimiter:best.score>0?best.delimiter:',',ambiguous:best.score<=0||scores[1].score===best.score,candidates:scores};
}
const types=['string','integer','number','boolean','date','json'];
function schemaOf(input){
 if(typeof input==='string'){if(input.length>100000)fail('Schema too large.');try{input=JSON.parse(input);}catch{fail('Schema must be valid JSON.');}}
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Schema must be an object.');
 for(const k of Object.keys(input))if(!['columns','uniqueKeys'].includes(k))fail('Unknown schema option: '+k);
 const columns=input.columns??[],uniqueKeys=input.uniqueKeys??[];
 if(!Array.isArray(columns)||columns.length>256||!Array.isArray(uniqueKeys)||uniqueKeys.length>32)fail('Invalid schema arrays.');
 const seen=new Set();
 for(const c of columns){
  if(!c||typeof c!=='object'||Array.isArray(c))fail('Invalid column constraint.');
  for(const k of Object.keys(c))if(!['name','type','required','min','max','minLength','maxLength','enum'].includes(k))fail('Unknown column option: '+k);
  if(typeof c.name!=='string'||!c.name||seen.has(c.name))fail('Column names must be nonempty and distinct.');seen.add(c.name);
  if(!types.includes(c.type??'string'))fail('Unsupported column type.');
  if(c.required!==undefined&&typeof c.required!=='boolean')fail('required must be boolean.');
  for(const k of ['min','max'])if(c[k]!==undefined&&(!Number.isFinite(c[k])||!['integer','number'].includes(c.type)))fail(k+' requires a finite numeric constraint.');
  for(const k of ['minLength','maxLength'])if(c[k]!==undefined&&(!Number.isSafeInteger(c[k])||c[k]<0||c[k]>LIMITS.field))fail('Invalid length bound.');
  if(c.min>c.max||c.minLength>c.maxLength)fail('Reversed constraint bounds.');
  if(c.enum!==undefined&&(!Array.isArray(c.enum)||c.enum.length>1000||!c.enum.every(v=>typeof v==='string')))fail('enum must be an array of strings.');
 }
 for(const key of uniqueKeys)if(!Array.isArray(key)||!key.length||key.length>32||key.some(n=>typeof n!=='string'||!n)||new Set(key).size!==key.length)fail('Unique keys must be nonempty arrays of distinct column names.');
 return {columns,uniqueKeys};
}
function validType(v,type){
 switch(type){case 'string':return true;case 'integer':return /^-?(0|[1-9]\d*)$/.test(v)&&Number.isSafeInteger(Number(v));
 case 'number':return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)&&Number.isFinite(Number(v));
 case 'boolean':return v==='true'||v==='false';case 'date':{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);if(y<1||m<1||m>12||d<1)return false;
 const days=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];return d<=days[m-1];}
 case 'json':try{JSON.parse(v);return true;}catch{return false;}default:return false;}
}
const PII_HEADER=/(?:e[\s_-]*mail|name|phone|mobile|address|postcode|zip|passport|birth|dob|social|ssn|identity|ic[\s_-]*(?:no|number)|password|secret|token|account|card|iban|ip[\s_-]*address)/i;
function piiValue(v){return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)||/(?:\d[ ()+.-]*){9,}/.test(v);}
class Validator {
 constructor(schema={}){this.schema=schemaOf(schema);this.headers=null;this.rows=[];this.issues=[];this.issueCount=0;this.keyMaps=[];this.pii=new Set();this.finished=false;}
 issue(code,row,column,detail){this.issueCount++;if(this.issues.length<LIMITS.issues)this.issues.push({code,row,column,detail});}
 accept(row,line){
  if(this.finished)fail('Validator already finished.');
  if(!this.headers){
   this.headers=row.slice();const seen=new Set();row.forEach((h,i)=>{if(!h)this.issue('empty_header',1,i+1,'Header is empty.');if(seen.has(h))this.issue('duplicate_header',1,i+1,'Header repeats.');seen.add(h);if(PII_HEADER.test(h))this.pii.add(i);});
   for(const c of this.schema.columns)if(!row.includes(c.name))this.issue('missing_column',1,null,'A declared schema column is missing: '+c.name);
   this.keyMaps=this.schema.uniqueKeys.map(names=>({indices:names.map(n=>row.indexOf(n)),seen:new Map()}));
   this.keyMaps.forEach(k=>{if(k.indices.includes(-1))this.issue('missing_key_column',1,null,'Unique-key column missing.');});return;
  }
  if(this.rows.length>=LIMITS.rows)fail('CSV exceeds 100000 data rows.');
  const lineNo=this.rows.length+2;if(line!==undefined&&line!==lineNo)fail('Rows must arrive in order.');
  this.rows.push(row.slice());
  if(row.length!==this.headers.length)this.issue('ragged_row',lineNo,null,'Expected '+this.headers.length+' fields; received '+row.length+'.');
  row.forEach((v,i)=>{if(piiValue(v)||i>=this.headers.length)this.pii.add(i);});
  for(const c of this.schema.columns){
   const i=this.headers.indexOf(c.name);if(i<0)continue;const v=row[i];
   if(v===undefined||v===''){if(c.required)this.issue('required',lineNo,i+1,'Required value missing.');continue;}
   if(!validType(v,c.type??'string'))this.issue('type',lineNo,i+1,'Expected '+(c.type??'string')+'.');
   if(c.min!==undefined&&Number(v)<c.min||c.max!==undefined&&Number(v)>c.max)this.issue('range',lineNo,i+1,'Numeric bound violated.');
   if(c.minLength!==undefined&&v.length<c.minLength||c.maxLength!==undefined&&v.length>c.maxLength)this.issue('length',lineNo,i+1,'Text length bound violated.');
   if(c.enum&&!c.enum.includes(v))this.issue('enum',lineNo,i+1,'Value outside declared enum.');
  }
  for(const k of this.keyMaps){if(k.indices.includes(-1))continue;const values=k.indices.map(i=>row[i]);
   if(values.some(v=>v===undefined||v==='')){this.issue('empty_key',lineNo,null,'Unique-key value missing.');continue;}
   const key=JSON.stringify(values);if(k.seen.has(key))this.issue('duplicate_key',lineNo,null,'Key repeats data row '+k.seen.get(key)+'.');else k.seen.set(key,lineNo);
  }
 }
 finish(stats){if(this.finished)fail('Validator already finished.');this.finished=true;if(!this.headers)fail('CSV is empty.');
  if(stats.bom)this.issue('bom',1,null,'Leading UTF-8 BOM removed.');
  if(stats.embeddedBOM)this.issue('embedded_bom',null,null,'Embedded BOM characters retained: '+stats.embeddedBOM+'.');
  if(stats.loneCR||stats.loneLF)this.issue('non_crlf',null,null,'Non-RFC line endings: lone CR '+stats.loneCR+', lone LF '+stats.loneLF+'.');
  const errors=this.issueCount-this.issues.filter(i=>['bom','embedded_bom','non_crlf'].includes(i.code)).length;
  this.report={valid:errors===0,dataRows:this.rows.length,columns:this.headers.length,issueCount:this.issueCount,issues:this.issues.slice(),issuesTruncated:this.issueCount>this.issues.length,piiColumns:[...this.pii].sort((a,b)=>a-b).map(i=>i+1),lineEndings:{...stats}};return this.report;
 }
 exportCSV({redact=true}={}){if(!this.finished)fail('Validate CSV before export.');
  const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const safe=v=>/^[\s]*[=+@-]/.test(v)?"'"+v:v;
  const rows=[this.headers,...this.rows];return rows.map((row,r)=>row.map((v,i)=>quote(r&&redact&&this.pii.has(i)?'[REDACTED]':safe(v))).join(',')).join('\r\n')+'\r\n';
 }
}
function validate(text,{delimiter=',',schema={}}={}){const validator=new Validator(schema),parser=new CSVParser({delimiter,onRow:(r,n)=>validator.accept(r,n)});parser.push(text);validator.finish(parser.finish());return validator;}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const api={LIMITS,CSVParser,Validator,parse,detectDelimiter,schemaOf,validType,validate,escapeHTML};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CSVSchema=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
