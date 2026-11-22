/* qr-code-maker core.js
 * Encoder logic (mode selection, version tables, bit stream, Reed-Solomon,
 * block interleaving, mask scoring, format/version info) is ported from
 * BaconQrCode, BSD-2-Clause, Copyright (c) 2017, Ben Scholzen 'DASPRiD'.
 * See LICENSE-THIRD-PARTY. Payload builders, SVG/canvas output and the scan
 * check are original work (MIT, Copyright (c) 2026 Manykiln).
 */
(function () {
  'use strict';

  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  var ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  var ECC_IDX = { L: 0, M: 1, Q: 2, H: 3 };
  var ECC_LEVELS = ['L', 'M', 'Q', 'H'];
  var MODE_BITS = { numeric: 1, alphanumeric: 2, byte: 4 };

  /* Ported from BaconQrCode Version.php (BSD-2-Clause, (c) 2017 Ben Scholzen).
     Per version: [L, M, Q, H]; each [ecCodewordsPerBlock, count1, data1, count2, data2]. */
  var EC_TABLE = [
    [[7,1,19],[10,1,16],[13,1,13],[17,1,9]],
    [[10,1,34],[16,1,28],[22,1,22],[28,1,16]],
    [[15,1,55],[26,1,44],[18,2,17],[22,2,13]],
    [[20,1,80],[18,2,32],[26,2,24],[16,4,9]],
    [[26,1,108],[24,2,43],[18,2,15,2,16],[22,2,11,2,12]],
    [[18,2,68],[16,4,27],[24,4,19],[28,4,15]],
    [[20,2,78],[18,4,31],[18,2,14,4,15],[26,4,13,1,14]],
    [[24,2,97],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]],
    [[30,2,116],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]],
    [[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]],
    [[20,4,81],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]],
    [[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]],
    [[26,4,107],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]],
    [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
    [[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]],
    [[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]],
    [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
    [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
    [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
    [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
    [[28,4,116,4,117],[26,17,42],[28,17,22,6,23],[30,19,16,6,17]],
    [[28,2,111,7,112],[28,17,46],[30,7,24,16,25],[24,34,13]],
    [[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
    [[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
    [[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
    [[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
    [[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
    [[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
    [[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
    [[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
    [[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
    [[30,17,115],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
    [[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
    [[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
    [[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
    [[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
    [[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
    [[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
    [[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
    [[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]
  ];

  /* Alignment pattern centres per version (BaconQrCode MatrixUtil). */
  var ALIGN = [
    [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
    [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
    [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98],
    [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118],
    [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134],
    [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146],
    [6,30,54,78,102,126,150], [6,24,50,76,102,128,154], [6,28,54,80,106,132,158],
    [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170]
  ];

  function eccOf(x) {
    var e = (x === undefined || x === null) ? 'M' : String(x).toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(ECC_IDX, e)) {
      throw new RangeError('Unknown error correction level: use L, M, Q or H');
    }
    return e;
  }

  function blockInfo(version, ecc) {
    var e = EC_TABLE[version - 1][ECC_IDX[ecc]];
    var groups = [[e[1], e[2]]];
    if (e.length > 3) groups.push([e[3], e[4]]);
    var dataBytes = 0, blocks = 0;
    groups.forEach(function (g) { dataBytes += g[0] * g[1]; blocks += g[0]; });
    return { ec: e[0], groups: groups, dataBytes: dataBytes, blocks: blocks, total: dataBytes + e[0] * blocks };
  }

  function ccBits(mode, v) {
    if (mode === 'numeric') return v < 10 ? 10 : (v < 27 ? 12 : 14);
    if (mode === 'alphanumeric') return v < 10 ? 9 : (v < 27 ? 11 : 13);
    return v < 10 ? 8 : 16;
  }

  function appendBits(arr, value, n) {
    for (var i = n - 1; i >= 0; i--) arr.push((value >>> i) & 1);
  }

  function pickMode(text) {
    if (/^[0-9]+$/.test(text)) return 'numeric';
    if (/^[0-9A-Z $%*+\-.\/:]+$/.test(text)) return 'alphanumeric';
    return 'byte';
  }

  function makeSegment(text) {
    var mode = pickMode(text), bits = [], count, i;
    if (mode === 'numeric') {
      count = text.length;
      for (i = 0; i < count; i += 3) {
        var chunk = text.substr(i, 3);
        appendBits(bits, parseInt(chunk, 10), chunk.length * 3 + 1);
      }
    } else if (mode === 'alphanumeric') {
      count = text.length;
      for (i = 0; i < count; i += 2) {
        if (i + 1 < count) {
          appendBits(bits, ALNUM.indexOf(text.charAt(i)) * 45 + ALNUM.indexOf(text.charAt(i + 1)), 11);
        } else {
          appendBits(bits, ALNUM.indexOf(text.charAt(i)), 6);
        }
      }
    } else {
      var bytes = new TextEncoder().encode(text);
      count = bytes.length;
      for (i = 0; i < count; i++) appendBits(bits, bytes[i], 8);
    }
    return { mode: mode, count: count, bits: bits };
  }

  function checkVersion(v) {
    if (!Number.isInteger(v) || v < 1 || v > 40) throw new RangeError('Version must be a whole number from 1 to 40');
  }

  function capacity(version, ecc, mode) {
    checkVersion(version);
    ecc = eccOf(ecc);
    mode = mode || 'byte';
    if (!Object.prototype.hasOwnProperty.call(MODE_BITS, mode)) throw new Error('Unknown mode');
    var cc = ccBits(mode, version);
    var avail = blockInfo(version, ecc).dataBytes * 8 - 4 - cc;
    var n, r;
    if (mode === 'numeric') {
      n = Math.floor(avail / 10) * 3; r = avail % 10;
      if (r >= 7) n += 2; else if (r >= 4) n += 1;
    } else if (mode === 'alphanumeric') {
      n = Math.floor(avail / 11) * 2;
      if (avail % 11 >= 6) n += 1;
    } else {
      n = Math.floor(avail / 8);
    }
    return Math.min(n, (1 << cc) - 1);
  }

  function fitVersion(mode, count, dataBitsLen, ecc, minV) {
    for (var v = minV; v <= 40; v++) {
      var cc = ccBits(mode, v);
      if (count >= (1 << cc)) continue;
      if (4 + cc + dataBitsLen <= blockInfo(v, ecc).dataBytes * 8) return v;
    }
    return 0;
  }

  /* Reed-Solomon over GF(256), polynomial 0x11D, first root 0. */
  var EXP = null, LOG = null, GEN = {};
  function initGf() {
    if (EXP) return;
    EXP = new Array(512); LOG = new Array(256);
    var x = 1, i;
    for (i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  }
  function gmul(a, b) { return (!a || !b) ? 0 : EXP[LOG[a] + LOG[b]]; }
  function generator(n) {
    if (GEN[n]) return GEN[n];
    initGf();
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gmul(g[j], EXP[i]);
      }
      g = next;
    }
    GEN[n] = g;
    return g;
  }
  function rsRemainder(data, n) {
    var g = generator(n), res = new Array(n).fill(0);
    for (var i = 0; i < data.length; i++) {
      var f = data[i] ^ res[0];
      res.shift(); res.push(0);
      if (f) for (var j = 0; j < n; j++) res[j] ^= gmul(g[j + 1], f);
    }
    return res;
  }

  function buildCodewords(text, opts) {
    opts = opts || {};
    var ecc = eccOf(opts.ecc);
    var minV = (opts.minVersion === undefined || opts.minVersion === null) ? 1 : opts.minVersion;
    if (!Number.isInteger(minV) || minV < 1 || minV > 40) {
      throw new RangeError('Minimum version must be a whole number from 1 to 40');
    }
    text = String(text === undefined || text === null ? '' : text);
    var seg = makeSegment(text);
    var version = fitVersion(seg.mode, seg.count, seg.bits.length, ecc, minV);
    if (!version) {
      var cap = capacity(40, ecc, seg.mode);
      var err = new RangeError('too long (the most this can hold is ' + cap + (seg.mode === 'byte' ? ' bytes' : ' characters') + ' at error correction ' + ecc + ')');
      err.maxCapacity = cap;
      err.mode = seg.mode;
      throw err;
    }
    var info = blockInfo(version, ecc), i, j;
    var bits = [];
    appendBits(bits, MODE_BITS[seg.mode], 4);
    appendBits(bits, seg.count, ccBits(seg.mode, version));
    for (i = 0; i < seg.bits.length; i++) bits.push(seg.bits[i]);
    var capBits = info.dataBytes * 8;
    for (i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    for (var pad = 0; data.length < info.dataBytes; pad++) data.push(pad % 2 === 0 ? 0xEC : 0x11);
    var blocks = [], off = 0;
    info.groups.forEach(function (g) {
      for (var k = 0; k < g[0]; k++) {
        var d = data.slice(off, off + g[1]);
        off += g[1];
        blocks.push({ data: d, ec: rsRemainder(d, info.ec) });
      }
    });
    var fin = [], ecAll = [], maxD = 0;
    blocks.forEach(function (bl) { if (bl.data.length > maxD) maxD = bl.data.length; ecAll = ecAll.concat(bl.ec); });
    for (i = 0; i < maxD; i++) blocks.forEach(function (bl) { if (i < bl.data.length) fin.push(bl.data[i]); });
    for (i = 0; i < info.ec; i++) blocks.forEach(function (bl) { fin.push(bl.ec[i]); });
    return { version: version, ecc: ecc, mode: seg.mode, count: seg.count, dataBits: seg.bits.length, data: data, ec: ecAll, final: fin };
  }

  /* Matrix construction (after BaconQrCode MatrixUtil). Matrix is m[y][x], -1 = unset. */
  function bitLen(v) { var n = 0; while (v) { v >>>= 1; n++; } return n; }
  function bch(value, poly) {
    var msb = bitLen(poly);
    value <<= msb - 1;
    while (bitLen(value) >= msb) value ^= poly << (bitLen(value) - msb);
    return value;
  }

  function buildBase(version) {
    var size = 17 + 4 * version, m = [], x, y, i, j;
    for (y = 0; y < size; y++) m.push(new Array(size).fill(-1));
    function finder(x0, y0) {
      for (var yy = 0; yy < 7; yy++) for (var xx = 0; xx < 7; xx++) {
        var dark = xx === 0 || xx === 6 || yy === 0 || yy === 6 || (xx >= 2 && xx <= 4 && yy >= 2 && yy <= 4);
        m[y0 + yy][x0 + xx] = dark ? 1 : 0;
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (i = 0; i < 8; i++) { m[7][i] = 0; m[7][size - 8 + i] = 0; m[size - 8][i] = 0; }
    for (i = 0; i < 7; i++) { m[i][7] = 0; m[i][size - 8] = 0; m[size - 7 + i][7] = 0; }
    m[size - 8][8] = 1;
    var c = ALIGN[version - 1];
    if (version >= 2) {
      for (i = 0; i < c.length; i++) for (j = 0; j < c.length; j++) {
        var cy = c[i], cx = c[j];
        if (m[cy][cx] !== -1) continue;
        for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 5; xx++) {
          var ring = xx === 0 || xx === 4 || yy === 0 || yy === 4 || (xx === 2 && yy === 2);
          m[cy - 2 + yy][cx - 2 + xx] = ring ? 1 : 0;
        }
      }
    }
    for (i = 8; i < size - 8; i++) {
      var bit = (i + 1) % 2;
      if (m[6][i] === -1) m[6][i] = bit;
      if (m[i][6] === -1) m[i][6] = bit;
    }
    if (version >= 7) {
      var vb = (version << 12) | bch(version, 0x1f25);
      for (var k = 0; k < 18; k++) {
        var vbit = (vb >> k) & 1, a = size - 11 + (k % 3), b = Math.floor(k / 3);
        m[b][a] = vbit;
        m[a][b] = vbit;
      }
    }
    return m;
  }

  function setFormat(m, eccBits, mask) {
    var size = m.length, i;
    var ti = (eccBits << 3) | mask;
    var fmt = ((ti << 10) | bch(ti, 0x537)) ^ 0x5412;
    function bit(k) { return (fmt >> k) & 1; }
    for (i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    m[8][7] = bit(8);
    for (i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
    for (i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function placeData(m, bits, mask) {
    var n = m.length, idx = 0, dir = -1, x = n - 1, y = n - 1;
    while (x > 0) {
      if (x === 6) x--;
      while (y >= 0 && y < n) {
        for (var i = 0; i < 2; i++) {
          var xx = x - i;
          if (m[y][xx] !== -1) continue;
          var bit = idx < bits.length ? bits[idx++] : 0;
          if (maskBit(mask, xx, y)) bit ^= 1;
          m[y][xx] = bit;
        }
        y += dir;
      }
      dir = -dir;
      y += dir;
      x -= 2;
    }
  }

  /* Mask penalty rules (after BaconQrCode MaskUtil). */
  function rule1(m) {
    var n = m.length, p = 0;
    for (var dir = 0; dir < 2; dir++) for (var i = 0; i < n; i++) {
      var run = 0, prev = -1;
      for (var j = 0; j < n; j++) {
        var b = dir ? m[j][i] : m[i][j];
        if (b === prev) run++;
        else { if (run >= 5) p += 3 + run - 5; run = 1; prev = b; }
      }
      if (run >= 5) p += 3 + run - 5;
    }
    return p;
  }
  function rule2(m) {
    var n = m.length, p = 0;
    for (var y = 0; y < n - 1; y++) for (var x = 0; x < n - 1; x++) {
      var v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) p++;
    }
    return p * 3;
  }
  function rule3(m) {
    var n = m.length, p = 0;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var r = m[y];
      if (x + 6 < n && r[x] === 1 && r[x + 1] === 0 && r[x + 2] === 1 && r[x + 3] === 1 && r[x + 4] === 1 && r[x + 5] === 0 && r[x + 6] === 1 &&
          ((x + 10 < n && r[x + 7] === 0 && r[x + 8] === 0 && r[x + 9] === 0 && r[x + 10] === 0) ||
           (x - 4 >= 0 && r[x - 1] === 0 && r[x - 2] === 0 && r[x - 3] === 0 && r[x - 4] === 0))) p += 40;
      if (y + 6 < n && r[x] === 1 && m[y + 1][x] === 0 && m[y + 2][x] === 1 && m[y + 3][x] === 1 && m[y + 4][x] === 1 && m[y + 5][x] === 0 && m[y + 6][x] === 1 &&
          ((y + 10 < n && m[y + 7][x] === 0 && m[y + 8][x] === 0 && m[y + 9][x] === 0 && m[y + 10][x] === 0) ||
           (y - 4 >= 0 && m[y - 1][x] === 0 && m[y - 2][x] === 0 && m[y - 3][x] === 0 && m[y - 4][x] === 0))) p += 40;
    }
    return p;
  }
  function rule4(m) {
    var n = m.length, dark = 0;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x] === 1) dark++;
    var ratio = dark / (n * n);
    return Math.floor(Math.abs(ratio - 0.5) * 20) * 10;
  }
  function penalty(m) { return rule1(m) + rule2(m) + rule3(m) + rule4(m); }

  function encode(text, opts) {
    var cw = buildCodewords(text, opts);
    var bits = [];
    cw.final.forEach(function (b) { appendBits(bits, b, 8); });
    var base = buildBase(cw.version), best = null, bestPen = Infinity, bestMask = 0;
    for (var mask = 0; mask < 8; mask++) {
      var m = base.map(function (r) { return r.slice(); });
      setFormat(m, ECC_BITS[cw.ecc], mask);
      placeData(m, bits, mask);
      var pen = penalty(m);
      if (pen < bestPen) { bestPen = pen; best = m; bestMask = mask; }
    }
    return { version: cw.version, ecc: cw.ecc, mode: cw.mode, mask: bestMask, size: best.length, modules: best, count: cw.count, dataBits: cw.dataBits };
  }

  /* ---------- Payload builders (original) ---------- */
  function escText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
  }
  function str(v) { return (v === undefined || v === null) ? '' : String(v); }
  var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  function cleanNumber(v) {
    var s = str(v).trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d{3,15}$/.test(s)) throw new Error('Enter a phone number with digits only (a leading + is allowed).');
    return s;
  }

  function buildWifi(o) {
    o = o || {};
    var ssid = str(o.ssid);
    if (!ssid) throw new Error('Enter the network name (SSID).');
    var sec = str(o.security || 'WPA').toUpperCase();
    if (sec === 'NONE') sec = 'NOPASS';
    if (sec !== 'WPA' && sec !== 'WEP' && sec !== 'NOPASS') throw new Error('Choose WPA, WEP or no password.');
    var esc = function (s) { return s.replace(/([\\;,:"])/g, '\\$1'); };
    var out = 'WIFI:T:' + (sec === 'NOPASS' ? 'nopass' : sec) + ';S:' + esc(ssid) + ';';
    if (sec !== 'NOPASS') {
      var pw = str(o.password);
      if (!pw) throw new Error('Enter the Wi-Fi password, or choose no password.');
      out += 'P:' + esc(pw) + ';';
    }
    if (o.hidden) out += 'H:true;';
    return out + ';';
  }

  function buildVCard(o) {
    o = o || {};
    var name = str(o.name).trim();
    if (!name) throw new Error('Enter a name for the contact.');
    var parts = name.split(/\s+/);
    var family = parts.length > 1 ? parts.pop() : '';
    var lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + escText(family) + ';' + escText(parts.join(' ')) + ';;;', 'FN:' + escText(name)];
    if (str(o.org).trim()) lines.push('ORG:' + escText(str(o.org).trim()));
    if (str(o.phone).trim()) {
      var ph = str(o.phone).trim();
      if (!/^[0-9+().\s-]{3,}$/.test(ph)) throw new Error('The phone number may only use digits, spaces and + ( ) . -');
      lines.push('TEL;TYPE=CELL:' + escText(ph));
    }
    if (str(o.email).trim()) {
      if (!EMAIL_RE.test(str(o.email).trim())) throw new Error('That email address does not look right.');
      lines.push('EMAIL:' + escText(str(o.email).trim()));
    }
    if (str(o.url).trim()) lines.push('URL:' + str(o.url).trim().replace(/[\r\n]+/g, ''));
    if (str(o.address).trim()) lines.push('ADR;TYPE=HOME:;;' + escText(str(o.address).trim()) + ';;;;');
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  function buildMailto(o) {
    o = o || {};
    var to = str(o.to).trim();
    if (!to) throw new Error('Enter an email address.');
    var addrs = to.split(',').map(function (a) { return a.trim(); });
    addrs.forEach(function (a) { if (!EMAIL_RE.test(a)) throw new Error('That email address does not look right.'); });
    var out = 'mailto:' + addrs.map(function (a) { return encodeURIComponent(a).replace(/%40/g, '@'); }).join(',');
    var q = [];
    if (str(o.subject)) q.push('subject=' + encodeURIComponent(str(o.subject)));
    if (str(o.body)) q.push('body=' + encodeURIComponent(str(o.body).replace(/\r?\n/g, '\r\n')));
    return q.length ? out + '?' + q.join('&') : out;
  }

  function buildSms(a, b) {
    var number = a, message = b;
    if (a && typeof a === 'object') { number = a.number; message = a.message; }
    return 'SMSTO:' + cleanNumber(number) + ':' + str(message);
  }

  function buildTel(a) {
    var number = (a && typeof a === 'object') ? a.number : a;
    return 'tel:' + cleanNumber(number);
  }

  function toNum(v, label) {
    if (v === '' || v === null || v === undefined) throw new Error('Enter the ' + label + '.');
    var n = Number(v);
    if (!isFinite(n)) throw new Error('The ' + label + ' must be a number.');
    return n;
  }
  function buildGeo(a, b) {
    var lat = a, lng = b;
    if (a && typeof a === 'object') { lat = a.lat; lng = a.lng; }
    lat = toNum(lat, 'latitude');
    lng = toNum(lng, 'longitude');
    if (lat < -90 || lat > 90) throw new Error('Latitude must be between -90 and 90.');
    if (lng < -180 || lng > 180) throw new Error('Longitude must be between -180 and 180.');
    return 'geo:' + lat + ',' + lng;
  }

  function icsTime(v, label) {
    var s = str(v).trim();
    var c = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s);
    if (c) s = c[1] + '-' + c[2] + '-' + c[3] + 'T' + c[4] + ':' + c[5] + ':' + c[6];
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) throw new Error('Enter the ' + label + ' date and time.');
    var mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], se = +(m[6] || 0);
    var dt = new Date(Date.UTC(+m[1], mo - 1, d));
    if (mo < 1 || mo > 12 || dt.getUTCDate() !== d || h > 23 || mi > 59 || se > 59) {
      throw new Error('The ' + label + ' date or time is not valid.');
    }
    return m[1] + m[2] + m[3] + 'T' + m[4] + m[5] + (se < 10 ? '0' : '') + se;
  }
  function buildEvent(o) {
    o = o || {};
    var title = str(o.title).trim();
    if (!title) throw new Error('Enter a title for the event.');
    var start = icsTime(o.start, 'start');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:' + escText(title), 'DTSTART:' + start];
    if (str(o.end).trim()) {
      var end = icsTime(o.end, 'end');
      if (end < start) throw new Error('The end must not be before the start.');
      lines.push('DTEND:' + end);
    }
    if (str(o.location).trim()) lines.push('LOCATION:' + escText(str(o.location).trim()));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  function linkHint(text) {
    var t = str(text).trim();
    if (!t || /\s/.test(t)) return '';
    if (/^[a-z][a-z0-9+.\-]*:/i.test(t)) return '';
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#:].*)?$/i.test(t)) return 'Add https:// so phones open it as a link.';
    return '';
  }

  /* ---------- Output (original) ---------- */
  function checkColor(c, name) {
    if (typeof c !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error(name + ' must be a colour like #000000');
    return c;
  }
  function checkQuiet(q) {
    if (q === undefined || q === null) return 4;
    if (!Number.isInteger(q) || q < 0 || q > 10) throw new RangeError('Quiet zone must be a whole number from 0 to 10 modules');
    return q;
  }
  function runs(modules) {
    var out = [], n = modules.length;
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (modules[y][x] === 1) {
          var s = x;
          while (x < n && modules[y][x] === 1) x++;
          out.push([s, y, x - s]);
        } else x++;
      }
    }
    return out;
  }

  function toSvg(result, o) {
    o = o || {};
    var fg = checkColor(o.fg === undefined ? '#000000' : o.fg, 'Module colour');
    var bg = checkColor(o.bg === undefined ? '#ffffff' : o.bg, 'Background colour');
    var q = checkQuiet(o.quiet);
    var t = result.size + 2 * q;
    var d = runs(result.modules).map(function (r) {
      return 'M' + (r[0] + q) + ' ' + (r[1] + q) + 'h' + r[2] + 'v1h-' + r[2] + 'z';
    }).join('');
    var dim = (typeof o.px === 'number' && isFinite(o.px) && o.px > 0) ? ' width="' + Math.round(o.px) + '" height="' + Math.round(o.px) + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '"' + dim + ' shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + t + '" height="' + t + '" fill="' + bg + '"/>' +
      '<path fill="' + fg + '" d="' + d + '"/></svg>';
  }

  function toCanvasPlan(result, o) {
    o = o || {};
    checkColor(o.fg === undefined ? '#000000' : o.fg, 'Module colour');
    checkColor(o.bg === undefined ? '#ffffff' : o.bg, 'Background colour');
    var q = checkQuiet(o.quiet);
    var px = (typeof o.px === 'number' && isFinite(o.px)) ? o.px : 512;
    var t = result.size + 2 * q;
    var scale = Math.max(1, Math.floor(px / t));
    var rects = runs(result.modules).map(function (r) {
      return { x: (r[0] + q) * scale, y: (r[1] + q) * scale, w: r[2] * scale, h: scale };
    });
    return { width: t * scale, height: t * scale, scale: scale, rects: rects };
  }

  /* ---------- Scan check (original) ---------- */
  function lum(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastRatio(a, b) {
    checkColor(a, 'Colour'); checkColor(b, 'Colour');
    var la = lum(a), lb = lum(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }

  function scanAdvice(result, o) {
    o = o || {};
    var fg = checkColor(o.fg === undefined ? '#000000' : o.fg, 'Module colour');
    var bg = checkColor(o.bg === undefined ? '#ffffff' : o.bg, 'Background colour');
    var quiet = checkQuiet(o.quiet);
    var dist = o.distanceCm === undefined ? 100 : Number(o.distanceCm);
    if (!isFinite(dist) || dist <= 0) throw new Error('Scan distance must be more than 0 cm.');
    var contrast = contrastRatio(fg, bg);
    var contrastOk = contrast >= 4;
    var inverted = lum(fg) > lum(bg);
    var quietOk = quiet >= 4;
    var total = result.size + 2 * quiet;
    var minPrintCm = Math.ceil(dist - 1e-9) / 10;
    var moduleMm = (minPrintCm * 10) / total;
    var warnings = [];
    if (inverted) warnings.push('Light code on a dark background (inverted): many scanners fail on it. Use a dark code on a light background.');
    if (!contrastOk) warnings.push('Contrast is ' + contrast + ':1, which is low. Aim for at least 4:1.');
    if (!quietOk) warnings.push('The quiet zone is ' + quiet + ' modules. Use at least 4 so scanners can find the edges.');
    if (moduleMm < 0.4) warnings.push('Each module would be about ' + moduleMm.toFixed(2) + ' mm, which is too small to print reliably (aim for 0.4 mm or more). Shorten the content or scan from closer.');
    if (result.version > 10) warnings.push('This is a dense code (version ' + result.version + '). Shorten the content if you can; dense codes are harder to scan.');
    var eccCompare = [];
    if (typeof result.dataBits === 'number' && typeof result.count === 'number') {
      ECC_LEVELS.forEach(function (e) {
        var v = fitVersion(result.mode, result.count, result.dataBits, e, 1);
        eccCompare.push({ ecc: e, version: v || null, size: v ? 17 + 4 * v : null });
      });
    }
    return { contrast: contrast, contrastOk: contrastOk, inverted: inverted, quietOk: quietOk, minPrintCm: minPrintCm, moduleMm: moduleMm, warnings: warnings, eccCompare: eccCompare };
  }

  var api = {
    encode: encode,
    capacity: capacity,
    buildWifi: buildWifi,
    buildVCard: buildVCard,
    buildMailto: buildMailto,
    buildSms: buildSms,
    buildTel: buildTel,
    buildGeo: buildGeo,
    buildEvent: buildEvent,
    linkHint: linkHint,
    toSvg: toSvg,
    toCanvasPlan: toCanvasPlan,
    contrastRatio: contrastRatio,
    scanAdvice: scanAdvice,
    _codewords: buildCodewords
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else globalThis.QrCore = api;
})();
