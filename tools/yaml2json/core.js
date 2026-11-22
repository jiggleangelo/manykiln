/* Original Manykiln implementation. MIT license. */
(function (root) {
  'use strict';
  const LIMIT = 131072, DEPTH = 64;
  class SyntaxIssue extends Error {
    constructor(message, line, column) { super(`${line}:${column} ${message}`); this.name = 'SyntaxIssue'; this.line = line; this.column = column; }
  }
  const error = (m, l, c) => { throw new SyntaxIssue(m, l, c); };
  function unicode(s, l, c) {
    for (let i = 0; i < s.length; i++) {
      const n = s.charCodeAt(i);
      if (n >= 0xd800 && n <= 0xdbff) { const next = s.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) error('Unpaired Unicode surrogate.', l, c); }
      else if (n >= 0xdc00 && n <= 0xdfff) error('Unpaired Unicode surrogate.', l, c);
    }
    return s;
  }
  function bounded(s) {
    if (typeof s !== 'string') error('Expected text.', 1, 1);
    if (s.length > LIMIT) error('Input exceeds 131072 characters.', 1, 1);
    unicode(s, 1, 1);
  }
  function number(s, l, c) {
    const n = Number(s);
    if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n))) error('Number exceeds the finite, safe-integer JSON range; quote it.', l, c);
    return n;
  }
  // A strict JSON reader is shared by JSON input and JSON-style YAML flow values.
  // Building maps directly preserves duplicate-key detection before information is lost.
  function readJSON(source, baseLine = 1, baseCol = 1) {
    bounded(source);
    let at = 0;
    function pos(i = at) {
      const head = source.slice(0, i), parts = head.split('\n');
      return [baseLine + parts.length - 1, parts.length === 1 ? baseCol + i : parts.at(-1).length + 1];
    }
    function bad(m, i = at) { error(m, ...pos(i)); }
    function ws() { while (/[\x20\t\r\n]/.test(source[at] || '\uFFFF')) at++; }
    function string() {
      const start = at++;
      while (at < source.length) {
        const ch = source[at++];
        if (ch === '"') {
          try { return unicode(JSON.parse(source.slice(start, at)), ...pos(start)); }
          catch (e) { if (e instanceof SyntaxIssue) throw e; bad('Invalid JSON string escape.', start); }
        }
        if (ch === '\\') { if (at >= source.length) break; at++; }
        else if (ch.charCodeAt(0) < 32) bad('Control character in JSON string.', at - 1);
      }
      bad('Unterminated JSON string.', start);
    }
    function value(depth) {
      if (depth > DEPTH) bad('Maximum nesting depth is 64.');
      ws(); const ch = source[at];
      if (ch === '"') return string();
      if (ch === '{') {
        at++; ws(); const map = Object.create(null);
        if (source[at] === '}') { at++; return map; }
        while (true) {
          ws(); const keyAt = at;
          if (source[at] !== '"') bad('JSON object keys must be double quoted.');
          const key = string(); ws();
          if (Object.hasOwn(map, key)) bad('Duplicate key: ' + key, keyAt);
          if (source[at++] !== ':') bad('Expected colon.', at - 1);
          map[key] = value(depth + 1); ws();
          const end = source[at++]; if (end === '}') return map;
          if (end !== ',') bad('Expected comma or closing brace.', at - 1);
        }
      }
      if (ch === '[') {
        at++; ws(); const list = [];
        if (source[at] === ']') { at++; return list; }
        while (true) {
          list.push(value(depth + 1)); ws(); const end = source[at++];
          if (end === ']') return list;
          if (end !== ',') bad('Expected comma or closing bracket.', at - 1);
        }
      }
      for (const [token, v] of [['true',true],['false',false],['null',null]]) if (source.startsWith(token, at)) { at += token.length; return v; }
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
      if (match) { const p = pos(); at += match[0].length; return number(match[0], ...p); }
      bad('Expected a strict JSON value.');
    }
    const data = value(0); ws(); if (at !== source.length) bad('Unexpected trailing JSON text.'); return data;
  }
  function scanLine(text, line, col = 1) {
    let quote = '', depth = 0, split = -1, end = text.length;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (quote === '"' && ch === '\\') { i++; continue; }
        if (ch === quote) {
          if (quote === "'" && text[i + 1] === "'") { i++; continue; }
          quote = '';
        }
        continue;
      }
      if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) { end = i; break; }
      if (ch === '"' || ch === "'") {
        // Quotes start tokens only; apostrophes inside plain words stay literal.
        if (i === 0 || /[\s\[{: ,]/.test(text[i - 1])) quote = ch;
      } else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ':' && depth === 0 && (i + 1 === text.length || /\s/.test(text[i + 1])) && split < 0) split = i;
      if (depth < 0) error('Unexpected closing collection delimiter.', line, col + i);
    }
    if (quote) error('Unterminated quoted string (multiline strings are unsupported).', line, col);
    return { text: text.slice(0, end).trimEnd(), split: split < end ? split : -1 };
  }
  const trap = /^(?:y|yes|n|no|on|off)$/i;
  function parseYAML(source) {
    bounded(source);
    const warnings = [], lines = [];
    const raw = source.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < raw.length; i++) {
      const text = raw[i], tab = text.indexOf('\t');
      if (tab >= 0) error('Tabs are unsupported; use spaces or a quoted escape.', i + 1, tab + 1);
      if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) error('Unsupported control character.', i + 1, 1);
      const indent = /^ */.exec(text)[0].length;
      const scanned = scanLine(text.slice(indent), i + 1, indent + 1);
      if (!scanned.text) continue;
      if (indent % 2) error('Indentation must use multiples of two spaces.', i + 1, indent + 1);
      if (/^(?:---|\.\.\.)(?:\s|$)|^%/.test(scanned.text)) error('Document markers and directives are outside this single-document subset.', i + 1, indent + 1);
      lines.push({ body: scanned.text, indent, line: i + 1, col: indent + 1 });
    }
    if (!lines.length) error('Input is empty; use null for an empty document.', 1, 1);
    if (lines[0].indent) error('Root must begin at column 1.', lines[0].line, lines[0].col);
    let cursor = 0;
    function scalar(token, line, col, key = false) {
      token = token.trim();
      if (!token) return null;
      if (token[0] === '"') {
        const value = readJSON(token, line, col);
        if (typeof value !== 'string') error('Expected string.', line, col);
        return value;
      }
      if (token[0] === "'") {
        if (!/^'(?:[^']|'')*'$/.test(token)) error('Invalid single-quoted string.', line, col);
        return token.slice(1, -1).replace(/''/g, "'");
      }
      if (/^[@`%]/.test(token)) error('Reserved leading character; quote this string.', line, col);
      if (/^[&*!]|^<<(?:\s|$)|(?:^|\s)[&*!](?=\S)/.test(token)) error('Anchors, aliases, tags and merge keys are unsupported.', line, col);
      if (/^[|>]/.test(token)) error('Block scalars are unsupported; use quoted strings with escapes.', line, col);
      if (/^[\[\{]/.test(token)) {
        if (key) error('Collection keys are unsupported.', line, col);
        return readJSON(token, line, col);
      }
      if (/[:](?:\s|$)|[\[\]{},]/.test(token) || /^[-?:](?:\s|$)/.test(token)) error('Ambiguous plain scalar; quote this string. Flow collections require strict JSON.', line, col);
      if (trap.test(token)) warnings.push({ line, column: col, code:'BOOLEAN_TRAP', message: token + ' stays a string; quote it for YAML 1.1 portability.' });
      if (key) {
        if (/^(?:true|false|null|~)$/.test(token) || /^-?\d/.test(token)) error('Non-string-looking mapping keys must be quoted.', line, col);
        return token;
      }
      if (token === 'true') return true;
      if (token === 'false') return false;
      if (token === 'null' || token === '~') return null;
      if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)) return number(token, line, col);
      if (/^(?:[-+]?(?:\.inf|\.nan)|[-+]?\d.*|[-+]?\.\d.*)$/i.test(token)) error('Ambiguous or unsupported numeric scalar; use JSON decimal syntax or quote it.', line, col);
      return token;
    }
    function seq(body) { return body === '-' || body.startsWith('- '); }
    function mappingPair(map, body, record, virtualIndent, depth) {
      const part = scanLine(body, record.line, virtualIndent + 1), i = part.split;
      if (i < 0) error('Expected a mapping key followed by colon and space.', record.line, virtualIndent + 1);
      const keyText = part.text.slice(0, i).trim();
      if (!keyText) error('Empty mapping key must be explicitly quoted.', record.line, virtualIndent + 1);
      const key = scalar(keyText, record.line, virtualIndent + 1, true);
      if (Object.hasOwn(map, key)) error('Duplicate key: ' + key, record.line, virtualIndent + 1);
      const after = part.text.slice(i + 1), value = after.trim();
      if (value) map[key] = scalar(value, record.line, virtualIndent + i + 2 + (after.length - after.trimStart().length));
      else if (cursor < lines.length && lines[cursor].indent > virtualIndent) {
        if (lines[cursor].indent !== virtualIndent + 2) error('Nested values require exactly two more spaces.', lines[cursor].line, lines[cursor].col);
        map[key] = block(virtualIndent + 2, depth + 1);
      } else map[key] = null;
    }
    function block(indent, depth) {
      if (depth > DEPTH) error('Maximum nesting depth is 64.', lines[cursor].line, lines[cursor].col);
      const first = lines[cursor], isSeq = seq(first.body), isMap = !isSeq && scanLine(first.body, first.line, first.col).split >= 0;
      if (!isSeq && !isMap) { cursor++; return scalar(first.body, first.line, first.col); }
      const result = isSeq ? [] : Object.create(null);
      while (cursor < lines.length && lines[cursor].indent === indent) {
        const rec = lines[cursor++];
        if (isSeq) {
          if (!seq(rec.body)) error('Cannot mix sequence and mapping entries.', rec.line, rec.col);
          if (/^- {2,}\S/.test(rec.body)) error('Use exactly one space after a sequence dash.', rec.line, rec.col + 2);
          const content = rec.body.slice(1).trimStart(), col = rec.col + rec.body.length - content.length;
          if (!content) {
            if (cursor < lines.length && lines[cursor].indent > indent) {
              if (lines[cursor].indent !== indent + 2) error('Sequence children require exactly two more spaces.', lines[cursor].line, lines[cursor].col);
              result.push(block(indent + 2, depth + 1));
            } else result.push(null);
          } else if (scanLine(content, rec.line, col).split >= 0 && !/^[\[{]/.test(content)) {
            const map = Object.create(null);
            mappingPair(map, content, rec, indent + 2, depth + 1);
            while (cursor < lines.length && lines[cursor].indent === indent + 2) {
              const next = lines[cursor++]; mappingPair(map, next.body, next, indent + 2, depth + 1);
            }
            result.push(map);
          } else result.push(scalar(content, rec.line, col));
        } else {
          if (seq(rec.body)) error('Cannot mix mapping and sequence entries.', rec.line, rec.col);
          mappingPair(result, rec.body, rec, indent, depth);
        }
        if (cursor < lines.length && lines[cursor].indent > indent) error('Unexpected indentation or a child below a scalar.', lines[cursor].line, lines[cursor].col);
      }
      return result;
    }
    const data = block(0, 0);
    if (cursor !== lines.length) error('Unexpected indentation or extra root value.', lines[cursor].line, lines[cursor].col);
    // A flow collection can sit inside a block: enforce the total tree depth too.
    function checkDepth(value, depth) {
      if (depth > DEPTH) error('Maximum nesting depth is 64.', 1, 1);
      if (value !== null && typeof value === 'object') for (const child of Object.values(value)) checkDepth(child, depth + 1);
    }
    checkDepth(data, 0);
    return { data, warnings };
  }
  // Explicit serialization avoids JS integer-key enumeration changing lexical key order.
  function canonical(data, depth = 0) {
    if (depth > DEPTH) error('Maximum nesting depth is 64.', 1, 1);
    const pad = '  '.repeat(depth), next = pad + '  ';
    if (data === null || typeof data !== 'object') return JSON.stringify(data);
    if (Array.isArray(data)) return data.length ? '[\n' + data.map(v => next + canonical(v, depth + 1)).join(',\n') + '\n' + pad + ']' : '[]';
    const keys = Object.keys(data).sort();
    return keys.length ? '{\n' + keys.map(k => next + JSON.stringify(k) + ': ' + canonical(data[k], depth + 1)).join(',\n') + '\n' + pad + '}' : '{}';
  }
  function emitYAML(data, depth = 0) {
    if (depth > DEPTH) error('Maximum nesting depth is 64.', 1, 1);
    const pad = '  '.repeat(depth);
    if (data === null || typeof data !== 'object' || Object.keys(data).length === 0) return pad + JSON.stringify(data);
    if (Array.isArray(data)) return data.map(v => v !== null && typeof v === 'object' && Object.keys(v).length ? pad + '-\n' + emitYAML(v, depth + 1) : pad + '- ' + JSON.stringify(v)).join('\n');
    return Object.keys(data).sort().map(k => {
      const v = data[k];
      return pad + JSON.stringify(k) + ':' + (v !== null && typeof v === 'object' && Object.keys(v).length ? '\n' + emitYAML(v, depth + 1) : ' ' + JSON.stringify(v));
    }).join('\n');
  }
  function convert(source, direction = 'yaml-json') {
    if (!['yaml-json','json-yaml'].includes(direction)) error('Unknown conversion direction.', 1, 1);
    const parsed = direction === 'yaml-json' ? parseYAML(source) : {data:readJSON(source), warnings:[]};
    return { output: direction === 'yaml-json' ? canonical(parsed.data) + '\n' : emitYAML(parsed.data) + '\n', warnings:parsed.warnings };
  }
  const api = Object.freeze({ LIMIT, DEPTH, SyntaxIssue, parseYAML, parseJSON:readJSON, canonical, emitYAML, convert });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YamlKit = api;
})(typeof globalThis === 'object' ? globalThis : this);
