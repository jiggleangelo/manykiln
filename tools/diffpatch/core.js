/* Original clean-room implementation. MIT license; see LICENSE. */
(function (root) {
'use strict';
const MAX_BYTES = 2000000, MAX_LINES = 6000, MAX_TRACE = 4000000;
function lines(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw Error('Text must be at most 2,000,000 characters.');
  const result = (text.match(/[^\n]*\n|[^\n]+$/g) || []).map(s => ({text:s.endsWith('\n') ? s.slice(0,-1) : s, nl:s.endsWith('\n')}));
  if (result.length > MAX_LINES) throw Error('At most 6,000 lines per input.');
  return result;
}
function key(line, options) {
  let s = line.text;
  if (options.whitespace) s = s.replace(/\s+/gu,'');
  if (options.casefold) s = s.toLowerCase();
  return JSON.stringify([s,line.nl]);
}
function diff(before, after, options = {}) {
  const a = lines(before), b = lines(after), ak = a.map(x=>key(x,options)), bk = b.map(x=>key(x,options));
  const n=a.length,m=b.length, trace=[];
  let v = new Map([[1,0]]), cells=0, distance;
  outer: for (let d=0; d<=n+m; d++) {
    cells += 2*d+1;
    if(cells>MAX_TRACE) throw Error('Exact diff complexity limit exceeded. Compare smaller sections.');
    trace.push(new Map(v));
    for(let k=-d;k<=d;k+=2) {
      let x;
      if(k===-d || (k!==d && (v.get(k-1) ?? -1) < (v.get(k+1) ?? -1))) x=v.get(k+1) ?? 0;
      else x=(v.get(k-1) ?? 0)+1;
      let y=x-k;
      while(x<n && y<m && ak[x]===bk[y]) {x++;y++;}
      v.set(k,x);
      if(x>=n && y>=m) {distance=d;break outer;}
    }
  }
  let x=n,y=m; const reversed=[];
  for(let d=distance;d>=0;d--) {
    const prior=trace[d],k=x-y;
    const pk=(k===-d || (k!==d && (prior.get(k-1)??-1)<(prior.get(k+1)??-1))) ? k+1 : k-1;
    const px=prior.get(pk)??0, py=px-pk;
    while(x>px && y>py) {reversed.push({type:'equal',a:a[--x],b:b[--y]});}
    if(d>0) {
      if(x===px) reversed.push({type:'add',b:b[--y]});
      else reversed.push({type:'delete',a:a[--x]});
    }
  }
  const ops=reversed.reverse(); let old=1, next=1;
  for(const op of ops) {op.old=old;op.next=next;if(op.a)old++;if(op.b)next++;}
  return {ops,distance,oldLines:n,newLines:m};
}
function hunks(result, context=3) {
  if(!Number.isInteger(context)||context<0||context>50) throw Error('Invalid context.');
  const ops=result.ops, ranges=[];
  for(let i=0;i<ops.length;i++) if(ops[i].type!=='equal') {
    const start=Math.max(0,i-context),end=Math.min(ops.length,i+context+1),last=ranges.at(-1);
    if(last && start<=last.end) last.end=end; else ranges.push({start,end});
  }
  return ranges.map(({start,end})=>{
    const body=ops.slice(start,end),oldCount=body.filter(o=>o.a).length,newCount=body.filter(o=>o.b).length;
    return {body,oldStart:ops[start].old-(oldCount===0?1:0),newStart:ops[start].next-(newCount===0?1:0),oldCount,newCount,
      added:body.filter(o=>o.type==='add').length,deleted:body.filter(o=>o.type==='delete').length};
  });
}
function header(h) {return `@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@`;}
function unified(before,after) {
  const hs=hunks(diff(before,after));
  if(!hs.length)return '';
  const out=['--- before.txt','+++ after.txt'];
  for(const h of hs) {
    out.push(header(h));
    for(const op of h.body) {
      const line=op.type==='add'?op.b:op.a;
      out.push((op.type==='add'?'+':op.type==='delete'?'-':' ')+line.text);
      if(!line.nl)out.push('\\ No newline at end of file');
    }
  }
  return out.join('\n')+'\n';
}
function inspect(patch) {
  if(typeof patch!=='string'||patch.length>MAX_BYTES)throw Error('Patch must be at most 2,000,000 characters.');
  if(!patch)return {files:[],hunks:[],added:0,deleted:0};
  if(!patch.endsWith('\n'))throw Error('Unified patch must end with a newline.');
  const input=patch.slice(0,-1).split('\n'),files=[],hs=[];let i=0,file;
  while(i<input.length) {
    if(input[i].startsWith('--- ')) {
      const old=input[i++].slice(4);
      if(!input[i]?.startsWith('+++ '))throw Error(`Missing +++ file header at line ${i+1}.`);
      const next=input[i++].slice(4);
      if(!old||!next)throw Error('Empty file header.');
      file={old,next,hunks:[],oldEnd:0,newEnd:0,oldFinal:false,newFinal:false};files.push(file);continue;
    }
    const match=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(input[i]);
    if(!file||!match)throw Error(`Unexpected patch syntax at line ${i+1}.`);
    const h={oldStart:Number(match[1]),oldCount:match[2]===undefined?1:Number(match[2]),newStart:Number(match[3]),newCount:match[4]===undefined?1:Number(match[4]),added:0,deleted:0,line:i+1};
    if([h.oldStart,h.oldCount,h.newStart,h.newCount].some(n=>!Number.isSafeInteger(n)||n>MAX_BYTES))throw Error('Patch range out of bounds.');
    if((h.oldCount&&h.oldStart===0)||(h.newCount&&h.newStart===0))throw Error('Nonempty ranges must start at line 1 or later.');
    const oldPos=h.oldCount?h.oldStart-1:h.oldStart,newPos=h.newCount?h.newStart-1:h.newStart;
    if((file.oldFinal||file.newFinal)&&(oldPos>file.oldEnd||newPos>file.newEnd))throw Error('Unchanged content follows a final-newline marker.');
    if(oldPos-file.oldEnd!==newPos-file.newEnd)throw Error('Inconsistent unchanged gap between hunk ranges.');
    if(oldPos<file.oldEnd||newPos<file.newEnd)throw Error('Overlapping or out-of-order hunks.');
    let oc=0,nc=0,bodySeen=false,marked=false,lastPrefix='';i++;
    while(i<input.length) {
      const s=input[i];
      if(s==='\\ No newline at end of file') {
        if(!bodySeen||marked)throw Error(`Misplaced newline marker at line ${i+1}.`);
        if(lastPrefix!=='+')file.oldFinal=true;if(lastPrefix!=='-')file.newFinal=true;
        marked=true;i++;continue;
      }
      if(oc===h.oldCount&&nc===h.newCount)break;
      if(!s || ![' ','+','-'].includes(s[0]))throw Error(`Invalid hunk body at line ${i+1}.`);
      if((s[0]!=='+'&&file.oldFinal)||(s[0]!=='-'&&file.newFinal))throw Error('Content follows a final-newline marker.');
      lastPrefix=s[0];if(s[0]!=='+' )oc++;if(s[0]!=='-')nc++;
      if(s[0]==='+')h.added++;if(s[0]==='-')h.deleted++;
      if(oc>h.oldCount||nc>h.newCount)throw Error('Hunk counts exceeded.');
      bodySeen=true;marked=false;i++;
    }
    if(oc!==h.oldCount||nc!==h.newCount)throw Error('Hunk counts do not match header.');
    if(!bodySeen)throw Error('Empty hunk.');
    file.oldEnd=oldPos+h.oldCount;file.newEnd=newPos+h.newCount;
    file.hunks.push(h);hs.push(h);
  }
  if(!files.length||files.some(f=>!f.hunks.length))throw Error('Each file needs at least one hunk.');
  return {files,hunks:hs,added:hs.reduce((s,h)=>s+h.added,0),deleted:hs.reduce((s,h)=>s+h.deleted,0)};
}
const api={lines,diff,hunks,header,unified,inspect};
if(typeof module!=='undefined')module.exports=api;else root.DiffPatch=Object.freeze(api);
})(globalThis);
