/* Original MIT browser UI. All untrusted content is rendered as literal text. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  let generation = 0, current = null;
  function discard(message = 'Inputs changed. Run again.') {
    generation++; current = null; el('result').textContent = ''; el('output').hidden = true;
    el('export-json').disabled = el('export-curl').disabled = true; el('status').textContent = message;
  }
  document.querySelectorAll('input,textarea,select').forEach(input => input.addEventListener('input', () => discard()));
  async function run(action) {
    discard('Working locally…'); const own = generation;
    try {
      const result = await WebhookReplay.analyze({action,mode:el('mode').value,payload:el('payload').value,secret:el('secret').value,signature:el('signature').value,timestamp:el('timestamp').value,now:el('now').value,tolerance:el('tolerance').value});
      if (generation !== own) return;
      current = result; el('result').textContent = JSON.stringify(result,null,2); el('output').hidden = false;
      el('export-json').disabled = el('export-curl').disabled = false;
      el('status').textContent = action === 'generate' ? 'GENERATED locally. Review timestamp freshness separately.' : result.signatureMatch ? 'MATCH: HMAC matches. ' + (result.freshness.checked ? result.freshness.fresh ? 'Timestamp is within tolerance.' : 'Timestamp is OUTSIDE tolerance.' : 'Replay freshness not checked.') : 'MISMATCH: HMAC does not match.';
    } catch (error) { if (generation === own) discard('BLOCKED: ' + error.message); }
  }
  el('verify').addEventListener('click', () => run('verify'));
  el('generate').addEventListener('click', () => run('generate'));
  function download(kind) {
    if (!current) return;
    const fixture = WebhookReplay.fixture(current);
    const blob = new Blob([kind === 'json' ? JSON.stringify(fixture,null,2)+'\n' : '# Redacted template; replace placeholders and re-sign.\n'+fixture.curl+'\n'],{type:kind === 'json' ? 'application/json' : 'text/plain'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download='webhook-redacted.'+(kind === 'json' ? 'json' : 'txt'); link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  el('export-json').addEventListener('click', () => download('json'));
  el('export-curl').addEventListener('click', () => download('curl'));
  el('example').addEventListener('click', () => {
    discard('Example loaded. Disposable key; generate then verify a signature.');
    el('mode').value='github'; el('secret').value='fictional-test-key-for-local-debugging'; el('payload').value='{"event":"example","id":"evt_test_001"}'; el('signature').value='';
    el('timestamp').value=el('now').value=String(Math.floor(Date.now()/1000)); el('tolerance').value='300';
  });
  el('clear').addEventListener('click', () => { document.querySelectorAll('input,textarea').forEach(input => input.value=''); el('mode').value='github'; discard('Cleared. Keys and results discarded.'); });
  el('now').value=String(Math.floor(Date.now()/1000));
})();
