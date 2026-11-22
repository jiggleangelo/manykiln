/* Original Manykiln implementation. MIT License. */
(function (root) {
  'use strict';
  const fail = message => { throw new Error(message); };
  const MAX_ROWS = 512;
  function ipv4(text) {
    const octets = text.split('.');
    if (octets.length !== 4 || octets.some(x => !/^(0|[1-9]\d{0,2})$/.test(x) || Number(x) > 255)) fail('Invalid IPv4 address: use four decimal octets without leading zeros.');
    return octets.reduce((n, x) => (n << 8n) | BigInt(x), 0n);
  }
  function parseAddress(text) {
    if (typeof text !== 'string' || !text || text.length > 80 || /\s|%|\[|\]|\//.test(text)) fail('Invalid address syntax; zones, brackets and whitespace are not supported.');
    if (!text.includes(':')) return { value: ipv4(text), bits: 32, family: 4 };
    let source = text;
    if (source.includes('.')) {
      const p = source.lastIndexOf(':');
      const v = ipv4(source.slice(p + 1));
      source = source.slice(0, p + 1) + (v >> 16n).toString(16) + ':' + (v & 65535n).toString(16);
    }
    if (!/^[\da-fA-F:]+$/.test(source) || source.includes(':::') || source.split('::').length > 2) fail('Invalid IPv6 address.');
    let groups;
    if (source.includes('::')) {
      const [a, b] = source.split('::');
      const left = a ? a.split(':') : [], right = b ? b.split(':') : [];
      if (left.length + right.length >= 8) fail('IPv6 :: must replace at least one group.');
      groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    } else groups = source.split(':');
    if (groups.length !== 8 || groups.some(x => !/^[\da-fA-F]{1,4}$/.test(x))) fail('IPv6 requires eight groups or one valid :: compression.');
    return { value: groups.reduce((n, x) => (n << 16n) | BigInt('0x' + x), 0n), bits: 128, family: 6 };
  }
  function formatAddress(value, bits) {
    if (typeof value !== 'bigint' || ![32, 128].includes(bits) || value < 0n || value >= (1n << BigInt(bits))) fail('Address value out of range.');
    if (bits === 32) return [24n, 16n, 8n, 0n].map(shift => String((value >> shift) & 255n)).join('.');
    // RFC 5952 section 5: recognize IPv4-mapped addresses and use mixed notation.
    if ((value >> 32n) === 65535n) return '::ffff:' + formatAddress(value & 0xffffffffn, 32);
    const g = Array.from({ length: 8 }, (_, i) => ((value >> BigInt(112 - 16 * i)) & 65535n).toString(16));
    let best = -1, length = 1;
    for (let i = 0; i < 8;) {
      if (g[i] !== '0') { i++; continue; }
      let end = i;
      while (end < 8 && g[end] === '0') end++;
      if (end - i > length) { best = i; length = end - i; }
      i = end;
    }
    if (best < 0) return g.join(':');
    return g.slice(0, best).join(':') + '::' + g.slice(best + length).join(':');
  }
  function make(value, bits, prefix) {
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) fail('Prefix out of range.');
    const size = 1n << BigInt(bits - prefix), network = value / size * size;
    return { family: bits === 32 ? 4 : 6, bits, prefix, address: value, network, last: network + size - 1n, size, cidr: formatAddress(network, bits) + '/' + prefix, normalized: network !== value };
  }
  function parseCIDR(text) {
    if (typeof text !== 'string' || text.length > 90) fail('Invalid CIDR.');
    const match = /^([^/\s]+)\/(0|[1-9]\d{0,2})$/.exec(text.trim());
    if (!match) fail('Invalid CIDR: require address/prefix, with no leading-zero prefix.');
    const a = parseAddress(match[1]);
    return make(a.value, a.bits, Number(match[2]));
  }
  function describe(c) {
    const usable = c.bits === 32 && c.prefix <= 30 ? c.size - 2n : c.size;
    const first = c.bits === 32 && c.prefix <= 30 ? c.network + 1n : c.network;
    const last = c.bits === 32 && c.prefix <= 30 ? c.last - 1n : c.last;
    const mask = ((1n << BigInt(c.prefix)) - 1n) << BigInt(c.bits - c.prefix);
    return { cidr: c.cidr, family: c.family, prefix: c.prefix, inputAddress: formatAddress(c.address, c.bits), normalized: c.normalized, network: formatAddress(c.network, c.bits), last: formatAddress(c.last, c.bits), mask: formatAddress(mask, c.bits), addresses: String(c.size), usable: String(usable), firstUsable: formatAddress(first, c.bits), lastUsable: formatAddress(last, c.bits), broadcast: c.bits === 32 && c.prefix <= 30 ? formatAddress(c.last, c.bits) : null };
  }
  function relation(a, b) {
    if (a.bits !== b.bits) return { overlaps: false, aContainsB: false, bContainsA: false, sameFamily: false };
    return { overlaps: a.network <= b.last && b.network <= a.last, aContainsB: a.network <= b.network && a.last >= b.last, bContainsA: b.network <= a.network && b.last >= a.last, sameFamily: true };
  }
  function parseList(text) {
    if (typeof text !== 'string' || text.length > 65536) fail('CIDR list exceeds 65536 characters.');
    const rows = text.split(/\r?\n/).map((x, i) => ({ text: x.trim(), line: i + 1 })).filter(x => x.text);
    if (!rows.length || rows.length > MAX_ROWS) fail('Enter 1–512 CIDRs, one per line.');
    return rows.map(x => { try { return parseCIDR(x.text); } catch (e) { fail('Line ' + x.line + ': ' + e.message); } });
  }
  function summarize(items) {
    if (!Array.isArray(items) || !items.length || items.length > MAX_ROWS) fail('Summarization requires 1–512 CIDRs.');
    const result = [];
    for (const bits of [32, 128]) {
      const ranges = items.filter(c => c.bits === bits).map(c => [c.network, c.last]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      const merged = [];
      for (const r of ranges) {
        const prev = merged[merged.length - 1];
        if (prev && r[0] <= prev[1] + 1n) { if (r[1] > prev[1]) prev[1] = r[1]; } else merged.push([...r]);
      }
      for (const [start, end] of merged) {
        let at = start;
        while (at <= end) {
          let host = 0;
          while (host < bits && at % (1n << BigInt(host + 1)) === 0n && at + (1n << BigInt(host + 1)) - 1n <= end) host++;
          const c = make(at, bits, bits - host);
          result.push(c); at += c.size;
        }
      }
    }
    return result;
  }
  function splitVLSM(parent, text) {
    if (typeof text !== 'string' || text.length > 32768) fail('Request list too large.');
    const tokens = text.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    if (!tokens.length || tokens.length > MAX_ROWS) fail('Enter 1–512 requests as /prefix or hosts:count.');
    const requests = tokens.map((token, index) => {
      let prefix;
      if (/^\/(0|[1-9]\d{0,2})$/.test(token)) prefix = Number(token.slice(1));
      else if (/^hosts:(0|[1-9]\d{0,39})$/.test(token)) {
        const count = BigInt(token.slice(6));
        if (count < 1n || count > (1n << BigInt(parent.bits))) fail('Host count out of range at request ' + (index + 1) + '.');
        let host = 0;
        // IPv4 /31 and /32 use point-to-point/single-host semantics.
        while (host <= parent.bits) {
          const size = 1n << BigInt(host), usable = parent.bits === 32 && host >= 2 ? size - 2n : size;
          if (usable >= count) break;
          host++;
        }
        prefix = parent.bits - host;
      } else fail('Invalid request ' + (index + 1) + ': use /prefix or hosts:count.');
      if (prefix < parent.prefix || prefix > parent.bits) fail('Request ' + (index + 1) + ' does not fit the parent prefix.');
      return { index, request: token, prefix, size: 1n << BigInt(parent.bits - prefix) };
    }).sort((a, b) => a.prefix - b.prefix || a.index - b.index);
    let at = parent.network;
    const allocations = requests.map(r => {
      const aligned = (at + r.size - 1n) / r.size * r.size;
      if (aligned + r.size - 1n > parent.last) fail('Insufficient parent space at request ' + (r.index + 1) + '; no partial allocation returned.');
      const block = make(aligned, parent.bits, r.prefix); at = aligned + r.size;
      return { request: r.request, requestNumber: r.index + 1, ...describe(block) };
    });
    return { parent: parent.cidr, allocations, unallocatedAddresses: String(parent.last - at + 1n) };
  }
  function analyze(text, requests = '') {
    const cidrs = parseList(text), overlaps = [];
    for (let i = 0; i < cidrs.length; i++) for (let j = i + 1; j < cidrs.length; j++) {
      const r = relation(cidrs[i], cidrs[j]);
      if (r.overlaps) overlaps.push({ a: i + 1, b: j + 1, ...r });
    }
    return { subnets: cidrs.map(describe), overlaps, summary: summarize(cidrs).map(describe), vlsm: requests.trim() ? splitVLSM(cidrs[0], requests) : null };
  }
  function csv(report) {
    const headers = ['kind','request','cidr','family','prefix','network','last','mask','addresses','usable','firstUsable','lastUsable','broadcast','normalized'];
    const quote = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    const rows = [];
    for (const [kind, items] of [['subnet',report.subnets],['summary',report.summary],['allocation',report.vlsm?.allocations || []]]) for (const c of items) rows.push([kind, ...headers.slice(1).map(h => c[h])]);
    return [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  const api = { parseAddress, formatAddress, parseCIDR, describe, relation, parseList, summarize, splitVLSM, analyze, csv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IPCIDR = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
