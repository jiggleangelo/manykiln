/* MIT · Original clean-room byte codecs, no network or dependencies. */
(function (root) {
  'use strict';
  const MAX_INPUT = 262144, formats = ['utf8', 'base64', 'base64url', 'hex', 'percent'];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function fail(code, message) { const error = new Error(code + ': ' + message); error.code = code; throw error; }
  function check(text) {
    if (typeof text !== 'string' || text.length > MAX_INPUT) fail('INPUT_LIMIT', 'Input must be text of at most 262144 UTF-16 units.');
  }
  function encode64(bytes, url) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b || 0) >> 4)];
      out += b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c || 0) >> 6)];
      out += c === undefined ? '=' : alphabet[c & 63];
    }
    return url ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out;
  }
  function decode64(text, url) {
    if (!(url ? /^[A-Za-z0-9_=-]*$/ : /^[A-Za-z0-9+/=]*$/).test(text)) fail('INVALID_CHARACTER', 'Wrong Base64 alphabet or whitespace; use compact input.');
    const first = text.indexOf('='), body = first < 0 ? text : text.slice(0, first), padding = first < 0 ? '' : text.slice(first);
    if (padding && !/^={1,2}$/.test(padding)) fail('PADDING_POSITION', 'Only one or two trailing = characters are permitted.');
    const rem = body.length % 4;
    if (rem === 1) fail('PADDING_LENGTH', 'A one-character final quantum cannot encode bytes.');
    const need = rem === 2 ? 2 : rem === 3 ? 1 : 0;
    if (padding && (padding.length !== need || text.length % 4 !== 0)) fail('PADDING_LENGTH', 'Padding count does not match the final quantum.');
    if (!url && padding.length !== need) fail('PADDING_REQUIRED', 'Standard Base64 requires trailing padding for an incomplete quantum.');
    const normalized = body.replace(/-/g, '+').replace(/_/g, '/');
    if (rem === 2 && (alphabet.indexOf(normalized.at(-1)) & 15) !== 0 || rem === 3 && (alphabet.indexOf(normalized.at(-1)) & 3) !== 0) fail('PADDING_BITS', 'Unused bits must be zero; spelling is not canonical.');
    const bytes = new Uint8Array(Math.floor(body.length * 6 / 8));
    let buffer = 0, bits = 0, index = 0;
    for (const c of normalized) {
      buffer = (buffer << 6) | alphabet.indexOf(c); bits += 6;
      if (bits >= 8) { bits -= 8; bytes[index++] = (buffer >> bits) & 255; buffer &= (1 << bits) - 1; }
    }
    return bytes;
  }
  function decode(text, format) {
    check(text);
    if (!formats.includes(format)) fail('FORMAT', 'Unknown source format.');
    if (format === 'utf8') {
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) { const next = text.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_UNICODE', 'Unpaired UTF-16 surrogate.'); }
        else if (c >= 0xdc00 && c <= 0xdfff) fail('INVALID_UNICODE', 'Unpaired UTF-16 surrogate.');
      }
      return new TextEncoder().encode(text);
    }
    if (format === 'base64' || format === 'base64url') return decode64(text, format === 'base64url');
    if (format === 'hex') {
      if (!/^[0-9a-f]*$/i.test(text)) fail('HEX_CHARACTER', 'Hex accepts digits only, without whitespace or 0x.');
      if (text.length % 2) fail('HEX_LENGTH', 'Hex needs an even number of digits.');
      return Uint8Array.from({ length: text.length / 2 }, (_, i) => parseInt(text.slice(i * 2, i * 2 + 2), 16));
    }
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '%') {
        const h = text.slice(i + 1, i + 3);
        if (!/^[0-9a-f]{2}$/i.test(h)) fail('PERCENT_ESCAPE', 'Each % must have exactly two hex digits.');
        bytes.push(parseInt(h, 16)); i += 2;
      } else {
        const code = text.charCodeAt(i);
        if (code > 127 || code < 32 || code === 127) fail('PERCENT_LITERAL', 'Use percent escapes for non-ASCII or control bytes.');
        bytes.push(code);
      }
    }
    return Uint8Array.from(bytes);
  }
  function utf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail('INVALID_UTF8', 'Bytes are not well-formed UTF-8; choose a binary output format.'); }
  }
  function encode(bytes, format) {
    if (!(bytes instanceof Uint8Array)) fail('BYTES', 'Expected Uint8Array.');
    if (bytes.length > MAX_INPUT * 3) fail('BYTE_LIMIT', 'Byte buffer exceeds resource limit.');
    if (!formats.includes(format)) fail('FORMAT', 'Unknown target format.');
    if (format === 'utf8') return utf8(bytes);
    if (format === 'base64' || format === 'base64url') return encode64(bytes, format === 'base64url');
    if (format === 'hex') return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return Array.from(bytes, b => /[A-Za-z0-9_.~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
  }
  function convert(text, from, to) {
    const bytes = decode(text, from);
    const output = encode(bytes, to);
    let utf8Valid = true;
    try { utf8(bytes); } catch { utf8Valid = false; }
    return { from, to, inputCodeUnits: text.length, byteLength: bytes.length, outputCodeUnits: output.length, utf8Valid, hexPreview: encode(bytes.slice(0, 64), 'hex'), previewTruncated: bytes.length > 64, output };
  }
  const api = Object.freeze({ decode, encode, convert, MAX_INPUT, formats: Object.freeze(formats) });
  if (typeof module === 'object' && module.exports) module.exports = { B64Hex: api };
  else root.B64Hex = api;
})(globalThis);
