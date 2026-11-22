/* Original clean-room UI. MIT license. */
'use strict';
const $=id=>document.getElementById(id),C=globalThis.CSVClean;
let current=null,fileVersion=0,imported=null;
function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function delim(id){return $(id).value==='tab'?'\t':$(id).value;}
$('theme').addEventListener('change',()=>document.documentElement.dataset.theme=$('theme').value);
function invalidate(){current=null;$('result').hidden=true;$('preview').replaceChildren();$('warning').textContent='';$('diagnostics').textContent='';$('status').textContent='Inputs changed. Clean to refresh.';for(const id of ['csv','json','markdown'])$(id).disabled=true;}
$('input').addEventListener('input',()=>{fileVersion++;imported=null;invalidate();});
$('order').addEventListener('input',invalidate);
for(const id of ['delimiter','width','trim','dedupe','header','warn'])$(id).addEventListener('change',invalidate);
$('file').addEventListener('change',async()=>{
 const version=++fileVersion,f=$('file').files[0];invalidate();if(!f)return;
 try{if(f.size>4000000)throw Error('File too large (maximum 4 MB UTF-8).');const text=await f.text();if(version!==fileVersion)return;if(text.length>2000000)throw Error('Maximum 2,000,000 characters.');$('input').value=text;imported=text;invalidate();}catch(e){$('status').textContent='Error: '+e.message;}
});
$('clean').addEventListener('click',()=>{
 invalidate();try{
   const text=imported??$('input').value,d=$('delimiter').value==='auto'?C.detect(text):delim('delimiter'),source=C.parse(text,d),options={width:$('width').value,trim:$('trim').checked,dedupe:$('dedupe').checked,header:$('header').checked,order:$('order').value};
   const result=C.transform(source,options),table=node('table'),body=node('tbody');
   result.rows.slice(0,200).forEach((r,i)=>{const tr=node('tr');r.slice(0,40).forEach(c=>tr.append(node(options.header&&i===0?'th':'td',c)));body.append(tr);});table.append(body);$('preview').append(table);
   $('status').textContent=`Delimiter: ${d==='\t'?'tab':d} · ${source.length} → ${result.rows.length} rows · ${result.width} columns · ${result.duplicates} duplicate rows removed · ${result.padded} cells padded · ${result.truncated} cells dropped.`;
   $('diagnostics').textContent=result.jagged.length?`${result.jagged.length} jagged rows: `+result.jagged.slice(0,20).map(r=>`${r.row} (${r.width}/${r.expected})`).join(', ')+(result.jagged.length>20?' …':''):'No jagged source rows.';
   $('warning').textContent=$('warn').checked?(result.warnings.length?`Warning: ${result.warnings.length} possible spreadsheet-formula cells (row:column): `+result.warnings.slice(0,20).map(w=>`${w.row}:${w.column}`).join(', ')+'. Values are unchanged; review before opening exports in a spreadsheet.':'No formula-like cells detected. This is a heuristic, not a security guarantee.'):'Formula-injection warnings are disabled. Exported values are unchanged.';
   current={rows:result.rows,header:options.header};$('result').hidden=false;for(const id of ['csv','json','markdown'])$(id).disabled=false;
 }catch(e){invalidate();$('status').textContent='Error: '+e.message;}
});
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const id of ['csv','json','markdown'])$(id).addEventListener('click',()=>{
 if(!current)return;
 try{const text=id==='csv'?C.csv(current.rows,delim('export-delimiter')):id==='json'?C.json(current.rows):C.markdown(current.rows,current.header);download(text,'cleaned.'+(id==='markdown'?'md':id),id==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8');}catch(e){$('status').textContent='Export error: '+e.message;}
});
