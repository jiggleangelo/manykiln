/* Original Manykiln UI. MIT license. */
'use strict';
const $ = id => document.getElementById(id);
const source = $('source'), output = $('output'), direction = $('direction');
let revision = 0;
function invalidate(message = 'Input changed. Convert to refresh the result.') {
  revision++; output.value = ''; $('warnings').replaceChildren(); $('copyStatus').textContent = ''; $('status').textContent = message;
  for (const name of ['swap','copy','download']) $(name).disabled = true;
}
function convert() {
  invalidate('Converting…');
  try {
    const result = YamlKit.convert(source.value,direction.value); output.value = result.output;
    for (const item of result.warnings) { const li = document.createElement('li'); li.textContent = `${item.line}:${item.column} ${item.code}: ${item.message}`; $('warnings').append(li); }
    $('status').textContent = result.warnings.length ? `Valid with ${result.warnings.length} portability warning(s).` : 'Valid. Converted locally with sorted keys.';
    for (const name of ['swap','copy','download']) $(name).disabled = false;
  } catch (e) { $('status').textContent = 'Error ' + e.message; }
}
source.addEventListener('input', () => invalidate()); direction.addEventListener('change', () => invalidate());
$('convert').addEventListener('click', convert);
$('example').addEventListener('click', () => { source.value = direction.value === 'yaml-json' ? 'project: Manykiln\ncountry: NO\nenabled: true\ntools:\n  - name: urlparsekit\n    local: true\n  - name: yaml2json\n    local: true\n' : '{"project":"Manykiln","country":"NO","enabled":true,"tools":["urlparsekit","yaml2json"]}'; convert(); });
$('clear').addEventListener('click', () => { source.value = ''; invalidate('Cleared. Ready for a new document.'); source.focus(); });
$('swap').addEventListener('click', () => { const text = output.value; direction.value = direction.value === 'yaml-json' ? 'json-yaml' : 'yaml-json'; source.value = text; convert(); });
$('copy').addEventListener('click', async () => {
  const ticket = ++revision, text = output.value;
  try { if (!navigator.clipboard) throw new Error('Unavailable'); await navigator.clipboard.writeText(text); if (ticket === revision) $('copyStatus').textContent = 'Copied output.'; }
  catch { if (ticket === revision) { output.focus(); output.select(); $('copyStatus').textContent = 'Clipboard unavailable. Output selected; copy it manually.'; } }
});
$('download').addEventListener('click', () => { const json = direction.value === 'yaml-json'; const url = URL.createObjectURL(new Blob([output.value], {type:json ? 'application/json;charset=utf-8' : 'text/yaml;charset=utf-8'})); const a = document.createElement('a'); a.href = url; a.download = json ? 'converted.json' : 'converted.yaml'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
let theme = 0;
$('theme').addEventListener('click', () => { theme = (theme + 1) % 3; document.documentElement.dataset.theme = ['auto','light','dark'][theme]; $('theme').textContent = 'Theme: ' + ['auto','light','dark'][theme]; });
