/* Original Manykiln UI. MIT license. */
'use strict';
const $ = id => document.getElementById(id);
const source = $('source'), other = $('other'), output = $('output');
let revision = 0, parsedSource = null;
function cell(row, text, tag = 'td') { const el = document.createElement(tag); el.textContent = text; row.append(el); return el; }
function display(v) { return v === null ? '〈absent〉' : v === '' ? '〈empty〉' : v; }
function invalidate(message = 'Input changed. Inspect to refresh results.') {
  revision++; parsedSource = null; output.value = ''; $('copy').disabled = $('download').disabled = $('add').disabled = $('apply').disabled = true;
  $('components').tBodies[0].replaceChildren(); $('diff').tBodies[0].replaceChildren(); $('queryRows').replaceChildren(); $('copyStatus').textContent = ''; $('status').textContent = message;
}
function pending() { revision++; output.value = ''; $('copy').disabled = $('download').disabled = true; $('copyStatus').textContent = ''; $('status').textContent = 'Pending query edits. Apply to refresh the URL and diff.'; }
function addRow(entry) {
  const n = $('queryRows').children.length + 1, row = document.createElement('div'); row.className = 'query-row';
  for (const [field, title] of [['key','Key'],['value','Value']]) {
    const label = document.createElement('label'); label.textContent = title;
    const input = document.createElement('input'); input.type = 'text'; input.value = entry[field]; input.dataset.field = field; input.setAttribute('aria-label', `${title} for parameter ${n}`); input.addEventListener('input', pending); label.append(input); row.append(label);
  }
  const label = document.createElement('label'); label.className = 'check';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = entry.equals; checkbox.dataset.field = 'equals'; checkbox.addEventListener('change', pending); label.append(checkbox, document.createTextNode('=')); row.append(label);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove parameter ${n}`); remove.addEventListener('click', () => { row.remove(); pending(); }); row.append(remove); $('queryRows').append(row);
}
function inspect() {
  invalidate('Inspecting…');
  try {
    const p = UrlKit.parse(source.value), normalized = UrlKit.normalize(source.value);
    for (const [k,v] of Object.entries(p)) { const row = document.createElement('tr'); cell(row,k,'th'); cell(row,display(v)); $('components').tBodies[0].append(row); }
    if (other.value) for (const item of UrlKit.diff(source.value,other.value)) { const row = document.createElement('tr'); row.className = item.changed ? 'changed' : ''; cell(row,item.component,'th'); cell(row,display(item.left)); cell(row,display(item.right)); cell(row,item.changed ? 'Changed' : 'Same'); $('diff').tBodies[0].append(row); }
    output.value = normalized; parsedSource = source.value; $('copy').disabled = $('download').disabled = false;
    let queryError = '';
    try { const rows = UrlKit.entries(source.value); if (rows.length > 2000) throw new Error('More than 2000 query entries; editor disabled.'); rows.forEach(addRow); $('add').disabled = $('apply').disabled = false; }
    catch (e) { queryError = ' Query editor unavailable: ' + e.message; }
    $('status').textContent = 'Parsed and normalized locally.' + queryError;
  } catch (e) { invalidate('Error: ' + e.message); }
}
source.addEventListener('input', () => invalidate()); other.addEventListener('input', () => invalidate());
$('inspect').addEventListener('click', inspect);
$('example').addEventListener('click', () => { source.value = 'HTTPS://[2001:DB8::1]:0443/a/../%7euser?tag=one&tag=two&flag#%70art'; other.value = 'https://[2001:db8::1]/~user?tag=three&flag=#part'; inspect(); });
$('clear').addEventListener('click', () => { source.value = other.value = ''; invalidate('Cleared. Ready for a new URL.'); source.focus(); });
$('add').addEventListener('click', () => { if ($('queryRows').children.length >= 2000) { $('status').textContent = 'Editor limit: 2000 parameters.'; return; } addRow({key:'',value:'',equals:true}); pending(); });
$('apply').addEventListener('click', () => {
  try {
    const rows = [...$('queryRows').children].map(row => ({ key: row.querySelector('[data-field="key"]').value, value:row.querySelector('[data-field="value"]').value, equals:row.querySelector('[data-field="equals"]').checked }));
    const edited = UrlKit.edit(parsedSource, rows); source.value = edited; inspect();
  } catch (e) { $('status').textContent = 'Query error: ' + e.message; }
});
$('copy').addEventListener('click', async () => {
  const ticket = ++revision, text = output.value;
  try { if (!navigator.clipboard) throw new Error('Unavailable'); await navigator.clipboard.writeText(text); if (ticket === revision) $('copyStatus').textContent = 'Copied normalized URL.'; }
  catch { if (ticket === revision) { output.focus(); output.select(); $('copyStatus').textContent = 'Clipboard unavailable. Output selected; copy it manually.'; } }
});
$('download').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([output.value + '\n'], {type:'text/plain;charset=utf-8'})); const a = document.createElement('a'); a.href = url; a.download = 'normalized-url.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
let theme = 0;
$('theme').addEventListener('click', () => { theme = (theme + 1) % 3; document.documentElement.dataset.theme = ['auto','light','dark'][theme]; $('theme').textContent = 'Theme: ' + ['auto','light','dark'][theme]; });
