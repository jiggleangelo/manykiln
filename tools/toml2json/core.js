/* Original ManyKiln TOML engine. MIT. No dependencies. */
(function (host) {
'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
class TomlError extends Error {
  constructor(message,source,index) {
    const before=source.slice(0,index), line=(before.match(/\n/g)||[]).length+1;
    const col=index-(before.lastIndexOf('\n')+1)+1;
    super(message+' at '+line+':'+col); this.name='TomlError'; this.line=line; this.column=col; this.index=index;
  }
}
class DateValue { constructor(kind,value){this.kind=kind;this.value=value;} }
class FloatValue { constructor(value){this.value=value;} }
const dict=()=>Object.create(null);
function scalarText(s) {
  for(let i=0;i<s.length;i++){
    const n=s.charCodeAt(i);
    if(n>=0xd800&&n<=0xdbff){ const m=s.charCodeAt(++i);if(!(m>=0xdc00&&m<=0xdfff))return false; }
    else if(n>=0xdc00&&n<=0xdfff)return false;
  } return true;
}
function dateKind(s) {
  const m=/^(?:(\d{4})-(\d{2})-(\d{2})(?:([Tt ])(\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?|(\d{2}):(\d{2}):(\d{2})(\.\d+)?)$/.exec(s);
  if(!m)return null;
  if(m[1]){
    const y=+m[1],mo=+m[2],d=+m[3],days=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
    if(mo<1||mo>12||d<1||d>days[mo-1])return null;
  }
  const h=m[5]??m[10],mi=m[6]??m[11],se=m[7]??m[12];
  if(h!==undefined&&(+h>23||+mi>59||+se>60))return null;
  if(m[9]&&/^[+-]/.test(m[9])&&(+m[9].slice(1,3)>23||+m[9].slice(4)>59))return null;
  return m[10]?'local-time':!m[4]?'local-date':m[9]?'offset-date-time':'local-date-time';
}
class Parser {
  constructor(s){this.s=s;this.i=0;this.meta=new WeakMap();this.aots=new WeakSet();this.nodes=0;this.root=this.table('root');}
  fail(m,i=this.i){throw new TomlError(m,this.s,i);}
  table(kind){const o=dict();this.meta.set(o,kind);return o;}
  ws(){while(this.s[this.i]===' '||this.s[this.i]==='\t')this.i++;}
  newline(){if(this.s[this.i]==='\r'){if(this.s[this.i+1]!=='\n')this.fail('Bare carriage return');this.i++;}if(this.s[this.i]==='\n'){this.i++;return true;}return false;}
  comment(){if(this.s[this.i]==='#'){while(this.i<this.s.length&&!/[\r\n]/.test(this.s[this.i])){const n=this.s.charCodeAt(this.i);if((n<32&&n!==9)||n===127)this.fail('Control character in comment');this.i++;}}}
  gap(){for(;;){this.ws();this.comment();if(!this.newline())break;}}
  expect(c){if(this.s[this.i]!==c)this.fail('Expected '+c);this.i++;}
  key(){
    this.ws();const start=this.i;let k;
    if(this.s[this.i]==='"'||this.s[this.i]==="'")k=this.string(true);
    else {const m=/^[A-Za-z0-9_-]+/.exec(this.s.slice(this.i));if(!m)this.fail('Expected key');k=m[0];this.i+=k.length;}
    if(!scalarText(k))this.fail('Invalid Unicode key',start);this.ws();return k;
  }
  path(){const keys=[this.key()];while(this.s[this.i]==='.'){this.i++;keys.push(this.key());if(keys.length>64)this.fail('Key path nesting limit exceeded');}return keys;}
  string(key=false){
    const q=this.s[this.i++];let multi=false;
    if(!key&&this.s.slice(this.i,this.i+2)===q+q){multi=true;this.i+=2;this.newline();}
    let out='';
    while(this.i<this.s.length){
      if(this.s[this.i]===q){
        let n=0;while(this.s[this.i+n]===q)n++;
        if(!multi){this.i++;return out;}
        if(n>=3){if(n>5)this.fail('Too many closing quotes');out+=q.repeat(n-3);this.i+=n;return out;}
        out+=q.repeat(n);this.i+=n;continue;
      }
      let c=this.s[this.i++],n=c.charCodeAt(0);
      if(c==='\n'||c==='\r'){
        if(!multi)this.fail('Newline in single-line string',this.i-1);
        if(c==='\r'){if(this.s[this.i]!=='\n')this.fail('Bare carriage return',this.i-1);this.i++;}out+='\n';continue;
      }
      if((n<32&&n!==9)||n===127)this.fail('Control character in string',this.i-1);
      if(q==='"'&&c==='\\'){
        if(multi){
          const save=this.i;this.ws();
          if(this.s[this.i]==='\n'||this.s[this.i]==='\r'){
            this.newline();while(this.i<this.s.length){this.ws();if(!this.newline())break;}continue;
          }this.i=save;
        }
        c=this.s[this.i++];const esc={b:'\b',t:'\t',n:'\n',f:'\f',r:'\r','"':'"','\\':'\\'};
        if(own(esc,c)){out+=esc[c];continue;}
        if(c==='u'||c==='U'){
          const len=c==='u'?4:8,h=this.s.slice(this.i,this.i+len);
          if(!new RegExp('^[0-9A-Fa-f]{'+len+'}$').test(h))this.fail('Invalid Unicode escape');
          const cp=parseInt(h,16);if(cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))this.fail('Invalid Unicode scalar');
          out+=String.fromCodePoint(cp);this.i+=len;continue;
        }this.fail('Invalid string escape',this.i-1);
      }out+=c;
    }this.fail('Unterminated string');
  }
  put(table,keys,value,start){
    let obj=table;
    for(let i=0;i<keys.length-1;i++){
      const key=keys[i];
      if(!own(obj,key))obj[key]=this.table('dotted');
      const child=obj[key];
      if(!child||typeof child!=='object'||Array.isArray(child)||!this.meta.has(child)||['inline','explicit'].includes(this.meta.get(child)))this.fail('Key path crosses a value, closed inline table or explicitly defined table',start);
      if(this.meta.get(child)==='implicit')this.meta.set(child,'dotted');
      obj=child;
    }
    const k=keys.at(-1);if(own(obj,k))this.fail('Duplicate key '+JSON.stringify(k),start);obj[k]=value;
    if(++this.nodes>100000)this.fail('Entry limit exceeded',start);
  }
  header(keys,array,start){
    let obj=this.root;
    for(let j=0;j<keys.length;j++){
      const k=keys[j],last=j===keys.length-1;
      if(last){
        if(array){
          if(!own(obj,k)){obj[k]=[];this.aots.add(obj[k]);}
          if(!this.aots.has(obj[k]))this.fail('Array-of-tables redefinition',start);
          const item=this.table('explicit');obj[k].push(item);return item;
        }
        if(!own(obj,k)){obj[k]=this.table('explicit');return obj[k];}
        if(this.meta.get(obj[k])!=='implicit')this.fail('Table redefinition',start);
        this.meta.set(obj[k],'explicit');return obj[k];
      }
      if(!own(obj,k))obj[k]=this.table('implicit');
      let child=obj[k];if(this.aots.has(child))child=child.at(-1);
      if(!child||!this.meta.has(child)||this.meta.get(child)==='inline')this.fail('Table path crosses a value',start);
      obj=child;
    }
  }
  value(depth=0){
    if(depth>64)this.fail('Nesting limit exceeded');
    const c=this.s[this.i];
    if(c==='"'||c==="'")return this.string();
    if(c==='['){
      this.i++;const a=[];this.gap();if(this.s[this.i]===']'){this.i++;return a;}
      for(;;){a.push(this.value(depth+1));if(++this.nodes>100000)this.fail('Entry limit exceeded');this.gap();if(this.s[this.i]===']'){this.i++;return a;}this.expect(',');this.gap();if(this.s[this.i]===']'){this.i++;return a;}}
    }
    if(c==='{'){
      this.i++;const obj=this.table('inline-open');this.ws();if(this.s[this.i]==='}'){this.i++;this.meta.set(obj,'inline');return obj;}
      for(;;){
        const start=this.i,keys=this.path();this.expect('=');this.ws();this.put(obj,keys,this.value(depth+1),start);this.ws();
        if(this.s[this.i]==='}'){this.i++;this.closeInline(obj);return obj;}this.expect(',');this.ws();
        if(this.s[this.i]==='}'||this.s[this.i]==='#'||/[\r\n]/.test(this.s[this.i]||''))this.fail('Inline tables forbid trailing commas/comments/newlines between entries');
      }
    }
    const start=this.i;
    // A date and a time may be separated by exactly one space.
    const dm=/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?/.exec(this.s.slice(this.i));
    let raw;
    if(dm&&/^(?:$|[\s,\]}#])/.test(this.s.slice(this.i+dm[0].length))){raw=dm[0];this.i+=raw.length;}
    else {while(this.i<this.s.length&&!/[\s,\]}#]/.test(this.s[this.i]))this.i++;raw=this.s.slice(start,this.i);}
    if(raw==='true')return true;if(raw==='false')return false;
    const dk=dateKind(raw);if(dk)return new DateValue(dk,raw);
    if(/^[+-]?(?:inf|nan)$/.test(raw))return new FloatValue(raw.endsWith('nan')?NaN:raw[0]==='-'?-Infinity:Infinity);
    const dec='(?:0|[1-9](?:_?[0-9])*)',ds='[0-9](?:_?[0-9])*';
    if(new RegExp('^[+-]?'+dec+'$').test(raw)||/^0x[0-9a-fA-F](?:_?[0-9a-fA-F])*$/.test(raw)||/^0o[0-7](?:_?[0-7])*$/.test(raw)||/^0b[01](?:_?[01])*$/.test(raw)){
      let clean=raw.replaceAll('_','');if(clean[0]==='+')clean=clean.slice(1);
      const n=BigInt(clean);if(n<-(1n<<63n)||n>(1n<<63n)-1n)this.fail('Integer outside signed 64-bit range',start);return n;
    }
    if(new RegExp('^[+-]?'+dec+'(?:\\.'+ds+'(?:[eE][+-]?'+ds+')?|[eE][+-]?'+ds+')$').test(raw)){
      const n=Number(raw.replaceAll('_',''));if(!Number.isFinite(n))this.fail('Float overflow; use explicit inf',start);return new FloatValue(n);
    }
    this.fail('Invalid value '+JSON.stringify(raw),start);
  }
  closeInline(o){this.meta.set(o,'inline');for(const v of Object.values(o))if(this.meta.has(v)&&this.meta.get(v)==='dotted')this.closeInline(v);}
  parse(){
    if(this.s.length>2*1024*1024)this.fail('Input limit is 2 MiB',0);
    if(!scalarText(this.s))this.fail('Invalid Unicode scalar',0);
    let current=this.root;this.gap();
    while(this.i<this.s.length){
      const start=this.i;
      if(this.s[this.i]==='['){
        this.i++;const array=this.s[this.i]==='[';if(array)this.i++;
        const keys=this.path();this.expect(']');if(array)this.expect(']');
        current=this.header(keys,array,start);
      }else{
        const keys=this.path();this.expect('=');this.ws();this.put(current,keys,this.value(),start);
      }
      this.ws();this.comment();if(this.i<this.s.length&&!this.newline())this.fail('Expected end of line');this.gap();
    }return this.root;
  }
}
function parse(s){if(typeof s!=='string')throw new TypeError('TOML input must be text');return new Parser(s).parse();}
const numberText=n=>Object.is(n,-0)?'-0':String(n);
function canonical(value,typed=false){
  const encode=(v,depth)=>{
    if(depth>64)throw new Error('JSON nesting limit exceeded');
    if(typed){
      if(v instanceof DateValue)return ['date',v.kind,v.value];
      if(v instanceof FloatValue)return ['float',Number.isNaN(v.value)?'nan':v.value===Infinity?'inf':v.value===-Infinity?'-inf':numberText(v.value)];
      if(typeof v==='bigint')return ['integer',String(v)];
      if(Array.isArray(v))return ['array',v.map(x=>encode(x,depth+1))];
      if(v&&typeof v==='object'){const o=dict();for(const k of Object.keys(v))o[k]=encode(v[k],depth+1);return ['table',o];}
      if(typeof v==='string'||typeof v==='boolean')return [typeof v,v];throw new Error('Unsupported TOML type');
    }
    if(v instanceof DateValue)return v.value;
    if(v instanceof FloatValue){if(!Number.isFinite(v.value))throw new Error('Non-finite float requires lossless typed JSON');return v.value;}
    if(typeof v==='bigint'){if(v>BigInt(Number.MAX_SAFE_INTEGER)||v<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Large integer requires lossless typed JSON');return Number(v);}
    if(Array.isArray(v))return v.map(x=>encode(x,depth+1));
    if(v&&typeof v==='object'){const o=dict();for(const k of Object.keys(v))o[k]=encode(v[k],depth+1);return o;}return v;
  };
  function output(v,d=0){
    if(v===null)return 'null';
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('Non-finite JSON number');return numberText(v);}
    if(typeof v!=='object')return JSON.stringify(v);
    const pad='  '.repeat(d),next=pad+'  ';
    if(Array.isArray(v))return v.length?'[\n'+v.map(x=>next+output(x,d+1)).join(',\n')+'\n'+pad+']':'[]';
    const keys=Object.keys(v).sort();return keys.length?'{\n'+keys.map(k=>next+JSON.stringify(k)+': '+output(v[k],d+1)).join(',\n')+'\n'+pad+'}':'{}';
  }
  return output(typed?{'$toml':1,value:encode(value,0)}:encode(value,0))+'\n';
}
// JSON scanner rejects duplicate keys and imprecise integral tokens before native conversion.
function parseJSON(s){
  if(s.length>2*1024*1024)throw new Error('Input limit is 2 MiB');let i=0;
  const err=m=>{throw new TomlError(m,s,i);};
  const ws=()=>{while(/[ \t\r\n]/.test(s[i]||'X'))i++;};
  function str(){
    const start=i++;while(i<s.length){const c=s[i++];if(c==='"'){let v;try{v=JSON.parse(s.slice(start,i));}catch{err('Invalid JSON string');}if(!scalarText(v))err('Invalid Unicode scalar');return v;}if(c==='\\')i++;}
    err('Unterminated JSON string');
  }
  function val(d){
    if(d>64)err('JSON nesting limit exceeded');ws();
    if(s[i]==='"')return str();
    if(s[i]==='{'){i++;const o=dict();ws();if(s[i]==='}'){i++;return o;}for(;;){ws();if(s[i]!=='"')err('Expected JSON key');const k=str();ws();if(s[i++]!==':')err('Expected colon');if(own(o,k))err('Duplicate JSON key');o[k]=val(d+1);ws();const c=s[i++];if(c==='}')return o;if(c!==',')err('Expected comma');}}
    if(s[i]==='['){i++;const a=[];ws();if(s[i]===']'){i++;return a;}for(;;){a.push(val(d+1));ws();const c=s[i++];if(c===']')return a;if(c!==',')err('Expected comma');}}
    for(const [word,v] of [['true',true],['false',false],['null',null]])if(s.slice(i,i+word.length)===word){i+=word.length;return v;}
    const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if(!m)err('Invalid JSON value');i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n)))err('JSON number outside exact supported range');return n;
  }
  const v=val(0);ws();if(i!==s.length)err('Trailing JSON content');return v;
}
function fromJSON(s,typed=false){
  let v=parseJSON(s);
  if(typed){
    if(!v||Array.isArray(v)||v.$toml!==1||Object.keys(v).length!==2||!own(v,'value'))throw new Error('Expected lossless {$toml:1,value:...} envelope');
    function decode(a,d){
      if(d>64||!Array.isArray(a))throw new Error('Invalid typed JSON node');
      const [t,x]=a;
      if(t==='table'&&a.length===2&&x&&typeof x==='object'&&!Array.isArray(x)){const o=dict();for(const k of Object.keys(x))o[k]=decode(x[k],d+1);return o;}
      if(t==='array'&&a.length===2&&Array.isArray(x))return x.map(y=>decode(y,d+1));
      if((t==='string'||t==='boolean')&&a.length===2&&typeof x===t)return x;
      if(t==='integer'&&a.length===2&&typeof x==='string'&&/^-?(?:0|[1-9]\d*)$/.test(x)){const n=BigInt(x);if(n>=-(1n<<63n)&&n<1n<<63n)return n;}
      if(t==='float'&&a.length===2&&typeof x==='string'){
        if(['nan','inf','-inf'].includes(x))return new FloatValue(x==='nan'?NaN:x==='inf'?Infinity:-Infinity);
        if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(x)&&Number.isFinite(Number(x)))return new FloatValue(Number(x));
      }
      if(t==='date'&&a.length===3&&typeof a[2]==='string'&&dateKind(a[2])===x)return new DateValue(x,a[2]);
      throw new Error('Invalid typed JSON node '+String(t));
    }v=decode(v.value,0);
  }
  if(!v||typeof v!=='object'||Array.isArray(v)||v instanceof DateValue||v instanceof FloatValue)throw new Error('JSON root must be a table/object');
  const atom=(x,d=0)=>{
    if(d>64)throw new Error('TOML nesting limit exceeded');
    if(x instanceof DateValue)return x.value;
    if(x instanceof FloatValue){
      const n=x.value;if(Number.isNaN(n))return 'nan';if(n===Infinity)return 'inf';if(n===-Infinity)return '-inf';
      const s=numberText(n);return /[.eE]/.test(s)?s:s+'.0';
    }
    if(typeof x==='bigint')return String(x);
    if(typeof x==='string'){
      if(!scalarText(x))throw new Error('Invalid Unicode scalar');
      return JSON.stringify(x).replace(/\\u0008/g,'\\b').replace(/\\u000c/g,'\\f').replace(/\u007f/g,'\\u007f');
    }
    if(typeof x==='boolean')return String(x);
    if(typeof x==='number'){if(!Number.isFinite(x))throw new Error('Invalid JSON number');if(Object.is(x,-0))return '-0.0';return String(x);}
    if(Array.isArray(x))return '['+x.map(y=>atom(y,d+1)).join(', ')+']';
    if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>atom(k,d+1)+' = '+atom(x[k],d+1)).join(', ')+'}';
    throw new Error('JSON null has no TOML representation');
  };
  return Object.keys(v).sort().map(k=>atom(k)+' = '+atom(v[k])).join('\n')+'\n';
}
const api={parse,canonical,fromJSON,parseJSON,TomlError,DateValue,FloatValue,dateKind};
if(typeof module==='object'&&module.exports)module.exports=api;else host.TomlKit=Object.freeze(api);
})(globalThis);
