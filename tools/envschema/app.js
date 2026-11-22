/* Original Manykiln browser UI. MIT. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const schema={allowUnknown:false,keys:{APP_NAME:{required:true,type:'string',regex:'^[a-z][a-z0-9-]{1,24}$'},PORT:{required:true,type:'integer',regex:'^[0-9]{2,5}$'},DEBUG:{type:'boolean'},API_TOKEN:{required:true,type:'string',secret:true},MODE:{type:'enum',enum:['dev','test','prod']}}};
  const good='APP_NAME=paper-kite\nPORT=8080\nDEBUG=false\nAPI_TOKEN=fictional-token-alpha\nMODE=test';
  const examples=[
    {name:'Valid template',baseline:good,candidate:good.replace('8080','9090').replace('alpha','beta')},
    {name:'Missing + wrong type',baseline:good,candidate:'APP_NAME=paper-kite\nPORT=eight\nDEBUG=perhaps\nMODE=staging'},
    {name:'Duplicates + quotes',baseline:good,candidate:'APP_NAME=paper-kite\nPORT=8080\nPORT=9090\nAPI_TOKEN="fictional-"quote"\nDEBUG=false'},
    {name:'Added + removed keys',baseline:good,candidate:good.replace('DEBUG=false\n','')+'\nEXTRA_LABEL=hello'}
  ];
  let report=null;
  function invalidate(message='Inputs changed. Run validation to refresh the report.'){
    report=null;$('export').disabled=true;$('result').hidden=true;$('rows').replaceChildren();$('json').textContent='';$('status').textContent=message;$('status').dataset.tone='neutral';
  }
  function load(index){invalidate('Fictional example loaded. Run validation.');$('schema').value=JSON.stringify(schema,null,2);$('baseline').value=examples[index].baseline;$('candidate').value=examples[index].candidate;}
  examples.forEach((e,i)=>{const b=document.createElement('button');b.type='button';b.textContent=e.name;b.addEventListener('click',()=>load(i));$('examples').append(b);});
  for(const id of ['schema','baseline','candidate']) $(id).addEventListener('input',()=>invalidate());
  $('mask').addEventListener('change',()=>invalidate());
  $('clear').addEventListener('click',()=>{for(const id of ['schema','baseline','candidate']) $(id).value='';$('mask').checked=true;invalidate('Cleared. Paste fictional templates and a schema.');});
  $('run').addEventListener('click',()=>{
    invalidate('Validating locally…');
    try{
      if(!$('schema').value.trim()) throw Error('Missing JSON schema.');
      if($('schema').value.length>100000) throw Error('Schema exceeds 100000 characters.');
      let spec;try{spec=JSON.parse($('schema').value);}catch{throw Error('Schema is not valid JSON.');}
      report=EnvSchema.inspect({schema:spec,baseline:$('baseline').value,candidate:$('candidate').value,maskSecrets:$('mask').checked});
      $('json').textContent=JSON.stringify(report,null,2);
      for(const row of report.rows){const tr=document.createElement('tr');for(const value of [row.key,row.change,row.before===null?'—':row.before,row.after===null?'—':row.after]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('rows').append(tr);}
      $('status').textContent=(report.valid?'VALID':'ISSUES FOUND')+' · '+report.candidateErrors.length+' candidate issues · '+report.baselineErrors.length+' baseline issues · '+(report.maskSecrets?'secret-like values masked':'masking OFF — fictional data only');
      $('status').dataset.tone=report.valid?'good':'bad';$('result').hidden=false;$('export').disabled=false;
    }catch(error){invalidate('BLOCKED: '+error.message);$('status').dataset.tone='bad';}
  });
  $('export').addEventListener('click',()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='envschema-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  load(0);
})();
