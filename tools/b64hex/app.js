/* MIT */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let revision = 0;
  function invalidate(message = 'Inputs changed. Run again.') {
    revision++;
    $('output').hidden = true;
    $('report').textContent = ''; $('generated').textContent = '';
    $('copy-report').disabled = true; $('copy-generated').disabled = true;
    $('status').textContent = message;
  }
  function render(report, output, message) {
    $('report').textContent = JSON.stringify(report, null, 2);
    $('generated').textContent = output;
    $('copy-report').disabled = false; $('copy-generated').disabled = output.length === 0;
    $('output').hidden = false; $('status').textContent = message;
  }
  for (const [button, target] of [['copy-report', 'report'], ['copy-generated', 'generated']]) {
    $(button).addEventListener('click', async () => {
      const rev = revision, text = $(target).textContent;
      if (!text) return;
      try { await navigator.clipboard.writeText(text); if (rev === revision) $('status').textContent = 'Copied.'; }
      catch {
        if (rev !== revision) return;
        const range = document.createRange(); range.selectNodeContents($(target));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        $(target).focus(); $('status').textContent = 'Clipboard unavailable. Text selected; copy manually.';
      }
    });
  }
  for (const id of ['input', 'from', 'to']) {
    $(id).addEventListener('input', () => invalidate());
    $(id).addEventListener('change', () => invalidate());
  }
  $('run').addEventListener('click', () => {
    invalidate('Converting locally…');
    try {
      const { output, ...report } = B64Hex.convert($('input').value, $('from').value, $('to').value);
      render(report, output, report.byteLength + ' byte(s). ' + (report.utf8Valid ? 'Well-formed UTF-8.' : 'Binary bytes; invalid UTF-8.'));
    } catch (e) { $('status').textContent = e.message; }
  });
  $('example').addEventListener('click', () => { $('from').value = 'utf8'; $('to').value = 'base64'; $('input').value = 'Fictional kiln · 雪 🔥'; invalidate('Fictional example loaded. Convert to inspect.'); });
  $('clear').addEventListener('click', () => { $('input').value = ''; $('from').value = 'utf8'; $('to').value = 'base64'; invalidate('Cleared. No input is retained.'); });
})();
