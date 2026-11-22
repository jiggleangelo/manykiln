/* Original clean-room implementation. MIT License. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JWTInspector = api;
})(globalThis, function () {
  'use strict';
  const encoder = new TextEncoder();
  function decode(segment, name) {
    if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) throw Error(name + ': invalid unpadded Base64URL.');
    let raw;
    try { raw = atob(segment.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-segment.length%4)%4)); }
    catch { throw Error(name + ': invalid Base64URL.'); }
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const canonical = btoa(raw).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    if (canonical !== segment) throw Error(name + ': noncanonical Base64URL padding bits.');
    return bytes;
  }
  // A small strict JSON reader rejects duplicate member names, including escaped aliases.
  function strictJSON(source) {
    let i = 0;
    const space = () => { while (/[\x20\t\r\n]/.test(source[i] || '\0')) i++; };
    function string() {
      const start = i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i++] === '"') return JSON.parse(source.slice(start,i));
      }
      throw Error('Unterminated JSON string.');
    }
    function value(depth) {
      if (depth > 32) throw Error('JSON nesting exceeds 32.');
      space(); const ch = source[i];
      if (ch === '"') return string();
      if (ch === '{' || ch === '[') {
        const object = ch === '{', end = object ? '}' : ']', out = object ? {} : [], seen = new Set();
        i++; space(); if (source[i] === end) { i++; return out; }
        while (i < source.length) {
          space(); let key;
          if (object) {
            if (source[i] !== '"') throw Error('Expected JSON member name.');
            key = string(); if (seen.has(key)) throw Error('Duplicate JSON member name.'); seen.add(key);
            space(); if (source[i++] !== ':') throw Error('Expected JSON colon.');
          }
          const item = value(depth+1);
          if (object) Object.defineProperty(out,key,{value:item,enumerable:true,writable:true,configurable:true}); else out.push(item);
          space(); const separator = source[i++]; if (separator === end) return out;
          if (separator !== ',') throw Error('Expected JSON separator.');
        }
        throw Error('Unterminated JSON container.');
      }
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
      if (!match) throw Error('Invalid JSON value.');
      i += match[0].length; const out = JSON.parse(match[0]);
      if (typeof out === 'number' && !Number.isFinite(out)) throw Error('Nonfinite JSON number.');
      return out;
    }
    const result = value(0); space(); if (i !== source.length) throw Error('Trailing JSON data.'); return result;
  }
  function jsonPart(bytes, name) {
    let value;
    try { value = strictJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch (error) { throw Error(name + ': ' + error.message); }
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(name + ' must be a JSON object.');
    return value;
  }
  function control(value, name, max) {
    if (value === '' || value === null || typeof value === 'boolean' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > max) throw Error(name + ' must be a nonnegative integer up to ' + max + '.');
    return Number(value);
  }
  async function inspect({token, key = '', now = Math.floor(Date.now()/1000), skew = 0, expectedIssuer = '', expectedAudience = ''}) {
    if (typeof token !== 'string' || !token || encoder.encode(token).length > 262144) throw Error('Supply a compact JWT within 256 KiB.');
    if (typeof key !== 'string' || encoder.encode(key).length > 16384) throw Error('Test key exceeds 16 KiB.');
    now = control(now,'Current Unix seconds',Number.MAX_SAFE_INTEGER); skew = control(skew,'Clock skew',86400);
    const parts = token.split('.'); if (parts.length !== 3) throw Error('Expected three compact JWT segments; JWE is unsupported.');
    const headBytes = decode(parts[0],'Header'), bodyBytes = decode(parts[1],'Payload');
    if (headBytes.length > 8192 || bodyBytes.length > 131072) throw Error('Decoded header exceeds 8 KiB or payload exceeds 128 KiB.');
    const header = jsonPart(headBytes,'Header'), payload = jsonPart(bodyBytes,'Payload');
    const signature = parts[2] === '' ? new Uint8Array() : decode(parts[2],'Signature');
    const findings = [], add = (code,severity,message) => findings.push({code,severity,message});
    const own = name => Object.prototype.hasOwnProperty.call(payload,name);
    if (typeof header.alg !== 'string' || !header.alg) add('invalid_alg','error','Header alg must be a nonempty string.');
    if (header.alg === 'none') add('alg_none','error','Unsigned alg:none token. Never authenticate it.');
    if (header.alg !== 'HS256' && header.alg !== 'none') add('unsupported_alg','warning','Only HS256 can be verified here. No algorithm fallback.');
    const unsupportedHeader = Object.prototype.hasOwnProperty.call(header,'crit') || Object.prototype.hasOwnProperty.call(header,'b64');
    if (unsupportedHeader) add('unsupported_header','error','crit and b64 extensions are unsupported; signature verification is refused.');
    if (bodyBytes.length > 8192) add('oversized_payload','warning','Decoded payload exceeds the 8 KiB diagnostic threshold.');
    for (const name of ['exp','nbf','iss','aud']) if (!own(name)) add('missing_' + name,'warning','Missing ' + name + ' claim (application requirements vary).');
    for (const name of ['exp','nbf','iat']) if (own(name) && (typeof payload[name] !== 'number' || !Number.isFinite(payload[name]) || Math.abs(payload[name]) > Number.MAX_SAFE_INTEGER)) add('invalid_' + name,'error',name + ' must be a finite NumericDate in seconds within safe numeric range.');
    if (typeof payload.exp === 'number' && now >= payload.exp) add('expired',now-skew >= payload.exp ? 'error' : 'warning','Expiration reached; ' + (now-skew >= payload.exp ? 'outside' : 'within') + ' configured skew allowance.');
    if (typeof payload.nbf === 'number' && now < payload.nbf) add('not_yet_valid',now+skew < payload.nbf ? 'error' : 'warning','Before nbf; ' + (now+skew < payload.nbf ? 'outside' : 'within') + ' configured skew allowance.');
    if (typeof payload.iat === 'number' && payload.iat > now+skew) add('future_iat','warning','Issued-at time is in the future beyond skew allowance.');
    if (typeof payload.exp === 'number' && typeof payload.nbf === 'number' && payload.nbf >= payload.exp) add('inverted_times','error','nbf is at or after exp.');
    if (own('iss') && (typeof payload.iss !== 'string' || !payload.iss)) add('invalid_iss','error','iss must be a nonempty string.');
    if (own('aud') && !(typeof payload.aud === 'string' && payload.aud || Array.isArray(payload.aud) && payload.aud.length && payload.aud.every(x => typeof x === 'string' && x))) add('invalid_aud','error','aud must be a nonempty string or array of nonempty strings.');
    if (expectedIssuer && payload.iss !== expectedIssuer) add('issuer_mismatch','error','Issuer differs from expected issuer.');
    if (expectedAudience && !(typeof payload.aud === 'string' ? payload.aud === expectedAudience : Array.isArray(payload.aud) && payload.aud.includes(expectedAudience))) add('audience_mismatch','error','Audience differs from expected audience.');
    if (skew) add('clock_skew','info','Configured clock skew allowance: ' + skew + ' seconds.');
    let signatureStatus = 'not_verified';
    if (header.alg === 'HS256' && !unsupportedHeader) {
      if (signature.length !== 32) { signatureStatus='invalid'; add('signature_length','error','HS256 requires a 32-byte signature.'); }
      else if (!key) add('key_missing','warning','Supply a test key to verify HS256; decoded claims remain untrusted.');
      else {
        if (!globalThis.crypto?.subtle) throw Error('WebCrypto SubtleCrypto unavailable.');
        if (encoder.encode(key).length < 32) add('weak_key','warning','Test key is shorter than 32 UTF-8 bytes; do not use weak production keys.');
        const imported = await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
        const valid = await crypto.subtle.verify('HMAC',imported,signature,encoder.encode(parts[0]+'.'+parts[1]));
        signatureStatus = valid ? 'valid' : 'invalid';
        if (!valid) add('signature_mismatch','error','HS256 signature does not match supplied test key.');
      }
    }
    return {header,payload,payloadBytes:bodyBytes.length,now,skewSeconds:skew,signatureStatus,findings,
      trust:'Decoded claims are untrusted input. A valid HMAC alone is not application authorization; enforce issuer, audience, purpose, time and replay policy at the receiver.'};
  }
  return Object.freeze({inspect, decode, strictJSON});
});
