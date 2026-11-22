/* MIT */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let revision = 0;
  function invalidate(message = 'Inputs changed. Analyze again.') {
    revision++; $('output').hidden=true; $('report').textContent=''; $('findings').replaceChildren(); $('copy-report').disabled=true;
    if($('generated')) { $('generated').textContent=''; $('copy-generated').disabled=true; }
    $('status').textContent=message;
  }
  function render(result) {
    $('report').textContent=JSON.stringify(result,null,2);
    for(const f of result.findings) { const li=document.createElement('li'); li.textContent=f.severity.toUpperCase()+' · '+f.code+(f.line?' · line '+f.line:'')+(f.source?' · '+f.source:'')+': '+f.message; $('findings').append(li); }
    if(!result.findings.length) { const li=document.createElement('li');li.textContent='No findings in the supported checks. This is not proof of deployment correctness.';$('findings').append(li); }
    if($('generated')) { $('generated').textContent=result.generated; $('copy-generated').disabled=false; }
    $('output').hidden=false;$('copy-report').disabled=false;$('status').textContent=result.findings.length+' finding(s). '+result.notice;
  }
  for(const [button,target] of [['copy-report','report'],['copy-generated','generated']]) {
    if(!$(button))continue;
    $(button).addEventListener('click',async()=>{
      const rev=revision,text=$(target).textContent;if(!text)return;
      try { await navigator.clipboard.writeText(text);if(rev===revision)$('status').textContent='Copied '+(target==='report'?'report.':'draft. Review before use.'); }
      catch { if(rev!==revision)return;const range=document.createRange();range.selectNodeContents($(target));const s=window.getSelection();s.removeAllRanges();s.addRange(range);$(target).focus();$('status').textContent='Clipboard unavailable. Text selected; copy manually.'; }
    });
  }
  for(const id of ['code','headers','cache','origin','methods','allowHeaders','exposeHeaders','maxAge','credentials']) { $(id).addEventListener('input',()=>invalidate()); $(id).addEventListener('change',()=>invalidate()); }
  $('run').addEventListener('click',()=>{invalidate('Analyzing locally…');try{render(HTTPRef.inspect($('code').value,$('headers').value));}catch(e){$('status').textContent=e.message;}});
  $('generate').addEventListener('click',()=>{invalidate('Generating locally…');try{const r=HTTPRef.generate({status:$('code').value,cache:$('cache').value,origin:$('origin').value,methods:$('methods').value,allowHeaders:$('allowHeaders').value,exposeHeaders:$('exposeHeaders').value,maxAge:$('maxAge').value,credentials:$('credentials').value==='yes'});$('headers').value=r.headers.map(h=>h.name+': '+h.value).join('\n');render(r);}catch(e){$('status').textContent=e.message;}});
  $('example').addEventListener('click',()=>{$('code').value='200';$('headers').value='Cache-Control: public, private, max-age=60, max-age=120\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true';invalidate('Fictional conflicting headers loaded. Analyze to inspect.');});
  $('clear').addEventListener('click',()=>{$('code').value='200';$('headers').value='';$('cache').value='';$('origin').value='';$('methods').value='';$('allowHeaders').value='';$('exposeHeaders').value='';$('maxAge').value='';$('credentials').value='no';invalidate('Cleared. No headers are retained.');});
})();
