/* Original MIT browser UI. All decoded claims remain literal text. */
(() => {
  'use strict';
  const el = id => document.getElementById(id); let generation = 0;
  function discard(message = 'Inputs changed. Inspect again.') { generation++; el('result').textContent=''; el('output').hidden=true; el('status').textContent=message; }
  document.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => discard()));
  el('run').addEventListener('click', async () => {
    discard('Inspecting locally…'); const own = generation;
    try {
      const result=await JWTInspector.inspect({token:el('token').value,key:el('key').value,now:el('now').value,skew:el('skew').value,expectedIssuer:el('issuer').value,expectedAudience:el('audience').value});
      if (own !== generation) return;
      el('result').textContent=JSON.stringify(result,null,2); el('output').hidden=false;
      el('status').textContent='INSPECTED: signature '+result.signatureStatus+'; '+result.findings.filter(x=>x.severity==='error').length+' errors, '+result.findings.filter(x=>x.severity==='warning').length+' warnings. Claims remain untrusted.';
    } catch (error) { if (own===generation) discard('BLOCKED: '+error.message); }
  });
  el('example').addEventListener('click', () => {
    discard('Unsigned test example loaded. Inspect to see security warnings.');
    const encode = x => btoa(JSON.stringify(x)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const now=Math.floor(Date.now()/1000);
    el('token').value=encode({alg:'none',typ:'JWT'})+'.'+encode({sub:'fictional-demo',iss:'example-issuer',aud:'example-audience',nbf:now-60,exp:now+3600})+'.';
    el('key').value=''; el('now').value=String(now); el('skew').value='0'; el('issuer').value=el('audience').value='';
  });
  el('clear').addEventListener('click', () => { document.querySelectorAll('input,textarea').forEach(input=>input.value=''); discard('Cleared. Token, key and claims discarded.'); });
  el('now').value=String(Math.floor(Date.now()/1000));
})();
