/* Original MIT UI. Input enters the DOM only through textContent. */
'use strict';
const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let result=null,generation=0;
function invalidate(message='Inputs changed. Inspect again.'){generation++;result=null;$('results').hidden=true;$('json').disabled=$('markdown').disabled=true;$('status').textContent=message;}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cardMetric(value,label){const e=node('div',undefined,'metric');e.append(node('strong',value),node('span',label));return e;}
function show(){
 const before=SQLSchema.parse($('before').value,$('dialect').value),hasAfter=$('after').value.trim().length>0,after=hasAfter?SQLSchema.parse($('after').value,$('dialect').value):null,schema=after||before;
 const diagnostics=[...SQLSchema.lint(before).map(x=>({...x,message:'v1 · '+x.message})),...(after?SQLSchema.lint(after).map(x=>({...x,message:'v2 · '+x.message})):[])],changes=after?SQLSchema.diff(before,after):[];
 const map=document.createDocumentFragment();
 for(const table of schema.tables){
  const box=node('article',undefined,'table-card');box.append(node('h3',table.name));
  const list=node('ul',undefined,'columns');for(const c of table.columns)list.append(node('li',(c.primaryKey?'◆ ':'')+c.name+' · '+c.type+(c.notNull?' · NOT NULL':'')+(c.unique||table.unique.some(u=>u.length===1&&u[0]===c.key)?' · UNIQUE':'')));box.append(list);
  for(const fk of table.foreignKeys)box.append(node('p','↗ ('+fk.columns.join(', ')+') → '+fk.table+' ('+(fk.refColumns||[]).join(', ')+')','relation'));
  if(table.primaryKey.length>1)box.append(node('p','Composite PK: '+table.primaryKey.join(', '),'relation'));
  for(const u of table.unique)if(u.length>1)box.append(node('p','UNIQUE: '+u.join(', '),'relation'));
  for(const idx of table.indexes)box.append(node('p','Index '+idx.name+' ('+idx.columns.join(', ')+')'+(idx.usable?'':' [excluded from FK coverage]'),'hint'));
  map.append(box);
 }
 $('map').replaceChildren(map);
 $('metrics').replaceChildren(cardMetric(schema.tables.length,'tables'),cardMetric(schema.tables.reduce((n,t)=>n+t.columns.length,0),'columns'),cardMetric(schema.tables.reduce((n,t)=>n+t.foreignKeys.length,0),'relationships'),cardMetric(changes.filter(x=>x.severity==='danger').length,'destructive changes'));
 const issues=[...changes,...diagnostics],fragment=document.createDocumentFragment();
 if(!issues.length)fragment.append(node('p',hasAfter?'No structural changes or lint findings in the supported subset.':'No lint findings in the supported subset.'));
 for(const issue of issues){const row=node('div',undefined,'issue '+issue.severity);row.append(node('strong',issue.code),node('span',issue.message));fragment.append(row);}
 $('issues').replaceChildren(fragment);result={version: '1.0.0',schema,diagnostics,changes};$('results').hidden=false;$('json').disabled=$('markdown').disabled=false;$('status').textContent='Inspected '+schema.tables.length+' tables · '+issues.length+' findings.';
}
$('run').onclick=()=>{invalidate('Inspecting…');try{show();}catch(e){$('status').textContent='Error: '+e.message;}};
for(const id of ['before','after','dialect'])$(id).addEventListener('input',()=>invalidate());
for(const id of ['before','after'])$('file-'+id).onchange=async()=>{
 const file=$('file-'+id).files[0];invalidate('Reading local file…');const ticket=generation;if(!file)return;
 try{if(file.size>2000000)throw Error('File limit: 2 MB');const text=await file.text();if(ticket!==generation)return;$(id).value=text;invalidate('Imported '+id+' locally. Inspect to continue.');}catch(e){if(ticket===generation)invalidate('Error: '+e.message);}finally{$('file-'+id).value='';}
};
$('clear').onclick=()=>{$('before').value=$('after').value='';invalidate('Cleared.');};
$('sample').onclick=()=>{$('dialect').value='postgres';$('before').value='CREATE TABLE projects (id BIGINT PRIMARY KEY, title VARCHAR(120) NOT NULL);\nCREATE TABLE tasks (id BIGINT PRIMARY KEY, project_id BIGINT REFERENCES projects(id), title TEXT, obsolete TEXT);';$('after').value='CREATE TABLE projects (id BIGINT PRIMARY KEY, title VARCHAR(60) NOT NULL);\nCREATE TABLE tasks (id BIGINT PRIMARY KEY, project_id BIGINT REFERENCES projects(id), title TEXT);\nCREATE INDEX tasks_project_idx ON tasks(project_id);';invalidate('Fictional schemas loaded.');};
$('json').onclick=()=>{if(result)download(JSON.stringify(result,null,2)+'\n','schema.json','application/json');};
$('markdown').onclick=()=>{if(result)download(SQLSchema.markdown(result.schema),'schema.md','text/markdown');};
$('theme').onchange=()=>{document.documentElement.dataset.theme=$('theme').value;};
