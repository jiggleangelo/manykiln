/* prompt-payload-shrinker: pure logic. MIT licence, Copyright (c) 2026 Manykiln.
 *
 * The compact table encoding is a documented subset written from the rules of
 * toon-format/toon (MIT licence). The constants below follow its constants.ts
 * (list item prefix, comma, colon, brackets, braces, null/true/false literals).
 * The output-trimming idea is referenced from decolua/9router (MIT); no code copied.
 * See README.md (Credits) and THIRD_PARTY_NOTICES.md.
 */
(function () {
  'use strict';

  // Adapted from toon-format/toon packages/toon/src/constants.ts (MIT License).
  var LIST_ITEM_PREFIX = '- ';
  var COMMA = ',';
  var COLON = ':';
  var OPEN_BRACKET = '[';
  var CLOSE_BRACKET = ']';
  var OPEN_BRACE = '{';
  var CLOSE_BRACE = '}';
  var DOUBLE_QUOTE = '"';
  var BACKSLASH = '\\';

  var MAX_INPUT = 100000;
  var MAX_DEPTH = 200;

  var TOKEN_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]|[A-Za-z]+|\d+|\n|[^\S\n]+|[^\sA-Za-z\d]/gu;
  var ANSI_CSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
  var ANSI_OSC = /\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
  var BARE_KEY = /^[A-Za-z_][A-Za-z0-9_.]*$/;
  var KEY_CHARS = /[A-Za-z0-9_.]/;
  var NUMERIC = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
  var UNSAFE = /[,:"\\\[\]{}#\u0000-\u001f\u007f]/;

  var hasOwn = Object.prototype.hasOwnProperty;

  function prepareInput(raw) {
    var s = String(raw === null || raw === undefined ? '' : raw);
    return { text: s.slice(0, MAX_INPUT).replace(/\r\n?/g, '\n'), cut: s.length > MAX_INPUT };
  }

  function tokenCost(tok) {
    var c = tok.codePointAt(0);
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) ||
        (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) return 1;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return Math.ceil(tok.length / 4);
    if (c >= 48 && c <= 57) return Math.ceil(tok.length / 3);
    if (tok === '\n') return 1;
    if (/^\s/.test(tok)) return tok.length === 1 ? 0 : Math.ceil(tok.length / 4);
    return c > 0xffff ? 2 : 1;
  }

  function estimateTokens(text) {
    var s = String(text === null || text === undefined ? '' : text);
    var m = s.match(TOKEN_RE);
    if (!m) return 0;
    var total = 0;
    for (var i = 0; i < m.length; i++) total += tokenCost(m[i]);
    return total;
  }

  function detectKind(text) {
    var t = String(text === null || text === undefined ? '' : text).trim();
    var c = t.charAt(0);
    if (c === '{' || c === '[') {
      try {
        JSON.parse(t);
        return 'json';
      } catch (e) {
        return 'text';
      }
    }
    return 'text';
  }

  function stripAnsi(s) {
    return String(s).replace(ANSI_OSC, '').replace(ANSI_CSI, '');
  }

  function isPrim(v) {
    return v === null || v === undefined || typeof v !== 'object';
  }

  function isPlain(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function setProp(obj, key, value) {
    Object.defineProperty(obj, key, { value: value, writable: true, enumerable: true, configurable: true });
  }

  // ---------- compact table encoding ----------

  function formatKey(k) {
    return BARE_KEY.test(k) ? k : JSON.stringify(k);
  }

  function formatPrimitive(v) {
    if (v === null || v === undefined) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
    var s = String(v);
    if (s !== '' && s === s.trim() && s !== 'true' && s !== 'false' && s !== 'null' &&
        !NUMERIC.test(s) && !UNSAFE.test(s) && s.charAt(0) !== '-') {
      return s;
    }
    return JSON.stringify(s);
  }

  function indent(d) {
    var s = '';
    for (var i = 0; i < d; i++) s += '  ';
    return s;
  }

  function tabularKeys(arr) {
    if (!arr.length || !isPlain(arr[0])) return null;
    var keys = Object.keys(arr[0]);
    if (!keys.length) return null;
    var sig = JSON.stringify(keys);
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!isPlain(item) || JSON.stringify(Object.keys(item)) !== sig) return null;
      for (var j = 0; j < keys.length; j++) {
        if (!isPrim(item[keys[j]])) return null;
      }
    }
    return keys;
  }

  function pushArray(lines, key, arr, d) {
    var head = indent(d) + key + OPEN_BRACKET + arr.length + CLOSE_BRACKET;
    if (arr.length === 0) {
      lines.push(head + COLON);
      return;
    }
    if (arr.every(isPrim)) {
      lines.push(head + COLON + ' ' + arr.map(formatPrimitive).join(COMMA));
      return;
    }
    var tk = tabularKeys(arr);
    if (tk) {
      lines.push(head + OPEN_BRACE + tk.map(formatKey).join(COMMA) + CLOSE_BRACE + COLON);
      arr.forEach(function (item) {
        lines.push(indent(d + 1) + tk.map(function (k) { return formatPrimitive(item[k]); }).join(COMMA));
      });
      return;
    }
    lines.push(head + COLON);
    arr.forEach(function (item) {
      lines.push(indent(d + 1) + LIST_ITEM_PREFIX + JSON.stringify(item));
    });
  }

  function pushEntry(lines, key, val, d) {
    if (d > MAX_DEPTH) throw new Error('too deeply nested');
    if (isPrim(val)) {
      lines.push(indent(d) + key + COLON + ' ' + formatPrimitive(val));
    } else if (Array.isArray(val)) {
      pushArray(lines, key, val, d);
    } else {
      lines.push(indent(d) + key + COLON);
      Object.keys(val).forEach(function (k) {
        pushEntry(lines, formatKey(k), val[k], d + 1);
      });
    }
  }

  function encodeCompact(value) {
    if (isPrim(value)) return formatPrimitive(value);
    var lines = [];
    if (Array.isArray(value)) {
      pushArray(lines, '', value, 0);
    } else {
      Object.keys(value).forEach(function (k) {
        pushEntry(lines, formatKey(k), value[k], 0);
      });
    }
    return lines.join('\n');
  }

  // ---------- decoding ----------

  function closingQuote(s, start) {
    for (var i = start + 1; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === BACKSLASH) i++;
      else if (ch === DOUBLE_QUOTE) return i;
    }
    return -1;
  }

  function splitTop(s) {
    var out = [];
    var start = 0;
    var inq = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inq) {
        if (ch === BACKSLASH) i++;
        else if (ch === DOUBLE_QUOTE) inq = false;
      } else if (ch === DOUBLE_QUOTE) {
        inq = true;
      } else if (ch === COMMA) {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
    if (inq) throw new Error('bad quoting: unterminated string');
    out.push(s.slice(start));
    return out;
  }

  function parsePrimitive(t) {
    if (t === '') throw new Error('empty value');
    if (t.charAt(0) === DOUBLE_QUOTE) {
      if (closingQuote(t, 0) !== t.length - 1) throw new Error('bad quoting: ' + t);
      return JSON.parse(t);
    }
    if (t === 'null') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (NUMERIC.test(t)) return Number(t);
    if (t.indexOf(DOUBLE_QUOTE) >= 0) throw new Error('bad quoting: ' + t);
    return t;
  }

  function parseKeyToken(t) {
    if (t.charAt(0) === DOUBLE_QUOTE) {
      if (closingQuote(t, 0) !== t.length - 1) throw new Error('bad quoting in field name: ' + t);
      return JSON.parse(t);
    }
    if (!BARE_KEY.test(t)) throw new Error('bad field name: ' + t);
    return t;
  }

  function readKey(s) {
    if (s.charAt(0) === DOUBLE_QUOTE) {
      var end = closingQuote(s, 0);
      if (end < 0) throw new Error('bad quoting: unterminated key');
      return { key: JSON.parse(s.slice(0, end + 1)), i: end + 1, quoted: true };
    }
    var i = 0;
    while (i < s.length && KEY_CHARS.test(s.charAt(i))) i++;
    return { key: s.slice(0, i), i: i, quoted: false };
  }

  function parseEntry(s) {
    var k = readKey(s);
    var i = k.i;
    var c = s.charAt(i);
    var rest;
    if (c === COLON) {
      rest = s.slice(i + 1);
      var val = null;
      if (rest !== '') {
        if (rest.charAt(0) !== ' ') throw new Error('expected a space after the colon');
        val = rest.slice(1);
      }
      return { type: 'field', key: k.key, quoted: k.quoted, value: val };
    }
    if (c === OPEN_BRACKET) {
      var j = s.indexOf(CLOSE_BRACKET, i);
      if (j < 0) throw new Error('unterminated array header');
      var ns = s.slice(i + 1, j);
      if (!/^\d+$/.test(ns)) throw new Error('bad array length: ' + ns);
      var n = Number(ns);
      var p = j + 1;
      var fields = null;
      if (s.charAt(p) === OPEN_BRACE) {
        var q = p + 1;
        var inq = false;
        while (q < s.length) {
          var ch = s.charAt(q);
          if (inq) {
            if (ch === BACKSLASH) q++;
            else if (ch === DOUBLE_QUOTE) inq = false;
          } else if (ch === DOUBLE_QUOTE) {
            inq = true;
          } else if (ch === CLOSE_BRACE) {
            break;
          }
          q++;
        }
        if (q >= s.length) throw new Error('unterminated field list');
        var inner = s.slice(p + 1, q);
        if (inner === '') throw new Error('empty field list');
        fields = splitTop(inner).map(parseKeyToken);
        p = q + 1;
      }
      if (s.charAt(p) !== COLON) throw new Error('expected a colon after the array header');
      rest = s.slice(p + 1);
      var inline = null;
      if (rest !== '') {
        if (rest.charAt(0) !== ' ') throw new Error('expected a space after the colon');
        inline = rest.slice(1);
      }
      return { type: 'array', key: k.key, quoted: k.quoted, n: n, fields: fields, inline: inline };
    }
    return null;
  }

  function decodeCompact(text) {
    if (typeof text !== 'string') throw new Error('input must be a string');
    if (text === '') return {};
    var lines = text.split('\n').map(function (l, idx) {
      var k = 0;
      while (l.charAt(k) === ' ') k++;
      if (k % 2 !== 0) throw new Error('line ' + (idx + 1) + ': odd indentation');
      var c = l.slice(k);
      if (c === '') throw new Error('line ' + (idx + 1) + ': blank line');
      return { d: k / 2, c: c, n: idx + 1 };
    });
    var pos = 0;

    function takeLines(n, depth) {
      if (pos + n > lines.length) throw new Error('count mismatch: expected ' + n + ' lines');
      var out = [];
      for (var i = 0; i < n; i++) {
        var ln = lines[pos + i];
        if (ln.d !== depth) throw new Error('line ' + ln.n + ': count mismatch or bad indentation');
        out.push(ln);
      }
      pos += n;
      return out;
    }

    function readArray(e, d) {
      var rows;
      if (e.fields) {
        if (e.inline !== null) throw new Error('unexpected values after a table header');
        rows = takeLines(e.n, d + 1);
        return rows.map(function (ln) {
          var toks = splitTop(ln.c);
          if (toks.length !== e.fields.length) throw new Error('line ' + ln.n + ': expected ' + e.fields.length + ' values');
          var o = {};
          for (var i = 0; i < toks.length; i++) setProp(o, e.fields[i], parsePrimitive(toks[i]));
          return o;
        });
      }
      if (e.n === 0) {
        if (e.inline !== null) throw new Error('count mismatch: empty array has values');
        return [];
      }
      if (e.inline !== null) {
        var toks2 = splitTop(e.inline);
        if (toks2.length !== e.n) throw new Error('count mismatch: expected ' + e.n + ' values, found ' + toks2.length);
        return toks2.map(parsePrimitive);
      }
      rows = takeLines(e.n, d + 1);
      return rows.map(function (ln) {
        if (ln.c.slice(0, 2) !== LIST_ITEM_PREFIX) throw new Error('line ' + ln.n + ': expected a list item');
        return JSON.parse(ln.c.slice(2));
      });
    }

    function readValue(e, d) {
      if (e.type === 'array') return readArray(e, d);
      if (e.value === null) {
        if (pos < lines.length && lines[pos].d === d + 1) return readObject(d + 1);
        return {};
      }
      return parsePrimitive(e.value);
    }

    function readObject(d) {
      var obj = {};
      while (pos < lines.length && lines[pos].d === d) {
        var ln = lines[pos];
        var e = parseEntry(ln.c);
        if (e === null) throw new Error('line ' + ln.n + ': expected "key: value"');
        pos++;
        setProp(obj, e.key, readValue(e, d));
      }
      if (pos < lines.length && lines[pos].d > d) {
        throw new Error('line ' + lines[pos].n + ': unexpected indentation');
      }
      return obj;
    }

    if (lines[0].d !== 0) throw new Error('line 1: unexpected indentation');
    var first = parseEntry(lines[0].c);
    if (first === null) {
      if (lines.length !== 1) throw new Error('line 1: expected "key: value"');
      return parsePrimitive(lines[0].c);
    }
    if (first.type === 'array' && first.key === '' && !first.quoted) {
      pos = 1;
      var arr = readArray(first, 0);
      if (pos !== lines.length) throw new Error('unexpected extra lines');
      return arr;
    }
    var obj = readObject(0);
    if (pos !== lines.length) throw new Error('unexpected extra lines');
    return obj;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    var aa = Array.isArray(a);
    if (aa !== Array.isArray(b)) return false;
    var i;
    if (aa) {
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (i = 0; i < ka.length; i++) {
      var k = ka[i];
      if (!hasOwn.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  // ---------- ladder ----------

  function truncate(s, st) {
    var cut = 160;
    if (/[\ud800-\udbff]/.test(s.charAt(cut - 1))) cut--;
    if (st) st.n++;
    return s.slice(0, cut) + '…[+' + (s.length - cut) + ' chars]';
  }

  function tryCompact(value) {
    try {
      var out = encodeCompact(value);
      return deepEqual(decodeCompact(out), value) ? out : null;
    } catch (e) {
      return null;
    }
  }

  function encodeStep(value) {
    var c = tryCompact(value);
    return c !== null ? c : JSON.stringify(value);
  }

  function isEmptyVal(v) {
    return v === null || v === '' || (Array.isArray(v) && v.length === 0) ||
      (isPlain(v) && Object.keys(v).length === 0);
  }

  function dropEmpty(v) {
    if (Array.isArray(v)) return v.map(dropEmpty);
    if (isPlain(v)) {
      var o = {};
      Object.keys(v).forEach(function (k) {
        var c = dropEmpty(v[k]);
        if (!isEmptyVal(c)) setProp(o, k, c);
      });
      return o;
    }
    return v;
  }

  function trimStrings(v, st) {
    if (typeof v === 'string') return v.length > 200 ? truncate(v, st) : v;
    if (Array.isArray(v)) return v.map(function (x) { return trimStrings(x, st); });
    if (isPlain(v)) {
      var o = {};
      Object.keys(v).forEach(function (k) { setProp(o, k, trimStrings(v[k], st)); });
      return o;
    }
    return v;
  }

  function capArrays(v, st) {
    if (Array.isArray(v)) {
      var keep = v;
      if (v.length > 20) {
        st.n += v.length - 20;
        keep = v.slice(0, 20);
      }
      return keep.map(function (x) { return capArrays(x, st); });
    }
    if (isPlain(v)) {
      var o = {};
      Object.keys(v).forEach(function (k) { setProp(o, k, capArrays(v[k], st)); });
      return o;
    }
    return v;
  }

  function makeAdder(steps) {
    return function (id, label, loss, note, output) {
      steps.push({ id: id, label: label, loss: loss, note: note, output: output, tokens: estimateTokens(output) });
    };
  }

  function jsonLadder(text) {
    var trimmed = text.trim();
    var value = JSON.parse(trimmed);
    var steps = [];
    var add = makeAdder(steps);
    add('original', 'Original', 'lossless', 'As pasted (trimmed at the ends).', trimmed);

    var minOut = JSON.stringify(value);
    var compact = tryCompact(value);
    var minNote = minOut === trimmed ? 'no change' : 'Whitespace removed.';
    if (compact === null) minNote += ' Note: compact form could not be verified.';
    add('minified', 'Minified JSON', 'lossless', minNote, minOut);

    var prev = minOut;
    if (compact !== null) {
      add('compact_table', 'Compact table', 'lossless',
        compact === prev ? 'no change' : 'Verified: decoded back and matches the original.', compact);
      prev = compact;
    }

    var d = dropEmpty(value);
    var out = encodeStep(d);
    add('drop_empty', 'Drop empty fields', 'lossy', out === prev ? 'no change' : 'empty fields removed', out);
    prev = out;

    var st = { n: 0 };
    var t = trimStrings(d, st);
    out = encodeStep(t);
    add('trim_strings', 'Trim long strings', 'lossy',
      st.n === 0 ? 'no change' : st.n + ' long string' + (st.n === 1 ? '' : 's') + ' shortened to 160 characters',
      out);
    prev = out;

    var cs = { n: 0 };
    var capped = capArrays(t, cs);
    out = encodeStep(capped);
    add('cap_arrays', 'Cap long arrays', 'lossy',
      cs.n === 0 ? 'no change' : cs.n + ' items dropped (arrays cut to their first 20 items)',
      out);
    return steps;
  }

  function textLadder(text) {
    var steps = [];
    var add = makeAdder(steps);
    add('original', 'Original', 'lossless', 'As pasted.', text);

    var s1 = stripAnsi(text).split('\n').map(function (l) { return l.replace(/[ \t]+$/, ''); }).join('\n');
    add('clean', 'Clean', 'lossless', s1 === text ? 'no change' : 'Colour codes and trailing spaces removed.', s1);
    var lines = s1.split('\n');
    var prev = s1;

    var tmp = [];
    lines.forEach(function (l) {
      if (l === '' && tmp.length && tmp[tmp.length - 1] === '') return;
      tmp.push(l);
    });
    var a = 0;
    var b = tmp.length;
    while (a < b && tmp[a] === '') a++;
    while (b > a && tmp[b - 1] === '') b--;
    lines = tmp.slice(a, b);
    var s2 = lines.join('\n');
    add('blank_runs', 'Collapse blank lines', 'lossless', s2 === prev ? 'no change' : 'Runs of blank lines collapsed; blank lines at the ends removed.', s2);
    prev = s2;

    var rep = [];
    var merged = 0;
    var i = 0;
    while (i < lines.length) {
      var j = i + 1;
      while (j < lines.length && lines[j] === lines[i]) j++;
      var n = j - i;
      if (n > 1) {
        rep.push(lines[i] + ' (×' + n + ')');
        merged += n - 1;
      } else {
        rep.push(lines[i]);
      }
      i = j;
    }
    lines = rep;
    var s3 = lines.join('\n');
    add('repeats', 'Merge repeated lines', 'lossy',
      merged === 0 ? 'no change' : merged + ' repeated lines merged; only the repetition count is kept', s3);
    prev = s3;

    var st = { n: 0 };
    lines = lines.map(function (l) { return l.length > 200 ? truncate(l, st) : l; });
    var s4 = lines.join('\n');
    add('long_lines', 'Trim long lines', 'lossy',
      st.n === 0 ? 'no change' : st.n + ' long line' + (st.n === 1 ? '' : 's') + ' cut to 160 characters', s4);

    var note5 = 'no change';
    if (lines.length > 160) {
      var omitted = lines.length - 160;
      lines = lines.slice(0, 80).concat(['… [' + omitted + ' lines omitted]'], lines.slice(lines.length - 80));
      note5 = omitted + ' lines omitted from the middle (first 80 and last 80 kept)';
    }
    add('head_tail', 'Keep head and tail', 'lossy', note5, lines.join('\n'));
    return steps;
  }

  function buildLadder(text) {
    var t = String(text === null || text === undefined ? '' : text);
    if (detectKind(t) === 'json') {
      try {
        return { kind: 'json', steps: jsonLadder(t) };
      } catch (e) {
        // Very deep or odd JSON: fall back to the text steps.
      }
    }
    return { kind: 'text', steps: textLadder(t) };
  }

  function parseBudget(b) {
    if (b === null || b === undefined) return null;
    if (typeof b === 'string' && b.trim() === '') return null;
    var n = Number(b);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  function fitLadder(ladder, budgetRaw) {
    var b = parseBudget(budgetRaw);
    var res = { kind: ladder.kind, steps: ladder.steps, budget: null, chosenIndex: null, fits: null };
    if (b === null) return res;
    res.budget = b;
    var idx = -1;
    for (var i = 0; i < ladder.steps.length; i++) {
      if (ladder.steps[i].tokens <= b) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      res.chosenIndex = idx;
      res.fits = true;
    } else {
      res.chosenIndex = ladder.steps.length - 1;
      res.fits = false;
    }
    return res;
  }

  function fitBudget(text, budget) {
    return fitLadder(buildLadder(text), budget);
  }

  function analyze(raw, budgetRaw) {
    var p = prepareInput(raw);
    var ladder;
    if (p.text.trim() === '') {
      ladder = {
        kind: 'text',
        steps: [{ id: 'original', label: 'Original', loss: 'lossless', note: 'Nothing to shrink.', output: '', tokens: 0 }]
      };
    } else {
      ladder = buildLadder(p.text);
    }
    var f = fitLadder(ladder, budgetRaw);
    var original = f.steps[0].tokens;
    var steps = f.steps.map(function (s) {
      var saved = original - s.tokens;
      return {
        id: s.id, label: s.label, loss: s.loss, note: s.note, output: s.output, tokens: s.tokens,
        saved: saved,
        pct: original === 0 ? 0 : Math.round(saved * 1000 / original) / 10
      };
    });
    return {
      cut: p.cut,
      kind: f.kind,
      original: original,
      low: Math.floor(original * 3 / 4),
      high: Math.ceil(original * 5 / 4),
      steps: steps,
      budget: f.budget,
      chosenIndex: f.chosenIndex,
      fits: f.fits
    };
  }

  var api = {
    MAX_INPUT: MAX_INPUT,
    estimateTokens: estimateTokens,
    prepareInput: prepareInput,
    detectKind: detectKind,
    encodeCompact: encodeCompact,
    decodeCompact: decodeCompact,
    deepEqual: deepEqual,
    stripAnsi: stripAnsi,
    buildLadder: buildLadder,
    fitBudget: fitBudget,
    analyze: analyze
  };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    globalThis.ShrinkCore = api;
  }
})();
