/* MIT. Local DOM text rendering; inputs never become markup. */
'use strict';
(()=>{const $=id=>document.getElementById(id);let current=null,generation=0;
const status=s=>$('status').textContent=s;
function invalidate(){generation++;current=null;$('output').hidden=true;$('report').textContent='';$('preview').replaceChildren();$('export-csv').disabled=true;$('export-json').disabled=true;status('Ready · results clear when inputs change.');}
function cell(row,value,tag='td'){const c=document.createElement(tag);c.textContent=value;row.append(c);}
function render(v){current=v;$('output').hidden=false;$('export-csv').disabled=false;$('export-json').disabled=false;
 $('report').textContent=JSON.stringify(v.report,null,2);$('summary').textContent=v.report.dataRows+' data rows · '+v.report.columns+' columns · '+v.report.issueCount+' findings';
 const head=document.createElement('tr');v.headers.forEach(h=>cell(head,h,'th'));$('preview').append(head);
 v.rows.slice(0,20).forEach(row=>{const tr=document.createElement('tr');row.forEach((s,i)=>cell(tr,v.pii.has(i)&&$('redact').checked?'[REDACTED]':s));$('preview').append(tr);});
 status(v.report.valid?'VALID · schema and key checks passed. Review line-ending notes.':'FINDINGS · review row and column diagnostics.');}
async function run(){invalidate();const ticket=generation;status('Validating locally…');let reader;
 try{
  const validator=new CSVSchema.Validator($('schema').value),parser=new CSVSchema.CSVParser({delimiter:$('delimiter').value,onRow:(r,n)=>validator.accept(r,n)}),file=$('file').files[0];
  if(file){if(file.size>30000000)throw Error('File exceeds 30 MB byte envelope.');reader=file.stream().getReader();const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
   while(true){const chunk=await reader.read();if(ticket!==generation){await reader.cancel();return;}if(chunk.done)break;parser.push(decoder.decode(chunk.value,{stream:true}));}
   parser.push(decoder.decode());
  }else parser.push($('csv').value);
  const report=validator.finish(parser.finish());if(ticket!==generation)return;render(validator);
 }catch(e){if(ticket===generation){invalidate();status('BLOCKED: '+e.message);}}
 finally{if(reader)reader.releaseLock();}
}
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('run').addEventListener('click',run);
$('detect').addEventListener('click',()=>{invalidate();try{const r=CSVSchema.detectDelimiter($('csv').value);$('delimiter').value=r.delimiter;status((r.ambiguous?'AMBIGUOUS · choose delimiter manually. ':'Detected delimiter · ')+JSON.stringify(r.candidates));}catch(e){status('BLOCKED: '+e.message);}});
$('export-csv').addEventListener('click',()=>{if(current)download(current.exportCSV({redact:$('redact').checked}),'csvschema-'+($('redact').checked?'redacted':'unredacted')+'.csv','text/csv;charset=utf-8');});
$('export-json').addEventListener('click',()=>{if(current)download(JSON.stringify(current.report,null,2),'csvschema-report.json','application/json');});
for(const id of ['csv','schema','delimiter','file'])$(id).addEventListener(id==='file'?'change':'input',invalidate);
$('redact').addEventListener('change',()=>{if(current){const v=current;$('preview').replaceChildren();render(v);}});
$('clear').addEventListener('click',()=>{invalidate();$('csv').value='';$('file').value='';$('schema').value='{}';$('redact').checked=true;status('Cleared · memory released.');});
$('example').addEventListener('click',()=>{invalidate();$('file').value='';$('delimiter').value=',';$('redact').checked=true;$('csv').value='id,email,quantity,day\r\nA1,alex@example.invalid,3,2028-02-29\r\nA1,sam@example.invalid,oops,2027-02-29\r\nA3,lee@example.invalid,4\r\n';$('schema').value=JSON.stringify({columns:[{name:'quantity',type:'integer',required:true,min:0},{name:'day',type:'date',required:true}],uniqueKeys:[['id']]},null,2);status('Example loaded · synthetic data.');});
})();
