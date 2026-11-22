/* Original Manykiln UI. MIT License. */
'use strict';
const $ = id => document.getElementById(id);
let current = null, timer = null;
const example = '# Field notes\n\n### A skipped level\n\n[Missing section](#missing) and [valid section](#field-notes).\n\n## Checklist\n\n- [x] Works offline\n- [ ] Fix these warnings\n\n| Item | State |\n| --- | --- |\n| Preview | Safe | Extra column |\n\n```\nconst local = true;\n```\n\n## Checklist\n\nA line with trailing spaces.  \n\n> Raw HTML is text: <img src=x onerror=alert(1)>\n';
function invalidate() { clearTimeout(timer); current = null; $('export').disabled = true; $('preview').replaceChildren(); $('issues').replaceChildren(); $('summary').textContent = 'Checking current input…'; $('status').textContent = 'Checking…'; }
function run() {
  clearTimeout(timer);
  try {
    const report = MarkdownLint.analyze($('source').value);
    MarkdownLint.render(report, $('preview')); current = report; $('export').disabled = false;
    $('summary').textContent = report.stats.lines + ' lines · ' + report.stats.headings + ' headings · ' + report.stats.issues + ' issues';
    $('issues').replaceChildren();
    for (const issue of report.diagnostics) {
      const li = document.createElement('li'), button = document.createElement('button'); button.className = 'issue'; button.textContent = 'L' + issue.line + ':' + issue.column + ' · ' + issue.rule + ' — ' + issue.message;
      button.addEventListener('click', () => { const lines = $('source').value.split('\n'); const start = lines.slice(0, issue.line - 1).join('\n').length + (issue.line > 1 ? 1 : 0); $('source').focus(); $('source').setSelectionRange(start, start + (lines[issue.line - 1] || '').length); }); li.appendChild(button); $('issues').appendChild(li);
    }
    $('status').textContent = report.diagnostics.length ? report.diagnostics.length + ' issues to review. Select an issue to focus its source line.' : 'No structural issues found.';
  } catch (e) { current = null; $('export').disabled = true; $('preview').replaceChildren(); $('issues').replaceChildren(); $('summary').textContent = 'Input error'; $('status').textContent = e.message; }
}
$('source').addEventListener('input', () => { invalidate(); timer = setTimeout(run, 120); });
$('example').addEventListener('click', () => { $('source').value = example; invalidate(); run(); });
$('clear').addEventListener('click', () => { $('source').value = ''; invalidate(); run(); $('source').focus(); });
$('theme').addEventListener('change', () => { document.documentElement.dataset.theme = $('theme').value; });
$('export').addEventListener('click', () => {
  if (!current) return;
  const text = JSON.stringify({ version: '1.0.0', stats: current.stats, headings: current.headings, diagnostics: current.diagnostics }, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'markdown-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('status').textContent = 'Report downloaded for the current document.';
});
