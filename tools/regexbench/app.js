/* MIT. Strict DOM text nodes, including match and group highlighting. */
'use strict';
(()=>{const $=id=>document.getElementById(id);let current=null,lintKey=null;
const status=s=>$('status').textContent=s;
function invalidate(){current=null;lintKey=null;$('allow-risk').checked=false;$('output').hidden=true;$('report').textContent='';$('highlight').replaceChildren();$('groups').replaceChildren();$('risks').textContent='Analyze the pattern before running.';$('run').disabled=true;$('export-json').disabled=true;status('Ready · lint first.');}
const key=()=>JSON.stringify([$('pattern').value,$('flags').value]);
function lint(){invalidate();try{const a=RegexBench.analyze($('pattern').value,$('flags').value);lintKey=key();$('risks').textContent=a.risky?'RISK · '+a.findings.map(f=>f.code+': '+f.detail).join('\n'):'No static risk found in supported syntax. This is not proof of safety.';$('run').disabled=false;status(a.risky?'RISK FLAGGED · bounded execution requires explicit opt-in.':'ANALYZED · ready for a bounded test.');}catch(e){status('BLOCKED: '+e.message);}}
function span(text,kind){const n=document.createElement(kind==='match'?'mark':'span');n.className=kind;n.textContent=text;return n;}
function render(r){current=r;$('output').hidden=false;$('report').textContent=JSON.stringify(r,null,2);$('export-json').disabled=false;const text=$('text').value;let offset=0;
 for(const m of r.matches){$('highlight').append(document.createTextNode(text.slice(offset,m.start)));$('highlight').append(span(m.value||'∅','match'));offset=m.end;
  const box=document.createElement('div');box.className='group-card';const title=document.createElement('strong');title.textContent='Match ['+m.start+', '+m.end+')';box.append(title);
  for(const g of m.groups){const row=document.createElement('p');row.append(document.createTextNode('Group '+g.id+' '+(g.span?'['+g.span.join(', ')+')':'unmatched')+' '));row.append(span(g.value===null?'—':g.value||'∅','capture'));box.append(row);}$('groups').append(box);
 }
 $('highlight').append(document.createTextNode(text.slice(offset)));status(r.status.toUpperCase()+' · '+r.steps+' steps · '+r.matches.length+' matches'+(r.complete?'':' · INCOMPLETE, no full-input conclusion.'));}
$('lint').addEventListener('click',lint);
$('run').addEventListener('click',()=>{current=null;$('output').hidden=true;$('report').textContent='';$('highlight').replaceChildren();$('groups').replaceChildren();$('export-json').disabled=true;
 try{if(lintKey!==key())throw Error('Analyze the current pattern first.');const r=RegexBench.run($('pattern').value,$('text').value,{flags:$('flags').value,stepLimit:Number($('steps').value),allowRisk:$('allow-risk').checked,global:$('global').checked});render(r);}catch(e){status('BLOCKED: '+e.message);}});
for(const id of ['pattern','flags'])$(id).addEventListener('input',invalidate);
for(const id of ['text','steps','global','allow-risk'])$(id).addEventListener('input',()=>{current=null;$('output').hidden=true;$('report').textContent='';$('highlight').replaceChildren();$('groups').replaceChildren();$('export-json').disabled=true;status('Test input changed · prior result cleared.');});
$('example').addEventListener('click',()=>{invalidate();$('pattern').value='(?<key>[A-Z]+)-(\\d+)';$('text').value='TASK-42 and BUG-7';$('flags').value='';$('steps').value='50000';$('global').checked=true;status('Example loaded · analyze next.');});
$('risk-example').addEventListener('click',()=>{invalidate();$('pattern').value='^(a+)+$';$('text').value='a'.repeat(28)+'!';$('flags').value='';$('steps').value='2000';$('global').checked=true;status('Risk example loaded · analyze before running.');});
$('clear').addEventListener('click',()=>{invalidate();$('pattern').value='';$('text').value='';$('flags').value='';status('Cleared · memory released.');});
$('export-json').addEventListener('click',()=>{if(!current)return;const summary={status:current.status,complete:current.complete,steps:current.steps,matchCount:current.matches.length,findings:current.findings,note:'Pattern, input, matched values and captures omitted for privacy.'};const url=URL.createObjectURL(new Blob([JSON.stringify(summary,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='regexbench-summary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
})();
