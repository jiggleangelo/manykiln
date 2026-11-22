/* MIT · Original offline HTTP reference and advisory header parser. */
(function (root) {
  'use strict';
  const statuses = Object.freeze({100:'Continue',101:'Switching Protocols',102:'Processing',103:'Early Hints',200:'OK',201:'Created',202:'Accepted',203:'Non-Authoritative Information',204:'No Content',205:'Reset Content',206:'Partial Content',207:'Multi-Status',208:'Already Reported',226:'IM Used',300:'Multiple Choices',301:'Moved Permanently',302:'Found',303:'See Other',304:'Not Modified',305:'Use Proxy',307:'Temporary Redirect',308:'Permanent Redirect',400:'Bad Request',401:'Unauthorized',402:'Payment Required',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',406:'Not Acceptable',407:'Proxy Authentication Required',408:'Request Timeout',409:'Conflict',410:'Gone',411:'Length Required',412:'Precondition Failed',413:'Content Too Large',414:'URI Too Long',415:'Unsupported Media Type',416:'Range Not Satisfiable',417:'Expectation Failed',418:'(Unused)',421:'Misdirected Request',422:'Unprocessable Content',423:'Locked',424:'Failed Dependency',425:'Too Early',426:'Upgrade Required',428:'Precondition Required',429:'Too Many Requests',431:'Request Header Fields Too Large',451:'Unavailable For Legal Reasons',500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout',505:'HTTP Version Not Supported',506:'Variant Also Negotiates',507:'Insufficient Storage',508:'Loop Detected',510:'Not Extended',511:'Network Authentication Required'});
  const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const descriptions = ['Informational','Success','Redirection','Client error','Server error'];
  function status(raw) {
    if (!/^[1-5][0-9]{2}$/.test(String(raw))) throw Error('Status must be three digits from 100 to 599.');
    const code = Number(raw);
    return {code, phrase:statuses[code] || 'Unlisted Status', listed:Object.hasOwn(statuses,code), category:descriptions[Math.floor(code/100)-1], bodyAllowed:!(code<200 || code===204 || code===304), note:'Bundled reference, not a live registry. HEAD responses also omit a body; 205 has zero-length content. 305 is deprecated; 306 and 418 are unused.'};
  }
  function splitDirectives(text) {
    const parts=[]; let start=0, quoted=false, escaped=false;
    for(let i=0;i<text.length;i++) { const c=text[i]; if(escaped){escaped=false;continue;} if(quoted && c==='\\'){escaped=true;continue;} if(c==='"')quoted=!quoted; if(c===','&&!quoted){parts.push(text.slice(start,i).trim());start=i+1;} }
    if(quoted||escaped) throw Error('Cache-Control has an unterminated quoted value.');
    parts.push(text.slice(start).trim()); return parts;
  }
  function inspect(code, text) {
    const reference=status(code);
    if(typeof text!=='string'||text.length>65536)throw Error('Header input limit is 65536 characters.');
    if(/\r(?!\n)/.test(text)||/[^\t\r\n\x20-\x7e]/.test(text))throw Error('Headers require printable ASCII and CRLF or LF line endings.');
    const lines=text.split(/\r?\n/); if(lines.length>500)throw Error('Header line limit is 500.');
    const headers=[], findings=[], map=new Map();
    const add=(severity,code,message)=>findings.push({severity,code,message});
    lines.forEach((line,i)=>{
      if(!line)return;
      const colon=line.indexOf(':');
      if(colon<1||!token.test(line.slice(0,colon)))throw Error('Malformed header name or folded line at line '+(i+1)+'.');
      const name=line.slice(0,colon).toLowerCase(), value=line.slice(colon+1).trim();
      headers.push({name,value}); if(!map.has(name))map.set(name,[]); map.get(name).push(value);
    });
    if(!reference.listed)add('warning','UNLISTED_STATUS','Code is outside the bundled named reference.');
    if(reference.code===305||reference.code===418)add('warning','SPECIAL_STATUS','This reference marks the code deprecated or unused.');
    const directives=[], seen=new Set();
    for(const part of map.has('cache-control')?splitDirectives(map.get('cache-control').join(',')):[]) {
      const m=/^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(?:[ \t]*=[ \t]*(.*))?$/.exec(part);
      if(!m){add('error','CACHE_SYNTAX','Cache-Control contains an empty or malformed directive.');continue;}
      const name=m[1].toLowerCase(), raw=m[2]; let value=raw;
      if(raw!==undefined) {
        if(/^"(?:[^"\\]|\\[\x20-\x7e])*"$/.test(raw))value=raw.slice(1,-1).replace(/\\(.)/g,'$1');
        else if(!token.test(raw)){add('error','CACHE_VALUE','Invalid directive value for '+name+'.');continue;}
      }
      if(seen.has(name))add('error','CACHE_DUPLICATE','Repeated '+name+' directive; no precedence is inferred.');seen.add(name);
      directives.push({name,value:value===undefined?null:value});
      if(['max-age','s-maxage','min-fresh','stale-while-revalidate','stale-if-error'].includes(name)||name==='max-stale'&&value!==undefined) {
        if(value===undefined||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))add('error','CACHE_SECONDS',name+' requires nonnegative safe integer seconds.');
      } else if(['no-store','public','must-revalidate','proxy-revalidate','immutable','no-transform','must-understand','only-if-cached'].includes(name)) {
        if(value!==undefined)add('error','CACHE_FLAG',name+' takes no value.');
      } else if(['private','no-cache'].includes(name)) {
        if(value!==undefined&&(!raw.startsWith('"')||!value.split(',').every(v=>token.test(v.trim()))))add('error','CACHE_FIELDS',name+' field names require a nonempty quoted comma list.');
      } else if(name!=='max-stale')add('info','CACHE_EXTENSION',name+' is an unrecognized extension; semantics are not inferred.');
    }
    if(seen.has('public')&&seen.has('private'))add('error','CACHE_CONFLICT','public and private conflict.');
    if(seen.has('no-store')&&['max-age','s-maxage','public','immutable','stale-while-revalidate','stale-if-error'].some(n=>seen.has(n)))add('warning','CACHE_NO_STORE','no-store makes reuse-oriented directives misleading.');
    if(seen.has('no-cache'))add('info','CACHE_REVALIDATE','no-cache permits storage but requires validation before reuse (field-qualified semantics can differ).');
    if(seen.has('private')&&seen.has('s-maxage'))add('warning','CACHE_SHARED_PRIVATE','Review shared-cache lifetime with private.');
    const single=name=>{const list=map.get(name)||[];if(list.length>1)add('error','CORS_DUPLICATE','Multiple '+name+' fields are invalid here.');return list[0];};
    const origin=single('access-control-allow-origin'), credentials=single('access-control-allow-credentials');
    let validOrigin=false;
    if(origin!==undefined) {
      if(origin==='*')validOrigin=true;
      else if(origin==='null'){validOrigin=true;add('warning','CORS_NULL','null allows opaque origins; review carefully.');}
      else {try {const u=new URL(origin);validOrigin=['http'+':','https'+':'].includes(u.protocol)&&u.origin===origin&&!u.username&&!u.password;}catch{}}
      if(!validOrigin)add('error','CORS_ORIGIN','Allow-Origin must be *, null, or one canonical serialized web origin without path or credentials.');
    }
    if(credentials!==undefined&&credentials!=='true')add('error','CORS_CREDENTIAL_VALUE','Allow-Credentials only accepts the case-sensitive value true.');
    if(origin==='*'&&credentials==='true')add('error','CORS_WILDCARD_CREDENTIALS','Wildcard Allow-Origin cannot authorize credentialed browser reads.');
    if(origin===undefined&&[...map.keys()].some(n=>n.startsWith('access-control-')))add('warning','CORS_MISSING_ORIGIN','CORS response fields are present without Allow-Origin.');
    const vary=(map.get('vary')||[]).join(',').split(',').map(s=>s.trim().toLowerCase());
    if(validOrigin&&origin!=='*'&&!vary.includes('origin')&&!vary.includes('*'))add('warning','CORS_VARY','If Allow-Origin varies by request, include Vary: Origin.');
    for(const name of ['access-control-allow-methods','access-control-allow-headers','access-control-expose-headers']) {
      const v=single(name);if(v===undefined)continue;
      const items=v.split(',').map(s=>s.trim());
      if(!items.every(s=>token.test(s)))add('error','CORS_LIST',name+' requires a nonempty comma-separated token list.');
      if(items.includes('*')&&credentials==='true')add('warning','CORS_LIST_WILDCARD',name+' wildcard is literal with credentials.');
      if(name==='access-control-allow-methods'&&items.some(s=>s!=='*'&&s!==s.toUpperCase()))add('warning','CORS_METHOD_CASE','HTTP methods are case-sensitive; check method casing.');
      if(name==='access-control-allow-headers'&&items.includes('*'))add('warning','CORS_AUTHORIZATION','Authorization must be listed explicitly; a wildcard does not cover it.');
    }
    const maxAge=single('access-control-max-age');
    if(maxAge!==undefined&&(!/^\d+$/.test(maxAge)||!Number.isSafeInteger(Number(maxAge))))add('error','CORS_MAX_AGE','Max-Age requires nonnegative safe integer seconds; browsers impose their own caps.');
    if(origin!==undefined)add('info','CORS_ADVISORY','No request is sent. Request origin, mode, method, credentials and browser policy determine actual access. CORS is not authentication.');
    const generated='HTTP/1.1 '+reference.code+' '+reference.phrase+'\n'+headers.map(h=>h.name+': '+h.value).join('\n');
    return {tool:'httpref',valid:!findings.some(f=>f.severity==='error'),status:reference,headers,directives,findings,generated,notice:'Advisory response-header analysis only. Generated text is a draft, not a complete wire response or a validated policy. Unknown headers are preserved without semantic validation.'};
  }
  function generate(options) {
    if(!options||typeof options!=='object')throw Error('Generator options required.');
    const headers=[];
    for(const [key,name] of [['cache','Cache-Control'],['origin','Access-Control-Allow-Origin'],['methods','Access-Control-Allow-Methods'],['allowHeaders','Access-Control-Allow-Headers'],['exposeHeaders','Access-Control-Expose-Headers'],['maxAge','Access-Control-Max-Age']]) {
      const v=options[key]??'';if(typeof v!=='string'||/[\r\n\x00-\x1f\x7f]/.test(v))throw Error('Generator fields must be single-line text.');if(v)headers.push(name+': '+v);
    }
    if(options.credentials===true)headers.push('Access-Control-Allow-Credentials: true');
    if(options.origin&&options.origin!=='*')headers.push('Vary: Origin');
    return inspect(options.status??200,headers.join('\n'));
  }
  root.HTTPRef=Object.freeze({status,inspect,generate,statuses});
})(typeof module === 'object' ? module.exports : globalThis);
