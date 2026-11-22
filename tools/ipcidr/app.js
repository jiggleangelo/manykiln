/* Original Manykiln UI. MIT License. */
'use strict';
const $ = id => document.getElementById(id);
let current = null;
function node(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
function invalidate(message = 'Input changed. Calculate to refresh.') { current = null; $('json').disabled = true; $('csv').disabled = true; $('results').hidden = true; for (const id of ['subnets','overlaps','summary','allocations']) $(id).replaceChildren(); $('status').textContent = message; }
function calculate() {
  invalidate('Calculating…');
  try {
    const report = IPCIDR.analyze($('source').value, $('requests').value);
    $('count').textContent = report.subnets.length + ' subnets';
    report.subnets.forEach((c, i) => {
      const card = node('article'); card.className = 'subnet'; card.appendChild(node('h3', (i + 1) + '. ' + c.cidr));
      const dl = node('dl');
      for (const [label, value] of [['Family','IPv' + c.family],['Addresses',c.addresses],['Usable',c.usable],['Network',c.network],['Last address',c.last],['Mask',c.mask],['First usable',c.firstUsable],['Last usable',c.lastUsable],['Broadcast',c.broadcast || 'None (/31, /32 or IPv6)']]) { dl.appendChild(node('dt',label)); dl.appendChild(node('dd', value)); }
      card.appendChild(dl); if (c.normalized) { const p = node('p', 'Host bits normalized from ' + c.inputAddress); p.className = 'notice'; card.appendChild(p); } $('subnets').appendChild(card);
    });
    if (!report.overlaps.length) $('overlaps').appendChild(node('p','No overlaps found.'));
    else { const ul = node('ul'); for (const r of report.overlaps.slice(0, 500)) ul.appendChild(node('li', 'Rows ' + r.a + ' & ' + r.b + ': ' + (r.aContainsB && r.bContainsA ? 'equal subnets' : r.aContainsB ? 'first contains second' : r.bContainsA ? 'second contains first' : 'overlap'))); $('overlaps').appendChild(ul); if (report.overlaps.length > 500) $('overlaps').appendChild(node('p', 'Showing first 500 pairs; JSON contains all ' + report.overlaps.length + '.')); }
    for (const c of report.summary) $('summary').appendChild(node('li', c.cidr));
    $('vlsm-panel').hidden = !report.vlsm;
    if (report.vlsm) {
      $('remaining').textContent = report.vlsm.unallocatedAddresses + ' addresses unallocated';
      const table = node('table'), head = node('thead'), hr = node('tr'), body = node('tbody');
      for (const h of ['Request #','Request','Allocated CIDR','Addresses','Usable']) hr.appendChild(node('th',h)); head.appendChild(hr);
      for (const c of report.vlsm.allocations) { const tr = node('tr'); for (const value of [c.requestNumber,c.request,c.cidr,c.addresses,c.usable]) tr.appendChild(node('td',String(value))); body.appendChild(tr); }
      table.appendChild(head); table.appendChild(body); $('allocations').appendChild(table);
    }
    current = report; $('results').hidden = false; $('json').disabled = false; $('csv').disabled = false;
    $('status').textContent = 'Calculated ' + report.subnets.length + ' subnets · ' + report.overlaps.length + ' overlapping pairs · ' + report.summary.length + ' summary routes.';
  } catch (e) { invalidate('Error: ' + e.message); }
}
for (const id of ['source','requests']) $(id).addEventListener('input', () => invalidate());
$('calculate').addEventListener('click',calculate);
$('example').addEventListener('click', () => { $('source').value = '192.0.2.0/24\n192.0.2.64/26\n2001:db8::/64\n2001:db8:0:1::/64'; $('requests').value = 'hosts:50\n/27\nhosts:2'; calculate(); });
$('clear').addEventListener('click', () => { $('source').value = ''; $('requests').value = ''; invalidate('Inputs cleared.'); $('source').focus(); });
$('theme').addEventListener('change', () => { document.documentElement.dataset.theme = $('theme').value; });
for (const format of ['json','csv']) $(format).addEventListener('click', () => {
  if (!current) return;
  const text = format === 'json' ? JSON.stringify(current, null, 2) + '\n' : IPCIDR.csv(current), url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv' })), a = document.createElement('a');
  a.href = url; a.download = 'ipcidr-report.' + format; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('status').textContent = format.toUpperCase() + ' downloaded for current inputs.';
});
