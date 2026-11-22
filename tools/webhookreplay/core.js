/* Original clean-room implementation. MIT License. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WebhookReplay = api;
})(globalThis, function () {
  'use strict';
  const encoder = new TextEncoder();
  const byteLength = value => encoder.encode(value).length;
  function text(value, name, max) {
    if (typeof value !== 'string' || byteLength(value) > max) throw Error(name + ' must be text within ' + max + ' UTF-8 bytes.');
    return value;
  }
  function integer(value, name, max = Number.MAX_SAFE_INTEGER) {
    if (value === '' || value === null || typeof value === 'boolean') throw Error(name + ' is required.');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > max) throw Error(name + ' must be a nonnegative integer up to ' + max + '.');
    return number;
  }
  function subtle() {
    if (!globalThis.crypto?.subtle) throw Error('WebCrypto SubtleCrypto unavailable. Use a browser supporting secure local file contexts.');
    return globalThis.crypto.subtle;
  }
  async function keyFor(secret, usage) {
    text(secret, 'Test key', 16384);
    if (!secret) throw Error('Supply a test key.');
    return subtle().importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, [usage]);
  }
  function hex(bytes) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
  function unhex(value) {
    if (!/^[a-fA-F0-9]{64}$/.test(value)) throw Error('Signature must contain exactly 64 hexadecimal digits.');
    return Uint8Array.from(value.match(/../g), x => parseInt(x, 16));
  }
  function parseSignature(mode, header) {
    text(header, 'Signature header', 8192);
    if (mode === 'stripe') {
      const parts = header.split(',').map(x => x.trim());
      let timestamp = null; const signatures = [];
      for (const part of parts) {
        const match = /^([a-zA-Z0-9]+)=(.*)$/.exec(part);
        if (!match) throw Error('Malformed Stripe signature header.');
        if (match[1] === 't') {
          if (timestamp !== null || !/^(0|[1-9]\d*)$/.test(match[2])) throw Error('Stripe requires exactly one decimal timestamp.');
          timestamp = integer(match[2], 'Stripe timestamp');
        } else if (match[1] === 'v1') { unhex(match[2]); signatures.push(match[2]); }
      }
      if (timestamp === null || !signatures.length || signatures.length > 16) throw Error('Stripe requires one t and 1–16 v1 signatures.');
      return {timestamp, signatures};
    }
    if (mode === 'github') {
      if (!header.startsWith('sha256=')) throw Error('GitHub requires the sha256= prefix.');
      header = header.slice(7);
    } else if (mode !== 'generic') throw Error('Unsupported mode.');
    unhex(header); return {timestamp:null, signatures:[header]};
  }
  function replay(timestamp, now, tolerance, authenticated) {
    now = integer(now, 'Current Unix seconds'); tolerance = integer(tolerance, 'Tolerance', 86400);
    if (timestamp === '' || timestamp === null || timestamp === undefined) return {checked:false, authenticated:false, fresh:null, note:'No timestamp supplied; replay freshness not checked.'};
    timestamp = integer(timestamp, 'Timestamp');
    const skewSeconds = now - timestamp;
    return {checked:true, authenticated, timestamp, skewSeconds, toleranceSeconds:tolerance, fresh:Math.abs(skewSeconds) <= tolerance,
      note:authenticated ? 'Authenticated timestamp freshness; duplicate deliveries still require a receiver ledger.' : 'Unauthenticated diagnostic timestamp; provides no replay protection.'};
  }
  async function analyze(options) {
    const {mode, payload, secret, action = 'verify'} = options;
    if (!['github','stripe','generic'].includes(mode)) throw Error('Unsupported mode.');
    if (!['verify','generate'].includes(action)) throw Error('Unsupported action.');
    text(payload, 'Payload', 1048576);
    let parsed = null, timestamp = options.timestamp;
    if (action === 'verify') { parsed = parseSignature(mode, options.signature); if (mode === 'stripe') timestamp = parsed.timestamp; }
    if (mode === 'stripe' && (timestamp === '' || timestamp === undefined || timestamp === null)) throw Error('Stripe requires a timestamp.');
    const freshness = replay(timestamp, options.now, options.tolerance, mode === 'stripe');
    const signed = mode === 'stripe' ? String(freshness.timestamp) + '.' + payload : payload;
    const data = encoder.encode(signed);
    let digest = null, match = null;
    if (action === 'generate') digest = hex(await subtle().sign('HMAC', await keyFor(secret, 'sign'), data));
    else {
      const key = await keyFor(secret, 'verify');
      match = false;
      for (const signature of parsed.signatures) if (await subtle().verify('HMAC', key, unhex(signature), data)) match = true;
    }
    const headerName = mode === 'stripe' ? 'Stripe-Signature' : mode === 'github' ? 'X-Hub-Signature-256' : 'X-Signature';
    const generatedSignature = digest === null ? null : mode === 'stripe' ? 't=' + freshness.timestamp + ',v1=' + digest : mode === 'github' ? 'sha256=' + digest : digest;
    return {mode, action, payloadBytes:byteLength(payload), headerName, generatedSignature, signatureMatch:match, freshness,
      verificationPassed: action === 'verify' ? match && (!freshness.checked || freshness.fresh) : null,
      note:action === 'generate' ? 'Generated locally; this does not prove sender identity.' : 'A signature match proves possession of the supplied key, not the origin of the key.'};
  }
  function fixture(result) {
    if (!result || !['github','stripe','generic'].includes(result.mode)) throw Error('Run a check first.');
    const headerName = result.mode === 'stripe' ? 'Stripe-Signature' : result.mode === 'github' ? 'X-Hub-Signature-256' : 'X-Signature';
    return {tool:'webhookreplay', version:1, redacted:true, note:'Payload, key and signature omitted. Replace placeholders and re-sign with a test key before use.',
      secret:'[REDACTED]', payload:'[REDACTED PAYLOAD]', headers:{[headerName]:'[REDACTED SIGNATURE]'},
      curl:"curl --request POST 'https://example.invalid/webhook' --header 'Content-Type: application/json' --header '" + headerName + ": [REDACTED SIGNATURE]' --data-binary '[REDACTED PAYLOAD]'"};
  }
  return Object.freeze({analyze, parseSignature, replay, fixture});
});
