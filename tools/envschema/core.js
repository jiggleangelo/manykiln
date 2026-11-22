/* Original Manykiln implementation. MIT. No imports, I/O or persistence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EnvSchema = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({text:100000, lines:1000, keys:200, value:2048, pattern:256});
  const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
  function fail(message) { throw new Error(message); }
  // Anchored concatenation of single-character atoms. DP is O(pattern * value).
  function compilePattern(pattern) {
    if (typeof pattern !== 'string' || pattern.length > LIMITS.pattern || !pattern.startsWith('^') || !pattern.endsWith('$')) fail('Regex must be ^...$ anchored, at most 256 characters.');
    const body=pattern.slice(1,-1), atoms=[];
    let i=0;
    while(i<body.length) {
      let token='', c=body[i++];
      if(c==='\\') {
        if(i===body.length) fail('Incomplete regex escape.');
        const e=body[i++];
        if(!'dDwWsSnrt\\.^$|?*+(){}[]-'.includes(e)) fail('Unsupported regex escape.');
        token='\\'+e;
      } else if(c==='[') {
        token='['; let closed=false;
        while(i<body.length) {
          const d=body[i++]; token+=d;
          if(d==='\\') {if(i===body.length) fail('Incomplete character class.'); const e=body[i++]; if(!'dDwWsSnrt\\.^$|?*+(){}[]-'.includes(e)) fail('Unsupported class escape.'); token+=e;}
          else if(d===']') {closed=true;break;}
          else if(d==='[') fail('Nested character classes are unsupported.');
        }
        if(!closed) fail('Unclosed character class.');
      } else {
        if('()|{}?*+^$]'.includes(c)) fail('Regex groups, alternation and misplaced metacharacters are unsupported.');
        token=c;
      }
      let matcher;
      try {matcher=new RegExp('^(?:'+token+')$','u');} catch {fail('Invalid regex character atom.');}
      let min=1,max=1;
      if(body[i]==='*') {min=0;max=LIMITS.value;i++;}
      else if(body[i]==='+') {max=LIMITS.value;i++;}
      else if(body[i]==='?') {min=0;i++;}
      else if(body[i]==='{') {
        const m=body.slice(i).match(/^\{(\d+)(?:,(\d*))?\}/);
        if(!m) fail('Invalid regex repetition.');
        min=Number(m[1]);max=m[2]===undefined?min:m[2]===''?LIMITS.value:Number(m[2]);
        if(min>max || max>LIMITS.value) fail('Regex repetition must be within 0..2048.');
        i+=m[0].length;
      }
      atoms.push({matcher,min,max});
    }
    return value=>{
      if(value.length>LIMITS.value) return false;
      let previous=new Uint8Array(value.length+1);previous[0]=1;
      for(const {matcher,min,max} of atoms) {
        const prefix=new Uint32Array(value.length+2);
        for(let p=0;p<=value.length;p++) prefix[p+1]=prefix[p]+previous[p];
        const next=new Uint8Array(value.length+1);let run=0;
        for(let end=0;end<=value.length;end++) {
          if(end) run=matcher.test(value[end-1])?run+1:0;
          const lo=Math.max(0,end-max,end-run), hi=end-min;
          if(hi>=lo && prefix[hi+1]>prefix[lo]) next[end]=1;
        }
        previous=next;
      }
      return previous[value.length]===1;
    };
  }
  function schemaObject(input) {
    if(!input || typeof input!=='object' || Array.isArray(input) || !input.keys || typeof input.keys!=='object' || Array.isArray(input.keys)) fail('Schema must be an object with a keys object.');
    if(Object.keys(input).some(k=>!['keys','allowUnknown'].includes(k))) fail('Unsupported schema field.');
    if(input.allowUnknown!==undefined && typeof input.allowUnknown!=='boolean') fail('allowUnknown must be boolean.');
    const names=Object.keys(input.keys);
    if(!names.length || names.length>LIMITS.keys) fail('Schema needs 1..200 keys.');
    const rules=new Map();
    for(const key of names) {
      if(!KEY.test(key)) fail('Invalid schema key.');
      const rule=input.keys[key];
      if(!rule || typeof rule!=='object' || Array.isArray(rule)) fail('Each key rule must be an object.');
      if(Object.keys(rule).some(k=>!['required','type','regex','enum','secret'].includes(k))) fail('Unsupported key-rule field.');
      for(const k of ['required','secret']) if(rule[k]!==undefined && typeof rule[k]!=='boolean') fail(k+' must be boolean.');
      const type=rule.type===undefined?'string':rule.type;
      if(!['string','number','integer','boolean','url','enum'].includes(type)) fail('Unsupported schema type.');
      if(rule.enum!==undefined && (!Array.isArray(rule.enum) || !rule.enum.length || rule.enum.length>100 || rule.enum.some(x=>typeof x!=='string' || x.length>LIMITS.value))) fail('enum must contain 1..100 bounded strings.');
      if(type==='enum' && rule.enum===undefined) fail('enum type requires enum values.');
      rules.set(key,{...rule,type,test:rule.regex===undefined?null:compilePattern(rule.regex)});
    }
    return {rules,allowUnknown:input.allowUnknown===true};
  }
  function parseEnv(text) {
    if(typeof text!=='string' || text.length>LIMITS.text) fail('Env text must be at most 100000 characters.');
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
    if(lines.length>LIMITS.lines) fail('Env text exceeds 1000 lines.');
    const entries=new Map(), errors=[], seen=new Map();
    function error(line,key,code) {errors.push({line,key,code});}
    for(let index=0;index<lines.length;index++) {
      const line=index+1, raw=lines[index].trim();
      if(!raw || raw.startsWith('#')) continue;
      const m=raw.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]{0,127})\s*=(.*)$/);
      if(!m) {error(line,null,'INVALID_ASSIGNMENT');continue;}
      const key=m[1], source=m[2].trimStart();
      if(seen.has(key)) error(line,key,'DUPLICATE_KEY'); else seen.set(key,line);
      if(seen.size>LIMITS.keys) fail('Env text exceeds 200 distinct keys.');
      let value='', bad=false;
      if(source[0]==='"' || source[0]==="'") {
        const quote=source[0];let closed=false,j=1;
        for(;j<source.length;j++) {
          const c=source[j];
          if(c==='\\') {
            const e=source[++j];
            if(e===undefined) {bad=true;break;}
            if(!['\\',quote,'n','r','t'].includes(e)) {bad=true;break;}
            value+=({n:'\n',r:'\r',t:'\t'})[e]===undefined?e:({n:'\n',r:'\r',t:'\t'})[e];
          } else if(c===quote) {closed=true;j++;break;}
          else value+=c;
        }
        const tail=source.slice(j);
        if(!closed || bad || (tail.trim()!=='' && !/^\s+#/.test(tail))) bad=true;
      } else {
        for(let j=0;j<source.length;j++) {
          const c=source[j];
          if(c==='#' && (j===0 || /\s/.test(source[j-1]))) break;
          if(c==='\\') {const e=source[++j];if(e===undefined || !['\\','"',"'",'#',' '].includes(e)) {bad=true;break;} value+=e;}
          else if(c==='"' || c==="'") {bad=true;break;}
          else value+=c;
        }
        value=value.trimEnd();
      }
      if(bad) {error(line,key,'UNESCAPED_OR_UNCLOSED_QUOTE_OR_ESCAPE');continue;}
      if(value.length>LIMITS.value) {error(line,key,'VALUE_TOO_LONG');continue;}
      if(!entries.has(key)) entries.set(key,{value,line});
    }
    return {entries,errors};
  }
  function check(parsed,schema) {
    const errors=parsed.errors.slice();
    for(const [key,rule] of schema.rules) {
      const entry=parsed.entries.get(key);
      if(!entry) {if(rule.required) errors.push({key,line:null,code:'REQUIRED_MISSING'});continue;}
      const v=entry.value;
      let valid=true;
      if(rule.type==='number') valid=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) && Number.isFinite(Number(v));
      else if(rule.type==='integer') valid=/^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
      else if(rule.type==='boolean') valid=v==='true' || v==='false';
      else if(rule.type==='url') {try {const u=new URL(v);valid=['https:','http:'].includes(u.protocol) && !!u.hostname;}catch {valid=false;}}
      if(!valid) errors.push({key,line:entry.line,code:'TYPE_'+rule.type.toUpperCase()});
      if(rule.enum && !rule.enum.includes(v)) errors.push({key,line:entry.line,code:'ENUM_MISMATCH'});
      if(rule.test && !rule.test(v)) errors.push({key,line:entry.line,code:'REGEX_MISMATCH'});
    }
    if(!schema.allowUnknown) for(const [key,entry] of parsed.entries) if(!schema.rules.has(key)) errors.push({key,line:entry.line,code:'UNKNOWN_KEY'});
    return errors;
  }
  function secretKey(key,rule) {return rule?.secret===true || /secret|token|pass|credential|private|api_?key|auth|cookie|database_url|connection|dsn|access_?key/i.test(key);}
  function inspect({candidate,baseline='',schema,maskSecrets=true}) {
    if(typeof maskSecrets!=='boolean') fail('maskSecrets must be boolean.');
    if(typeof candidate!=='string' || !candidate.trim()) fail('Missing candidate .env template.');
    if(typeof baseline!=='string') fail('Baseline must be text.');
    const spec=schemaObject(schema), current=parseEnv(candidate), before=parseEnv(baseline);
    const baselineProvided=baseline.trim()!=='';
    const candidateErrors=check(current,spec), baselineErrors=baselineProvided?check(before,spec):[];
    const keys=[...new Set([...current.entries.keys(),...before.entries.keys()])].sort();
    const display=(key,entry)=>entry===undefined?null:maskSecrets && secretKey(key,spec.rules.get(key))?'[MASKED]':entry.value;
    const rows=keys.map(key=>{
      const a=before.entries.get(key),b=current.entries.get(key);
      return {key,change:!baselineProvided?'present':!a?'added':!b?'removed':a.value===b.value?'unchanged':'changed',secret:secretKey(key,spec.rules.get(key)),before:display(key,a),after:display(key,b)};
    });
    return {tool:'EnvSchema',valid:candidateErrors.length===0 && baselineErrors.length===0,maskSecrets,baselineProvided,candidateErrors,baselineErrors,rows,notice:'Fictional template check. No expansion, execution, persistence or network. Masking is a key-name/schema heuristic; do not paste real secrets.'};
  }
  return Object.freeze({LIMITS,compilePattern,parseEnv,inspect,secretKey});
});
