/* Original MIT, 2026 Manykiln. Untrusted content is rendered only as text. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);let exported=null;
 function invalidate(message='Inputs changed. Compute or apply again.'){exported=null;$('export').disabled=true;$('output').hidden=true;$('result').textContent='';$('inverse').textContent='';$('diff-rows').replaceChildren();$('status').className='';$('status').textContent=message;}
 function render(result,changes,title){
  $('result-title').textContent=title;$('result').textContent=JSON.stringify(result,null,2);$('inverse').textContent=JSON.stringify(result.inverse,null,2);
  for(const change of changes){const tr=document.createElement('tr');for(const v of [change.kind,change.path===''?'"" (root)':change.path,change.kind==='added'?'(absent)':JSON.stringify(change.before,null,2),change.kind==='removed'?'(absent)':JSON.stringify(change.after,null,2)]){const td=document.createElement('td'),pre=document.createElement('pre');pre.textContent=v;td.append(pre);tr.append(td);}$('diff-rows').append(tr);}
  exported={tool:'jsonpatchdiff',version:1,...result};$('output').hidden=false;$('export').disabled=false;
 }
 document.querySelectorAll('textarea,select').forEach(x=>x.addEventListener('input',()=>invalidate()));
 function action(kind){invalidate('Computing…');try{
  const original=JSONPatchDiff.parse($('before').value);let patch,target;
  if(kind==='compute'){target=JSONPatchDiff.parse($('after').value);patch=JSONPatchDiff.diff(original,target,{mode:$('mode').value});}
  else patch=JSONPatchDiff.parse($('patch').value);
  const applied=JSONPatchDiff.applyPatch(original,patch);
  if(kind==='compute'&&(!applied.exists||!JSONPatchDiff.equal(applied.document,target)))throw Error('Internal diff validation failed');
  const changes=applied.exists?JSONPatchDiff.inspect(original,applied.document):[{kind:'removed',path:'',before:original,after:null}];
  if(kind==='compute')$('patch').value=JSON.stringify(patch,null,2);
  render({action:kind,strategy:kind==='compute'?$('mode').value:null,patch,...applied},changes,kind==='invert'?'Inverse patch built (preview only)':'Validated transaction result');
  $('status').textContent=kind==='invert'?'VALID — inverse shown below; original input unchanged.':!applied.exists?'VALID — root removed; exists:false means no document (not JSON null).':'VALID — '+patch.length+' operations committed on a private clone; original input unchanged.';
 }catch(error){invalidate('BLOCKED: '+error.message);$('status').className='error';}}
 $('compute').addEventListener('click',()=>action('compute'));$('apply').addEventListener('click',()=>action('apply'));$('invert').addEventListener('click',()=>action('invert'));
 $('clear').addEventListener('click',()=>{for(const id of ['before','after','patch'])$(id).value='';invalidate('Cleared. Enter JSON documents or a patch.');});
 $('example').addEventListener('click',()=>{$('before').value=JSON.stringify({'a/b':{'~key':1},items:['red','blue']},null,2);$('after').value=JSON.stringify({'a/b':{'~key':2},items:['red','green','blue']},null,2);$('patch').value='[]';invalidate('Made-up escaped-key example loaded. Compute to inspect.');});
 $('export').addEventListener('click',()=>{if(!exported)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='jsonpatchdiff-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
})();
