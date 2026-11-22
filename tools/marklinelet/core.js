/* Original Manykiln implementation. MIT License. */
(function (root) {
  'use strict';
  const MAX_INPUT = 131072, MAX_LINES = 5000;
  const entityMap = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®' };
  function decode(text) {
    return text.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp|copy|reg);/g, (all, key) => {
      if (key[0] !== '#') return entityMap[key];
      const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd';
    });
  }
  const refKey = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  function destination(raw) {
    const match = /^(?:<([^<>\n]*)>|(\S+?))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*$/.exec(raw.trim());
    if (raw.trim() === '') return '';
    return match ? decode((match[1] ?? match[2]).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1')) : null;
  }
  function inline(text, refs = new Map(), depth = 0) {
    if (depth > 16) return [{ type: 'text', text: decode(text) }];
    const out = [], pairs = new Map(), stackSquare = [], stackRound = [], offsets = new Uint32Array(text.length + 1);
    for (let k = 0; k < text.length; k++) {
      offsets[k + 1] = offsets[k] + (text[k] === '\n' ? 1 : 0);
      if (text[k] === '\\') { if (k + 1 < text.length) { offsets[k + 2] = offsets[k + 1] + (text[k + 1] === '\n' ? 1 : 0); k++; } continue; }
      const stack = text[k] === '[' || text[k] === ']' ? stackSquare : stackRound;
      if (text[k] === '[' || text[k] === '(') stack.push(k);
      else if ((text[k] === ']' || text[k] === ')') && stack.length) pairs.set(stack.pop(), k);
    }
    const balanced = (_text, at) => pairs.get(at) ?? -1;
    const addText = s => { const last = out[out.length - 1]; if (last?.type === 'text') last.text += s; else out.push({ type: 'text', text: s }); };
    for (let i = 0; i < text.length;) {
      const c = text[i];
      if (c === '\\' && i + 1 < text.length && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(text[i + 1])) { addText(text[i + 1]); i += 2; continue; }
      if (c === '`') {
        const run = /^`+/.exec(text.slice(i))[0];
        let end = text.indexOf(run, i + run.length);
        while (end >= 0 && (text[end - 1] === '`' || text[end + run.length] === '`')) end = text.indexOf(run, end + run.length);
        if (end >= 0) {
          let content = text.slice(i + run.length, end).replace(/\n/g, ' ');
          if (/^ .* $/.test(content) && /[^ ]/.test(content)) content = content.slice(1, -1);
          out.push({ type: 'code', text: content }); i = end + run.length; continue;
        }
        addText(run); i += run.length; continue;
      }
      if (c === '[' || (c === '!' && text[i + 1] === '[')) {
        const image = c === '!', begin = i + (image ? 1 : 0), end = balanced(text, begin, '[', ']');
        if (end >= 0) {
          const label = text.slice(begin + 1, end); let url = null, after = end + 1;
          if (text[after] === '(') {
            const finish = balanced(text, after, '(', ')');
            if (finish >= 0) { url = destination(text.slice(after + 1, finish)); after = finish + 1; }
          } else if (text[after] === '[') {
            const finish = balanced(text, after, '[', ']');
            if (finish >= 0) { url = refs.get(refKey(text.slice(after + 1, finish) || label)) ?? null; after = finish + 1; }
          } else url = refs.get(refKey(label)) ?? null;
          if (url !== null) { out.push({ type: image ? 'image' : 'link', url, children: inline(label, refs, depth + 1), lineOffset: offsets[i] }); i = after; continue; }
        }
      }
      if (c === '*' || c === '_' || text.slice(i, i + 2) === '~~') {
        const marker = text.slice(i, i + 2) === '~~' ? '~~' : text[i + 1] === c ? c + c : c;
        const end = text.indexOf(marker, i + marker.length);
        const intraWord = c === '_' && /[\p{L}\p{N}]/u.test(text[i - 1] || '') && /[\p{L}\p{N}]/u.test(text[i + marker.length] || '');
        if (!intraWord && end > i + marker.length && !/\s/.test(text[i + marker.length]) && !/\s/.test(text[end - 1])) {
          out.push({ type: marker === '~~' ? 'del' : marker.length === 2 ? 'strong' : 'em', children: inline(text.slice(i + marker.length, end), refs, depth + 1) }); i = end + marker.length; continue;
        }
      }
      if (c === '\n') { out.push({ type: 'break' }); i++; continue; }
      // Decode entities once after gathering ordinary text; encoded punctuation stays literal.
      if (c === '&') {
        const m = /^&(?:#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp|copy|reg);/.exec(text.slice(i));
        if (m) { addText(decode(m[0])); i += m[0].length; continue; }
      }
      addText(c); i++;
    }
    return out;
  }
  function plain(tokens) { return tokens.map(t => t.children ? plain(t.children) : t.type === 'break' ? ' ' : t.text || '').join(''); }
  function slug(text) { return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-'); }
  function cells(line) {
    let source = line.trim();
    if (source[0] === '|') source = source.slice(1);
    if (source.endsWith('|')) { let slashes = 0; for (let i = source.length - 2; i >= 0 && source[i] === '\\'; i--) slashes++; if (slashes % 2 === 0) source = source.slice(0, -1); }
    const result = []; let value = '';
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\\' && i + 1 < source.length) { value += source[i] + source[++i]; }
      else if (source[i] === '|') { result.push(value.trim()); value = ''; }
      else value += source[i];
    }
    result.push(value.trim()); return result;
  }
  const fence = text => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  const atx = text => /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(text);
  const listMark = text => /^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(text);
  const rule = text => /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(text);
  const starts = text => Boolean(fence(text) || atx(text) || /^ {0,3}>/.test(text) || listMark(text) || rule(text) || /^ {4}\S/.test(text));
  function analyze(source) {
    if (typeof source !== 'string' || source.length > MAX_INPUT) throw new Error('Markdown exceeds 131072 characters.');
    source = source.replace(/\r\n?/g, '\n');
    const raw = source.split('\n');
    if (raw.length > MAX_LINES) throw new Error('Markdown exceeds 5000 lines.');
    const diagnostics = [], refs = new Map(), headings = [], links = [];
    const warn = (rule, line, message, column = 1) => diagnostics.push({ rule, line, column, message });
    raw.forEach((text, i) => { const m = /[ \t]+$/.exec(text); if (m) warn('trailing-whitespace', i + 1, 'Trailing whitespace (' + m[0].length + ' characters).', m.index + 1); });
    function blocks(lines, depth = 0) {
      if (depth > 20) throw new Error('Container nesting exceeds 20 levels.');
      const nodes = [];
      for (let i = 0; i < lines.length;) {
        const { text, line } = lines[i];
        if (!text.trim()) { i++; continue; }
        const fm = fence(text);
        if (fm && !(fm[1][0] === '`' && fm[2].includes('`'))) {
          const marker = fm[1][0], count = fm[1].length, info = fm[2].trim(), content = [], indent = text.length - text.trimStart().length;
          let j = i + 1;
          while (j < lines.length && !(new RegExp('^ {0,3}' + (marker === '`' ? '`' : '~') + '{' + count + ',}[ \\t]*$')).test(lines[j].text)) { content.push(lines[j].text.replace(new RegExp('^ {0,' + indent + '}'), '')); j++; }
          if (!info) warn('untagged-fence', line, 'Fenced code block needs a language tag.');
          nodes.push({ type: 'codeblock', line, text: content.join('\n'), info, closed: j < lines.length }); i = j < lines.length ? j + 1 : j; continue;
        }
        if (/^ {4}|^\t/.test(text)) {
          const content = []; let j = i;
          while (j < lines.length && (/^ {4}|^\t/.test(lines[j].text) || !lines[j].text.trim())) { content.push(lines[j].text.replace(/^(?: {4}|\t)/, '')); j++; }
          nodes.push({ type: 'codeblock', line, text: content.join('\n').replace(/\n+$/, ''), info: '', closed: true }); i = j; continue;
        }
        const ref = /^ {0,3}\[([^\]]+)\]:\s*(.*)$/.exec(text);
        if (ref) { const url = destination(ref[2]); if (url !== null) { if (!refs.has(refKey(ref[1]))) refs.set(refKey(ref[1]), url); i++; continue; } }
        const hm = atx(text);
        if (hm) { nodes.push({ type: 'heading', line, level: hm[1].length, raw: (hm[2] || '').replace(/(?:^[#]+[ \t]*$|[ \t]+#+[ \t]*$)/, '').trim() }); i++; continue; }
        if (rule(text)) { nodes.push({ type: 'hr', line }); i++; continue; }
        if (/^ {0,3}>/.test(text)) {
          const sub = []; let j = i;
          while (j < lines.length && /^ {0,3}>/.test(lines[j].text)) { sub.push({ ...lines[j], text: lines[j].text.replace(/^ {0,3}>[ \t]?/, '') }); j++; }
          nodes.push({ type: 'quote', line, children: blocks(sub, depth + 1) }); i = j; continue;
        }
        const lm = listMark(text);
        if (lm) {
          const ordered = /^\d/.test(lm[2]), delimiter = ordered ? lm[2].slice(-1) : lm[2], items = []; let j = i;
          while (j < lines.length) {
            const m = listMark(lines[j].text);
            if (!m || /^\d/.test(m[2]) !== ordered || (ordered ? m[2].slice(-1) : m[2]) !== delimiter) break;
            const padding = m[1].length + m[2].length + m[3].length, sub = [{ ...lines[j], text: m[4] }];
            const task = /^\[([ xX])\][ \t]+/.exec(sub[0].text);
            if (task) sub[0].text = sub[0].text.slice(task[0].length);
            j++;
            while (j < lines.length) {
              if (new RegExp('^ {' + padding + '}').test(lines[j].text)) { sub.push({ ...lines[j], text: lines[j].text.slice(padding) }); j++; }
              else if (!lines[j].text.trim() && j + 1 < lines.length && new RegExp('^ {' + padding + '}').test(lines[j + 1].text)) { sub.push(lines[j]); j++; }
              else break;
            }
            items.push({ type: 'item', task: task ? task[1].toLowerCase() === 'x' : null, children: blocks(sub, depth + 1) });
          }
          nodes.push({ type: 'list', line, ordered, start: ordered ? Number(lm[2].slice(0, -1)) : 1, children: items }); i = j; continue;
        }
        if (i + 1 < lines.length && (text.includes('|') || lines[i + 1].text.includes('|'))) {
          const header = cells(text), divider = cells(lines[i + 1].text);
          if (divider.every(x => /^:?-{3,}:?$/.test(x))) {
            const rows = [{ line, raw: header }], expected = header.length;
            if (divider.length !== expected) warn('table-columns', lines[i + 1].line, 'Table delimiter has ' + divider.length + ' columns; header has ' + expected + '.');
            let j = i + 2;
            while (j < lines.length && lines[j].text.trim() && !starts(lines[j].text)) { const row = cells(lines[j].text); rows.push({ line: lines[j].line, raw: row }); if (row.length !== expected) warn('table-columns', lines[j].line, 'Table row has ' + row.length + ' columns; expected ' + expected + '.'); j++; }
            nodes.push({ type: 'table', line, rows, align: divider.map(x => x.startsWith(':') && x.endsWith(':') ? 'center' : x.endsWith(':') ? 'right' : 'left') }); i = j; continue;
          }
        }
        const para = [text]; let j = i + 1, setext = null;
        while (j < lines.length && lines[j].text.trim()) {
          if (/^ {0,3}(=+|-+)[ \t]*$/.test(lines[j].text)) { setext = lines[j].text.trim()[0] === '=' ? 1 : 2; j++; break; }
          if (starts(lines[j].text)) break;
          // A new table must begin its own block.
          if (j + 1 < lines.length && (lines[j].text.includes('|') || lines[j + 1].text.includes('|')) && cells(lines[j + 1].text).every(x => /^:?-{3,}:?$/.test(x))) break;
          para.push(lines[j].text); j++;
        }
        nodes.push({ type: setext ? 'heading' : 'paragraph', line, ...(setext ? { level: setext } : {}), raw: para.join('\n') }); i = j;
      }
      return nodes;
    }
    const ast = blocks(raw.map((text, i) => ({ text, line: i + 1 })));
    const ids = new Set(), bases = new Map(); let prior = 0;
    function scanTokens(tokens, line) {
      for (const token of tokens) { if (token.type === 'link' && token.url.startsWith('#')) links.push({ url: token.url, line: line + (token.lineOffset || 0) }); if (token.children) scanTokens(token.children, line); }
    }
    function visit(nodes) {
      for (const node of nodes) {
        if (node.raw !== undefined) { node.tokens = inline(node.raw, refs); scanTokens(node.tokens, node.line); }
        if (node.type === 'heading') {
          const base = slug(plain(node.tokens));
          if (bases.has(base)) warn('duplicate-heading', node.line, 'Duplicate heading slug: ' + (base || '(empty)') + '.');
          bases.set(base, (bases.get(base) || 0) + 1);
          let id = base, suffix = 0; while (ids.has(id)) id = base + '-' + (++suffix); ids.add(id); node.id = id;
          if (prior && node.level > prior + 1) warn('heading-skip', node.line, 'Heading jumps from H' + prior + ' to H' + node.level + '.');
          prior = node.level; headings.push({ line: node.line, level: node.level, text: plain(node.tokens), id });
        }
        if (node.type === 'table') for (const row of node.rows) { row.tokens = row.raw.map(x => inline(x, refs)); row.tokens.forEach(t => scanTokens(t, row.line)); }
        if (node.children) visit(node.children);
      }
    }
    visit(ast);
    for (const link of links) {
      let target;
      try { target = decodeURIComponent(link.url.slice(1)); } catch { warn('broken-anchor', link.line, 'Malformed percent escape in local anchor: ' + link.url); continue; }
      if (target && !ids.has(target)) warn('broken-anchor', link.line, 'No heading matches local anchor: ' + link.url);
    }
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule));
    return { ast, headings, diagnostics, stats: { lines: raw.length, headings: headings.length, issues: diagnostics.length } };
  }
  function render(report, target, doc = target.ownerDocument) {
    const el = (tag, text) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
    function inlineNodes(tokens, host) {
      for (const t of tokens) {
        let n;
        if (t.type === 'text') n = doc.createTextNode(t.text);
        else if (t.type === 'code') n = el('code', t.text);
        else if (t.type === 'break') n = doc.createTextNode('\n');
        else if (t.type === 'image') n = el('span', '[Image: ' + plain(t.children) + ']');
        else if (t.type === 'link') {
          // Only an encoded in-document fragment is ever assigned to href.
          if (t.url.startsWith('#')) { n = el('a'); let fragment; try { fragment = decodeURIComponent(t.url.slice(1)); } catch { fragment = t.url.slice(1); } n.setAttribute('href', fragment ? '#md-' + encodeURIComponent(fragment) : '#'); }
          else { n = el('span'); n.className = 'inert-link'; n.setAttribute('title', 'Remote link disabled: ' + t.url); }
          inlineNodes(t.children, n);
        } else { n = el(t.type === 'strong' ? 'strong' : t.type === 'del' ? 'del' : 'em'); inlineNodes(t.children, n); }
        host.appendChild(n);
      }
    }
    function blockNodes(nodes, host) {
      for (const node of nodes) {
        let n;
        if (node.type === 'heading') { n = el('h' + node.level); n.id = 'md-' + node.id; inlineNodes(node.tokens, n); }
        else if (node.type === 'paragraph') { n = el('p'); inlineNodes(node.tokens, n); }
        else if (node.type === 'codeblock') { n = el('pre'); const code = el('code', node.text); if (node.info) code.setAttribute('data-language', node.info.split(/\s/)[0]); n.appendChild(code); }
        else if (node.type === 'hr') n = el('hr');
        else if (node.type === 'quote') { n = el('blockquote'); blockNodes(node.children, n); }
        else if (node.type === 'list') { n = el(node.ordered ? 'ol' : 'ul'); if (node.ordered) n.setAttribute('start', String(node.start)); blockNodes(node.children, n); }
        else if (node.type === 'item') { n = el('li'); if (node.task !== null) n.appendChild(el('span', node.task ? '☑ ' : '☐ ')); blockNodes(node.children, n); }
        else if (node.type === 'table') {
          n = el('div'); n.className = 'table-wrap'; n.tabIndex = 0; n.setAttribute('aria-label', 'Markdown table'); const table = el('table'), head = el('thead'), body = el('tbody');
          node.rows.forEach((row, index) => { const tr = el('tr'); row.tokens.forEach((tokens, column) => { const cell = el(index ? 'td' : 'th'); cell.className = 'align-' + (node.align[column] || 'left'); inlineNodes(tokens, cell); tr.appendChild(cell); }); (index ? body : head).appendChild(tr); });
          table.appendChild(head); table.appendChild(body); n.appendChild(table);
        }
        if (n) host.appendChild(n);
      }
    }
    const fragment = doc.createDocumentFragment(); blockNodes(report.ast, fragment); target.replaceChildren(fragment);
  }
  const api = { analyze, inline, plain, slug, cells, render, decode, MAX_INPUT, MAX_LINES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MarkdownLint = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
