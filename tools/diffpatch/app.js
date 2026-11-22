/* Original clean-room UI. MIT license. */
'use strict';
const $=id=>document.getElementById(id), D=globalThis.DiffPatch;
let current=null;const imported={};
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
$('theme').addEventListener('change',()=>{document.documentElement.dataset.theme=$('theme').value;});
function invalidate(){current=null;$('download').disabled=true;$('result').hidden=true;$('side').replaceChildren();$('hunks').replaceChildren();$('patch-output').textContent='';$('status').textContent='Inputs changed. Compare to refresh.';}
for(const id of ['before','after'])$(id).addEventListener('input',()=>{delete imported[id];invalidate();});
for(const id of ['whitespace','casefold'])$(id).addEventListener('change',invalidate);
function invalidateInspect(){$('inspect-hunks').replaceChildren();$('inspect-status').textContent='Patch changed. Inspect to refresh.';}
$('patch-input').addEventListener('input',()=>{delete imported['patch-input'];invalidateInspect();});
for(const [file,target,clear]of [['before-file','before',invalidate],['after-file','after',invalidate],['patch-file','patch-input',invalidateInspect]]){
 let version=0;
 $(target).addEventListener('input',()=>version++);
 $(file).addEventListener('change',async()=>{
   const ticket=++version,f=$(file).files[0];clear();if(!f)return;
   try{if(f.size>4000000)throw Error('File too large (maximum 4 MB UTF-8).');const text=await f.text();if(ticket!==version)return;if(text.length>2000000)throw Error('Maximum 2,000,000 characters.');$(target).value=text;imported[target]=text;clear();}
   catch(e){(target==='patch-input'?$('inspect-status'):$('status')).textContent=e.message;}
 });
}
function showView(){$('side').hidden=$('view').value!=='side';$('unified').hidden=$('view').value!=='unified';}
$('view').addEventListener('change',showView);
$('compare').addEventListener('click',()=>{
 invalidate();
 try{
   const before=imported.before??$('before').value,after=imported.after??$('after').value;
   const result=D.diff(before,after,{whitespace:$('whitespace').checked,casefold:$('casefold').checked}), patch=D.unified(before,after),hs=D.hunks(result);
   const table=node('table'),head=node('thead'),hr=node('tr');for(const s of ['Old #','Before','New #','After'])hr.append(node('th',s));head.append(hr);table.append(head);const body=node('tbody');let rendered=0;
   function row(a,b,kind){if(rendered++>=1500)return;const tr=node('tr',undefined,kind);tr.append(node('td',a?String(a.old):'','number'),node('td',a?a.a.text+(a.a.nl?' ↵':' ∅'):''),node('td',b?String(b.next):'','number'),node('td',b?b.b.text+(b.b.nl?' ↵':' ∅'):''));body.append(tr);}
   for(let i=0;i<result.ops.length;){
     const op=result.ops[i];if(op.type==='equal'){row(op,op,'');i++;continue;}
     const dels=[],adds=[];while(i<result.ops.length&&result.ops[i].type!=='equal'){const o=result.ops[i++];(o.type==='delete'?dels:adds).push(o);}
     for(let j=0;j<Math.max(dels.length,adds.length);j++)row(dels[j],adds[j],adds[j]?'add':'delete');
   }
   table.append(body);$('side').append(table);$('patch-output').textContent=patch||'(No exact changes.)';
   hs.forEach(h=>$('hunks').append(node('li',`${D.header(h)} · +${h.added} / −${h.deleted}`)));
   current=patch;$('download').disabled=!patch;$('result').hidden=false;showView();
   $('status').textContent=`${result.oldLines} → ${result.newLines} lines · ${result.distance} line edits · ${hs.length} display hunks. ${patch?'Exact patch ready.':'No exact changes.'}`;
 }catch(e){invalidate();$('status').textContent='Error: '+e.message;}
});
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download').addEventListener('click',()=>{if(current)download(current,'comparison.patch','text/x-diff;charset=utf-8');});
$('inspect').addEventListener('click',()=>{
 invalidateInspect();try{const r=D.inspect(imported['patch-input']??$('patch-input').value);$('inspect-status').textContent=`Valid unified patch · ${r.files.length} files · ${r.hunks.length} hunks · +${r.added} / −${r.deleted}`;
 for(const f of r.files){$('inspect-hunks').append(node('li',`${f.old} → ${f.next}`));for(const h of f.hunks)$('inspect-hunks').append(node('li',`${D.header(h)} · +${h.added} / −${h.deleted}`));}
 }catch(e){$('inspect-status').textContent='Invalid patch: '+e.message;}
});
