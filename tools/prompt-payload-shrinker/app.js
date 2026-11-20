/* prompt-payload-shrinker UI. MIT licence, Copyright (c) 2026 Manykiln.
 * Everything is rendered with textContent / createElement. Nothing is stored or sent. */
(function () {
  'use strict';

  var Core = globalThis.ShrinkCore;
  var state = { analysis: null, selected: 0, rows: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function clearNode(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }

  // ---------- made-up examples (deterministic) ----------

  function exampleUsers() {
    var names = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jun', 'Kai', 'Lena'];
    var plans = ['free', 'pro', 'team'];
    var list = [];
    for (var i = 0; i < 12; i++) {
      list.push({ id: i + 1, name: names[i] + ' Example', plan: plans[i % 3], active: i % 4 !== 3 });
    }
    return JSON.stringify(list, null, 2);
  }

  function exampleConfig() {
    var sentence = 'This service handles example requests for a made-up demo project and is described here at length. ';
    var desc = '';
    for (var i = 0; i < 3; i++) desc += sentence;
    var cfg = {
      name: 'demo-api',
      version: '1.4.0',
      description: desc.trim(),
      owner: '',
      tags: [],
      labels: {},
      limits: { timeoutSeconds: 30, retries: null, burst: {} },
      features: { beta: false, notes: '', flags: [] },
      endpoints: [
        { path: '/health', method: 'GET', auth: null },
        { path: '/items', method: 'GET', auth: 'token' },
        { path: '/items', method: 'POST', auth: 'token' }
      ]
    };
    return JSON.stringify(cfg, null, 2);
  }

  function exampleLog() {
    var G = '\u001b[32m';
    var Y = '\u001b[33m';
    var R = '\u001b[31m';
    var Z = '\u001b[0m';
    var lines = [];
    var i;
    for (i = 1; i <= 8; i++) {
      lines.push(G + '[ok]' + Z + ' compiled module-' + pad(i, 2) + '   ');
    }
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push(Y + '[warn]' + Z + ' connection to the package registry failed');
    for (i = 0; i < 40; i++) lines.push(Y + 'retrying...' + Z);
    lines.push(R + '[error]' + Z + ' giving up after 40 attempts');
    return lines.join('\n');
  }

  function exampleListing() {
    var lines = [];
    for (var i = 1; i <= 250; i++) {
      var size = 1000 + (i * 37) % 9000;
      lines.push('-rw-r--r--  1 demo  staff  ' + size + ' Jan ' + pad(1 + (i % 28), 2) + ' 12:00 file-' + pad(i, 3) + '.txt');
    }
    return lines.join('\n');
  }

  var EXAMPLES = {
    users: exampleUsers,
    config: exampleConfig,
    log: exampleLog,
    listing: exampleListing
  };

  // ---------- rendering ----------

  function lossBadge(loss) {
    return el('span', 'badge ' + loss, loss === 'lossy' ? 'LOSSY' : 'LOSSLESS');
  }

  function updateSelection() {
    var a = state.analysis;
    if (!a) return;
    state.rows.forEach(function (r, i) {
      var on = i === state.selected;
      r.tr.classList.toggle('selected', on);
      r.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var s = a.steps[state.selected];
    $('output').value = s.output;
    var info = $('sel-info');
    clearNode(info);
    info.appendChild(el('strong', null, 'Selected: ' + s.label + ' '));
    info.appendChild(lossBadge(s.loss));
    info.appendChild(el('span', null, ' ' + s.note + ' (about ' + s.tokens + ' tokens).'));
    $('copy-msg').textContent = '';
  }

  function select(i) {
    state.selected = i;
    updateSelection();
  }

  function render() {
    var a = state.analysis;
    $('results').hidden = false;
    $('kind-line').textContent = 'Detected kind: ' + (a.kind === 'json' ? 'JSON' : 'Text');
    $('tokens-line').textContent = 'Estimated tokens for the original: about ' + a.original +
      ' (range ' + a.low + ' to ' + a.high + ', -25% / +25%).';

    var msg = $('fit-msg');
    if (a.budget === null) {
      msg.textContent = '';
    } else if (a.fits) {
      msg.textContent = 'Fits your budget: "' + a.steps[a.chosenIndex].label + '" is about ' +
        a.steps[a.chosenIndex].tokens + ' tokens (budget ' + a.budget + ').';
    } else {
      msg.textContent = 'No step fits; the smallest is shown. The last step is about ' +
        a.steps[a.chosenIndex].tokens + ' tokens (budget ' + a.budget + ').';
    }
    msg.className = a.budget === null ? '' : (a.fits ? 'ok' : 'bad');

    var body = $('ladder-body');
    clearNode(body);
    state.rows = [];
    a.steps.forEach(function (s, i) {
      var tr = el('tr');
      if (a.budget !== null && i === a.chosenIndex) tr.classList.add(a.fits ? 'fit' : 'nofit');
      var th = el('th');
      th.scope = 'row';
      var btn = el('button', 'step-btn', (i + 1) + '. ' + s.label);
      btn.type = 'button';
      th.appendChild(btn);
      if (a.budget !== null && i === a.chosenIndex) {
        th.appendChild(el('span', 'tag', a.fits ? 'Fits your budget' : 'Smallest step'));
      }
      tr.appendChild(th);
      var typeCell = el('td');
      typeCell.appendChild(lossBadge(s.loss));
      tr.appendChild(typeCell);
      tr.appendChild(el('td', null, s.note));
      tr.appendChild(el('td', 'num', String(s.tokens)));
      tr.appendChild(el('td', 'num', String(s.saved)));
      tr.appendChild(el('td', 'num', s.pct + '%'));
      tr.addEventListener('click', function () { select(i); });
      body.appendChild(tr);
      state.rows.push({ tr: tr, btn: btn });
    });
    updateSelection();
  }

  function showCut(cut) {
    var n = $('cut-notice');
    if (cut) {
      n.textContent = 'Your input was longer than ' + Core.MAX_INPUT + ' characters, so it was cut to the first ' +
        Core.MAX_INPUT + ' characters before shrinking.';
      n.hidden = false;
    } else {
      n.textContent = '';
      n.hidden = true;
    }
  }

  function run() {
    var a = Core.analyze($('input').value, $('budget').value);
    state.analysis = a;
    state.selected = a.chosenIndex !== null ? a.chosenIndex : a.steps.length - 1;
    showCut(a.cut);
    render();
  }

  function clearResults() {
    state.analysis = null;
    state.rows = [];
    clearNode($('ladder-body'));
    $('output').value = '';
    $('fit-msg').textContent = '';
    $('copy-msg').textContent = '';
    $('results').hidden = true;
  }

  function clearAll() {
    $('input').value = '';
    $('budget').value = '';
    showCut(false);
    clearResults();
    $('input').focus();
  }

  function copyResult() {
    var out = $('output');
    var msg = $('copy-msg');
    function fallback() {
      out.focus();
      out.select();
      msg.textContent = 'Copy is not available here. The result is selected: press Ctrl+C (Cmd+C on a Mac) to copy it.';
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(out.value).then(function () {
        msg.textContent = 'Copied.';
      }, fallback);
    } else {
      fallback();
    }
  }

  function init() {
    $('shrink').addEventListener('click', run);
    $('clear-input').addEventListener('click', clearAll);
    $('clear-out').addEventListener('click', function () {
      clearResults();
      $('input').focus();
    });
    $('copy').addEventListener('click', copyResult);
    $('budget').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        run();
      }
    });
    var buttons = document.querySelectorAll('[data-example]');
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        var gen = EXAMPLES[b.getAttribute('data-example')];
        if (!gen) return;
        $('input').value = gen();
        showCut(false);
        clearResults();
        $('input').focus();
      });
    });
  }

  init();
})();
