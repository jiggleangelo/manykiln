/* Original MIT implementation, copyright 2026 Manykiln. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JSONPatchDiff=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), ABSENT=Symbol('absent root');
const MAX_CHARS=1000000,MAX_OPS=1000,MAX_CELLS=50000;
function validate(value){let count=0;const ancestors=new Set();function walk(v,depth){if(++count>50000||depth>64)throw Error('JSON size/depth limit exceeded');if(v===null||typeof v==='boolean'||typeof v==='string')return;if(typeof v==='number'&&Number.isFinite(v))return;if(typeof v!=='object')throw Error('Only finite JSON values are supported');if(ancestors.has(v))throw Error('Cyclic JSON is invalid');ancestors.add(v);if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('Only plain JSON objects are supported');if(Object.getOwnPropertySymbols(v).length)throw Error('Symbol keys are not JSON');if(Array.isArray(v)){for(let i=0;i<v.length;i++){if(!own(v,i))throw Error('Sparse arrays are not JSON');const d=Object.getOwnPropertyDescriptor(v,String(i));if(!own(d,'value'))throw Error('Accessors are not JSON');walk(d.value,depth+1);}if(Object.keys(v).length!==v.length)throw Error('Array properties are not JSON');}else for(const key of Object.keys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(!own(d,'value'))throw Error('Accessors are not JSON');walk(d.value,depth+1);}ancestors.delete(v);}walk(value,0);if(JSON.stringify(value).length>MAX_CHARS)throw Error('JSON exceeds one million characters');}
function parse(text){if(typeof text!=='string'||text.length>MAX_CHARS||!text.trim())throw Error('Enter JSON, at most one million characters');let value;try{value=JSON.parse(text);}catch{throw Error('Invalid JSON syntax');}validate(value);return value;}
function clone(v){return JSON.parse(JSON.stringify(v));}
function equal(a,b){if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;if(Array.isArray(a))return a.length===b.length&&a.every((x,i)=>equal(x,b[i]));const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>own(b,k)&&equal(a[k],b[k]));}
function escapeToken(token){return String(token).replace(/~/g,'~0').replace(/\//g,'~1');}
function pointer(path){if(typeof path!=='string'||path.length>MAX_CHARS||path!==''&&!path.startsWith('/'))throw Error('Pointer must be empty or start with /');if(path==='')return [];return path.slice(1).split('/').map(token=>{if(/~(?:[^01]|$)/.test(token))throw Error('Invalid ~ escape in JSON Pointer');return token.replace(/~1/g,'/').replace(/~0/g,'~');});}
function index(token,length,add=false){if(add&&token==='-')return length;if(!/^(0|[1-9][0-9]*)$/.test(token))throw Error('Invalid array index');const n=Number(token);if(!Number.isSafeInteger(n)||n<0||n>length||!add&&n===length)throw Error('Array index out of bounds');return n;}
function get(doc,tokens){let v=doc;for(const token of tokens){if(v===ABSENT||v===null||typeof v!=='object')throw Error('Pointer does not resolve');if(Array.isArray(v)){v=v[index(token,v.length)];}else{if(!own(v,token))throw Error('Object member does not exist');v=v[token];}}if(v===ABSENT)throw Error('Document does not exist');return v;}
function setMember(obj,key,value){Object.defineProperty(obj,key,{value,writable:true,enumerable:true,configurable:true});}
function mutate(doc,tokens,op,value){if(tokens.length===0){if(op==='remove'){get(doc,[]);return ABSENT;}if(op==='replace')get(doc,[]);return clone(value);}
 const parent=get(doc,tokens.slice(0,-1)),key=tokens.at(-1);if(parent===null||typeof parent!=='object')throw Error('Parent must be an object or array');
 if(Array.isArray(parent)){const at=index(key,parent.length,op==='add');if(op==='add')parent.splice(at,0,clone(value));else if(op==='remove')parent.splice(at,1);else parent[at]=clone(value);}
 else{if(op!=='add'&&!own(parent,key))throw Error('Object member does not exist');if(op==='remove')delete parent[key];else setMember(parent,key,clone(value));}return doc;
}
function operation(doc,op){if(!op||typeof op!=='object'||Array.isArray(op)||!own(op,'op')||!own(op,'path'))throw Error('Operation needs op and path');const name=op.op,path=pointer(op.path);if(!['add','remove','replace','move','copy','test'].includes(name))throw Error('Unknown patch operation');
 if(['add','replace','test'].includes(name)&&!own(op,'value'))throw Error('Operation needs value');
 if(name==='test'){if(!equal(get(doc,path),op.value))throw Error('Test failed');return doc;}
 if(name==='copy'||name==='move'){
  if(!own(op,'from'))throw Error('Operation needs from');const from=pointer(op.from);const value=clone(get(doc,from));
  if(name==='move'){
   if(from.length<path.length&&from.every((x,i)=>x===path[i]))throw Error('Cannot move into own descendant');
   if(from.length===path.length&&from.every((x,i)=>x===path[i]))return doc;
   doc=mutate(doc,from,'remove');
  }return mutate(doc,path,'add',value);
 }
 return mutate(doc,path,name,op.value);
}
function isObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function structural(a,b){validate(a);validate(b);let cells=0;function diff(x,y,path){
 if(equal(x,y))return [];
 if(isObject(x)&&isObject(y)){
  const out=[];for(const k of Object.keys(x))if(!own(y,k))out.push({op:'remove',path:path+'/'+escapeToken(k)});
  for(const k of Object.keys(y)){const p=path+'/'+escapeToken(k);if(!own(x,k))out.push({op:'add',path:p,value:clone(y[k])});else out.push(...diff(x[k],y[k],p));}return out;
 }
 if(Array.isArray(x)&&Array.isArray(y)){
  const n=x.length,m=y.length;cells+=(n+1)*(m+1);if(cells>MAX_CELLS)throw Error('Structural array alignment limit exceeded; use Fewest operations mode or smaller arrays');
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1)),choices=Array.from({length:n},()=>new Array(m));
  for(let i=n;i>=0;i--)for(let j=m;j>=0;j--){if(i===n){dp[i][j]=m-j;continue;}if(j===m){dp[i][j]=n-i;continue;}
   const sub=diff(x[i],y[j],'');choices[i][j]=sub;dp[i][j]=Math.min(1+dp[i+1][j],1+dp[i][j+1],sub.length+dp[i+1][j+1]);
  }
  const out=[];let i=0,j=0,at=0;
  while(i<n||j<m){if(i<n&&j<m&&dp[i][j]===choices[i][j].length+dp[i+1][j+1]){for(const op of choices[i][j])out.push({...op,path:path+'/'+at+op.path});i++;j++;at++;}
   else if(i<n&&dp[i][j]===1+dp[i+1][j]){out.push({op:'remove',path:path+'/'+at});i++;}
   else{out.push({op:'add',path:path+'/'+at,value:clone(y[j])});j++;at++;}
  }return out;
 }
 return [{op:'replace',path,value:clone(y)}];
 }
 const result=diff(a,b,'');if(result.length>MAX_OPS)throw Error('Patch exceeds 1000 operations');return result;
}
function diff(a,b,{mode='structural'}={}){
 if(!['structural','minimum'].includes(mode))throw Error('Unknown diff mode');validate(a);validate(b);if(equal(a,b))return [];
 if(mode==='structural')return structural(a,b);
 // One op is the absolute minimum for unequal documents. Prefer a focused one-op diff.
 let local;try{local=structural(a,b);}catch{local=null;}
 return local&&local.length===1?local:[{op:'replace',path:'',value:clone(b)}];
}
function applyPatch(original,patch){validate(original);validate(patch);if(!Array.isArray(patch)||patch.length>MAX_OPS)throw Error('Patch must be an array of at most 1000 operations');
 let doc=clone(original),inverse=[];
 for(let i=0;i<patch.length;i++){
  const before=doc===ABSENT?ABSENT:clone(doc);
  try{doc=operation(doc,patch[i]);if(doc!==ABSENT)validate(doc);let undo;
   if(doc===ABSENT&&before===ABSENT)undo=[];else if(doc===ABSENT)undo=[{op:'add',path:'',value:before}];else if(before===ABSENT)undo=[{op:'remove',path:''}];else undo=diff(doc,before,{mode:'minimum'});
   inverse=undo.concat(inverse);if(inverse.length>MAX_OPS||JSON.stringify(inverse).length>MAX_CHARS)throw Error('Inverse exceeds operation/size limit');
  }catch(error){throw Error('Operation '+i+': '+error.message+'; transaction rolled back');}
 }
 return {exists:doc!==ABSENT,document:doc===ABSENT?null:doc,inverse};
}
function invertPatch(original,patch){return applyPatch(original,patch).inverse;}
function inspect(a,b){validate(a);validate(b);const rows=[];function walk(x,y,path,hasX=true,hasY=true){if(rows.length>=2000)throw Error('Diff display exceeds 2000 changes');if(!hasX){rows.push({kind:'added',path,before:null,after:clone(y)});return;}if(!hasY){rows.push({kind:'removed',path,before:clone(x),after:null});return;}if(equal(x,y))return;if(isObject(x)&&isObject(y)){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))walk(x[k],y[k],path+'/'+escapeToken(k),own(x,k),own(y,k));}else if(Array.isArray(x)&&Array.isArray(y)){for(let i=0;i<Math.max(x.length,y.length);i++)walk(x[i],y[i],path+'/'+i,i<x.length,i<y.length);}else rows.push({kind:'changed',path,before:clone(x),after:clone(y)});}walk(a,b,'');return rows;}
return {parse,validate,equal,escapeToken,pointer,diff,applyPatch,invertPatch,inspect};
});
