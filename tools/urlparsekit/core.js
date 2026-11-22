/* Original Manykiln implementation. MIT license. */
(function (root) {
  'use strict';
  const LIMIT = 65536;
  const unreserved = /^[A-Za-z0-9._~-]$/;
  function fail(message) { throw new Error(message); }
  function pct(s) {
    return s.replace(/%([0-9a-f]{2})/gi, (_, hex) => {
      const c = String.fromCharCode(parseInt(hex, 16));
      return unreserved.test(c) ? c : '%' + hex.toUpperCase();
    });
  }
  function ipv6(s) {
    if (!s || /[^0-9a-f:.]/i.test(s) || (s.match(/::/g) || []).length > 1) return false;
    if (s.includes('.')) {
      const i = s.lastIndexOf(':'), v = s.slice(i + 1).split('.');
      if (i < 0 || v.length !== 4 || v.some(x => !/^(0|[1-9][0-9]{0,2})$/.test(x) || +x > 255)) return false;
      s = s.slice(0, i + 1) + '0:0';
    }
    const compressed = s.includes('::');
    const sides = s.split('::');
    const parts = sides.flatMap(x => x ? x.split(':') : []);
    return parts.every(x => /^[0-9a-f]{1,4}$/i.test(x)) && (compressed ? parts.length < 8 : parts.length === 8);
  }
  function parse(input) {
    if (typeof input !== 'string' || input.length > LIMIT) fail('URL must be text of at most ' + LIMIT + ' characters.');
    if (/[^\x21-\x7e]/.test(input)) fail('RFC 3986 uses ASCII URI references: percent-encode spaces, controls and Unicode.');
    if (/%(?![0-9a-f]{2})/i.test(input)) fail('Invalid percent escape; expected %HH.');
    const m = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(input);
    if (!m) fail('Invalid URI-reference syntax.');
    const out = { scheme: m[1] ?? null, authority: m[2] ?? null, userinfo: null, host: null, port: null, path: m[3], query: m[4] ?? null, fragment: m[5] ?? null };
    if (!/^(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[0-9a-f]{2})*$/i.test(out.path)) fail('Invalid path character.');
    for (const k of ['query', 'fragment']) if (out[k] !== null && !/^(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9a-f]{2})*$/i.test(out[k])) fail('Invalid ' + k + ' character.');
    if (out.authority === null) {
      if (!out.scheme && out.path.split('/')[0].includes(':')) fail('A relative first path segment cannot contain a colon.');
      return out;
    }
    let auth = out.authority;
    const at = auth.indexOf('@');
    if (at !== -1) {
      out.userinfo = auth.slice(0, at); auth = auth.slice(at + 1);
      if (!/^(?:[A-Za-z0-9._~!$&'()*+,;=:-]|%[0-9a-f]{2})*$/i.test(out.userinfo)) fail('Invalid userinfo or multiple @ delimiters.');
    }
    if (auth.startsWith('[')) {
      const end = auth.indexOf(']');
      if (end < 0) fail('Unclosed IP host bracket.');
      out.host = auth.slice(0, end + 1);
      const ip = auth.slice(1, end), rest = auth.slice(end + 1);
      if (!ipv6(ip) && !/^v[0-9a-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i.test(ip)) fail('Invalid IPv6 or IPvFuture literal (zone identifiers are outside RFC 3986).');
      if (rest && !rest.startsWith(':')) fail('Unexpected text after IP host bracket.');
      out.port = rest ? rest.slice(1) : null;
    } else {
      const i = auth.indexOf(':');
      out.host = i < 0 ? auth : auth.slice(0, i); out.port = i < 0 ? null : auth.slice(i + 1);
      if (!/^(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9a-f]{2})*$/i.test(out.host)) fail('Invalid reg-name host; IPv6 requires brackets.');
    }
    if (out.port !== null && !/^[0-9]*$/.test(out.port)) fail('Port must contain decimal digits only.');
    return out;
  }
  function join(p) {
    return (p.scheme === null ? '' : p.scheme + ':') + (p.authority === null ? '' : '//' + (p.userinfo === null ? '' : p.userinfo + '@') + p.host + (p.port === null ? '' : ':' + p.port)) + p.path + (p.query === null ? '' : '?' + p.query) + (p.fragment === null ? '' : '#' + p.fragment);
  }
  // Streaming form of the RFC dot-segment removal procedure; empty segments survive.
  function dots(path) {
    let rest = path, result = '';
    while (rest) {
      if (rest.startsWith('../')) rest = rest.slice(3);
      else if (rest.startsWith('./')) rest = rest.slice(2);
      else if (rest.startsWith('/./')) rest = rest.slice(2);
      else if (rest === '/.') rest = '/';
      else if (rest.startsWith('/../') || rest === '/..') {
        rest = rest === '/..' ? '/' : rest.slice(3); result = result.replace(/\/?[^/]*$/, '');
      } else if (rest === '.' || rest === '..') rest = '';
      else {
        const end = rest.indexOf('/', rest[0] === '/' ? 1 : 0);
        const n = end < 0 ? rest.length : end;
        result += rest.slice(0, n); rest = rest.slice(n);
      }
    }
    return result;
  }
  function normalize(input) {
    const p = parse(input);
    if (p.scheme !== null) p.scheme = p.scheme.toLowerCase();
    if (p.host !== null) p.host = pct(p.host).toLowerCase().replace(/%[0-9a-f]{2}/g, x => x.toUpperCase());
    if (p.userinfo !== null) p.userinfo = pct(p.userinfo);
    if (p.port !== null) {
      p.port = p.port.replace(/^0+(?=\d)/, '');
      if (p.port === '' || ({http:'80', https:'443', ftp:'21', ws:'80', wss:'443'})[p.scheme] === p.port) p.port = null;
    }
    p.path = dots(pct(p.path));
    if (p.authority !== null && !p.path && /^(https?|wss?)$/.test(p.scheme || '')) p.path = '/';
    if (p.query !== null) p.query = pct(p.query);
    if (p.fragment !== null) p.fragment = pct(p.fragment);
    return join(p);
  }
  function decode(s) { try { return decodeURIComponent(s); } catch { fail('Query contains bytes that are not valid UTF-8; parse/normalize still accept opaque %HH bytes.'); } }
  function encode(s) {
    if (typeof s !== 'string') fail('Query key/value must be text.');
    try { return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
    catch { fail('Query text contains an unpaired Unicode surrogate.'); }
  }
  function entries(input) {
    const p = parse(input);
    if (p.query === null || p.query === '') return [];
    return p.query.split('&').map(piece => {
      const i = piece.indexOf('=');
      return { key: decode(i < 0 ? piece : piece.slice(0, i)), value: decode(i < 0 ? '' : piece.slice(i + 1)), equals: i >= 0 };
    });
  }
  function edit(input, rows) {
    const p = parse(input);
    if (!Array.isArray(rows) || rows.length > 2000) fail('At most 2000 query entries are supported.');
    p.query = rows.length ? rows.map(r => {
      if (!r || typeof r.equals !== 'boolean') fail('Each query row requires an equals boolean.');
      if (!r.equals && r.value !== '') fail('A bare query key cannot have a value.');
      return encode(r.key) + (r.equals ? '=' + encode(r.value) : '');
    }).join('&') : null;
    const result = join(p); parse(result); return result;
  }
  function diff(left, right) {
    const a = parse(left), b = parse(right);
    return ['scheme','authority','userinfo','host','port','path','query','fragment'].map(component => ({ component, left: a[component], right: b[component], changed: a[component] !== b[component] }));
  }
  const api = Object.freeze({ LIMIT, parse, join, normalize, entries, edit, diff, dots });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrlKit = api;
})(typeof globalThis === 'object' ? globalThis : this);
