(function () {
  'use strict';
  var Q = globalThis.QrCore;
  function $(id) { return document.getElementById(id); }

  var typeSel = $('type');
  var msg = $('msg');
  var statusEl = $('status');
  var canvas = $('preview');
  var placeholder = $('placeholder');
  var btnPng = $('dl-png');
  var btnSvg = $('dl-svg');
  var btnCopy = $('copy');
  var btnClear = $('clear');
  var touched = false;
  var last = null;

  var builders = {
    text: function () { return $('text').value; },
    wifi: function () {
      return Q.buildWifi({ ssid: $('wifi-ssid').value, password: $('wifi-pass').value, security: $('wifi-sec').value, hidden: $('wifi-hidden').checked });
    },
    contact: function () {
      return Q.buildVCard({ name: $('vc-name').value, org: $('vc-org').value, phone: $('vc-phone').value, email: $('vc-email').value, url: $('vc-url').value, address: $('vc-addr').value });
    },
    email: function () { return Q.buildMailto({ to: $('em-to').value, subject: $('em-subject').value, body: $('em-body').value }); },
    sms: function () { return Q.buildSms({ number: $('sms-number').value, message: $('sms-message').value }); },
    tel: function () { return Q.buildTel({ number: $('tel-number').value }); },
    geo: function () { return Q.buildGeo({ lat: $('geo-lat').value, lng: $('geo-lng').value }); },
    event: function () { return Q.buildEvent({ title: $('ev-title').value, start: $('ev-start').value, end: $('ev-end').value, location: $('ev-loc').value }); }
  };

  var EXAMPLES = {
    text: { text: 'https://example.org/menu' },
    wifi: { 'wifi-ssid': 'Cafe Guest', 'wifi-pass': 'sunny-days-42', 'wifi-sec': 'WPA', 'wifi-hidden': false },
    contact: { 'vc-name': 'Alex Tan', 'vc-org': 'Example Bakery', 'vc-phone': '+65 6000 0000', 'vc-email': '', 'vc-url': '', 'vc-addr': '' },
    event: { 'ev-title': 'Open day', 'ev-start': '2026-12-05T10:00', 'ev-end': '2026-12-05T12:00', 'ev-loc': 'Main hall' }
  };

  function setMsg(t) { msg.textContent = t || ''; }
  function setStatus(t) { statusEl.textContent = t || ''; }

  function fillList(ul, items) {
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function intField(id, min, max, label) {
    var raw = $(id).value.trim();
    var n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < min || n > max) {
      throw new Error(label + ' must be a whole number from ' + min + ' to ' + max + '.');
    }
    return n;
  }

  function readOptions() {
    var o = {};
    o.ecc = $('ecc').value;
    o.fg = $('fg').value;
    o.bg = $('bg').value;
    o.quiet = intField('quiet', 0, 10, 'Quiet zone');
    o.px = intField('px', 128, 2048, 'Output size');
    o.minVersion = intField('minver', 1, 40, 'Minimum version');
    var d = Number($('distance').value);
    if (!(d > 0) || !isFinite(d)) throw new Error('Scan distance must be more than 0 cm.');
    o.distance = d;
    return o;
  }

  function showEmpty(message, hold) {
    last = null;
    canvas.hidden = true;
    placeholder.hidden = false;
    btnPng.disabled = true;
    btnSvg.disabled = true;
    btnCopy.disabled = true;
    $('payload').textContent = '';
    $('sc-contrast').textContent = '-';
    $('sc-quiet').textContent = '-';
    $('sc-version').textContent = '-';
    $('sc-print').textContent = '-';
    fillList($('warnings'), ['Nothing to check yet.']);
    fillList($('ecc-list'), []);
    setMsg(message);
  }

  function render() {
    var type = typeSel.value;
    var hint = $('link-hint');
    hint.textContent = '';
    var payload;
    try {
      payload = builders[type]();
    } catch (e) {
      showEmpty(touched ? e.message : 'Fill in the fields to see your code.');
      return;
    }
    if (!payload) {
      showEmpty('Type or paste something to make a code.');
      return;
    }
    if (type === 'text') hint.textContent = Q.linkHint(payload);
    var o;
    try {
      o = readOptions();
    } catch (e2) {
      showEmpty(e2.message);
      return;
    }
    var res;
    try {
      res = Q.encode(payload, { ecc: o.ecc, minVersion: o.minVersion });
    } catch (e3) {
      if (e3 instanceof RangeError && e3.maxCapacity) {
        showEmpty('This is too long for a QR code at these settings. The most it can hold is ' + e3.maxCapacity + (e3.mode === 'byte' ? ' bytes' : ' characters') + '. Shorten the content or choose a lower error correction level.');
      } else {
        showEmpty(e3.message);
      }
      return;
    }
    var plan;
    try {
      plan = Q.toCanvasPlan(res, { fg: o.fg, bg: o.bg, quiet: o.quiet, px: o.px });
    } catch (e4) {
      showEmpty(e4.message);
      return;
    }
    canvas.width = plan.width;
    canvas.height = plan.height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, plan.width, plan.height);
    ctx.fillStyle = o.fg;
    plan.rects.forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });
    canvas.hidden = false;
    placeholder.hidden = true;
    btnPng.disabled = false;
    btnSvg.disabled = false;
    btnCopy.disabled = false;
    setMsg('');
    last = { res: res, payload: payload, opts: o, plan: plan };
    $('payload').textContent = payload;
    updateScan(res, o);
  }

  function updateScan(res, o) {
    var adv = Q.scanAdvice(res, { fg: o.fg, bg: o.bg, quiet: o.quiet, distanceCm: o.distance });
    $('sc-contrast').textContent = adv.contrast + ':1 (' + (adv.contrastOk ? 'good, at least 4:1' : 'low, aim for 4:1 or more') + ')' + (adv.inverted ? ', inverted' : '');
    $('sc-quiet').textContent = o.quiet + ' modules (' + (adv.quietOk ? 'enough' : 'too small, use at least 4') + ')';
    $('sc-version').textContent = 'Version ' + res.version + ', ' + res.size + ' x ' + res.size + ' modules, ' + res.mode + ' mode, error correction ' + res.ecc;
    $('sc-print').textContent = adv.minPrintCm + ' cm wide including the quiet zone (about ' + adv.moduleMm.toFixed(2) + ' mm per module)';
    var w = adv.warnings.length ? adv.warnings.map(function (t) { return 'Warning: ' + t; }) : ['No warnings. Still test with two different phones.'];
    fillList($('warnings'), w);
    fillList($('ecc-list'), adv.eccCompare.map(function (c) {
      var base = 'Level ' + c.ecc + ': ' + (c.version ? 'version ' + c.version + ', ' + c.size + ' x ' + c.size + ' modules' : 'does not fit');
      return base + (c.ecc === res.ecc ? ' (selected)' : '');
    }));
  }

  function showPanel() {
    var type = typeSel.value;
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].hidden = panels[i].getAttribute('data-type') !== type;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  btnPng.addEventListener('click', function () {
    if (!last) return;
    canvas.toBlob(function (b) {
      if (!b) { setStatus('Could not make the PNG in this browser.'); return; }
      download(b, 'qr-code.png');
      setStatus('PNG saved: ' + last.plan.width + ' x ' + last.plan.height + ' px (whole pixels per module keep the edges sharp).');
    }, 'image/png');
  });

  btnSvg.addEventListener('click', function () {
    if (!last) return;
    var o = last.opts;
    var svg = Q.toSvg(last.res, { fg: o.fg, bg: o.bg, quiet: o.quiet, px: o.px });
    download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
    setStatus('SVG saved.');
  });

  btnCopy.addEventListener('click', function () {
    if (!last) return;
    var fail = 'Could not copy here. Open "Payload text" below and select it by hand.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(last.payload).then(function () {
        setStatus('Payload text copied.');
      }, function () { setStatus(fail); });
    } else {
      setStatus(fail);
    }
  });

  btnClear.addEventListener('click', function () {
    var els = document.querySelectorAll('#fields input, #fields textarea');
    for (var i = 0; i < els.length; i++) {
      if (els[i].type === 'checkbox') els[i].checked = false;
      else els[i].value = '';
    }
    touched = false;
    setStatus('Cleared.');
    render();
    var first = document.querySelector('.panel:not([hidden]) input, .panel:not([hidden]) textarea');
    if (first) first.focus();
  });

  typeSel.addEventListener('change', function () {
    showPanel();
    render();
  });

  document.addEventListener('input', function (ev) {
    if (ev.target === typeSel) return;
    touched = true;
    render();
  });

  var exBtns = document.querySelectorAll('[data-example]');
  for (var i = 0; i < exBtns.length; i++) {
    exBtns[i].addEventListener('click', function (ev) {
      var key = ev.currentTarget.getAttribute('data-example');
      var data = EXAMPLES[key];
      if (!data) return;
      typeSel.value = key === 'text' ? 'text' : key;
      showPanel();
      Object.keys(data).forEach(function (id) {
        var el = $(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!data[id];
        else el.value = data[id];
      });
      touched = true;
      setStatus('Made-up example filled in.');
      render();
    });
  }

  showPanel();
  render();
})();
