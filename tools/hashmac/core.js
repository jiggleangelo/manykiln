/* Original ManyKiln digest engines. MIT. Standard algorithm constants, no external code. */
(function(host){
'use strict';
const K256=[
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const K512=(
'428a2f98d728ae22 7137449123ef65cd b5c0fbcfec4d3b2f e9b5dba58189dbbc 3956c25bf348b538 59f111f1b605d019 923f82a4af194f9b ab1c5ed5da6d8118 '+
'd807aa98a3030242 12835b0145706fbe 243185be4ee4b28c 550c7dc3d5ffb4e2 72be5d74f27b896f 80deb1fe3b1696b1 9bdc06a725c71235 c19bf174cf692694 '+
'e49b69c19ef14ad2 efbe4786384f25e3 0fc19dc68b8cd5b5 240ca1cc77ac9c65 2de92c6f592b0275 4a7484aa6ea6e483 5cb0a9dcbd41fbd4 76f988da831153b5 '+
'983e5152ee66dfab a831c66d2db43210 b00327c898fb213f bf597fc7beef0ee4 c6e00bf33da88fc2 d5a79147930aa725 06ca6351e003826f 142929670a0e6e70 '+
'27b70a8546d22ffc 2e1b21385c26c926 4d2c6dfc5ac42aed 53380d139d95b3df 650a73548baf63de 766a0abb3c77b2a8 81c2c92e47edaee6 92722c851482353b '+
'a2bfe8a14cf10364 a81a664bbc423001 c24b8b70d0f89791 c76c51a30654be30 d192e819d6ef5218 d69906245565a910 f40e35855771202a 106aa07032bbd1b8 '+
'19a4c116b8d2d0c8 1e376c085141ab53 2748774cdf8eeb99 34b0bcb5e19b48a8 391c0cb3c5c95a63 4ed8aa4ae3418acb 5b9cca4f7763e373 682e6ff3d6b2b8a3 '+
'748f82ee5defb2fc 78a5636f43172f60 84c87814a1f0ab72 8cc702081a6439ec 90befffa23631e28 a4506cebde82bde9 bef9a3f7b2c67915 c67178f2e372532b '+
'ca273eceea26619c d186b8c721c0c207 eada7dd6cde0eb1e f57d4f7fee6ed178 06f067aa72176fba 0a637dc5a2c898a6 113f9804bef90dae 1b710b35131c471b '+
'28db77f523047d84 32caab7b40c72493 3c9ebe0a15c9bebc 431d67c49c100d4c 4cc5d4becb3e42b6 597f299cfc657e2a 5fcb6fab3ad6faec 6c44198c4a475817').split(' ').map(x=>BigInt('0x'+x));
const mask=(1n<<64n)-1n;
const r32=(x,n)=>(x>>>n)|(x<<(32-n));
const r64=(x,n)=>((x>>BigInt(n))|(x<<BigInt(64-n)))&mask;
function bytes(x){if(!(x instanceof Uint8Array))throw new TypeError('Expected Uint8Array');return x;}
class SHA {
  constructor(algorithm='sha256'){
    if(!['sha256','sha384','sha512'].includes(algorithm))throw new Error('Unsupported SHA algorithm');
    this.algorithm=algorithm;this.size=algorithm==='sha256'?64:128;this.buffer=new Uint8Array(this.size);this.used=0;this.length=0n;this.done=false;
    if(algorithm==='sha256')this.h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    else this.h=(algorithm==='sha384'?
      'cbbb9d5dc1059ed8 629a292a367cd507 9159015a3070dd17 152fecd8f70e5939 67332667ffc00b31 8eb44a8768581511 db0c2e0d64f98fa7 47b5481dbefa4fa4':
      '6a09e667f3bcc908 bb67ae8584caa73b 3c6ef372fe94f82b a54ff53a5f1d36f1 510e527fade682d1 9b05688c2b3e6c1f 1f83d9abfb41bd6b 5be0cd19137e2179').split(' ').map(x=>BigInt('0x'+x));
  }
  update(input){
    bytes(input);if(this.done)throw new Error('Digest already finalized');
    this.length+=BigInt(input.length);if(this.length*8n>=(1n<<BigInt(this.size===64?64:128)))throw new Error('SHA message length overflow');
    let pos=0;
    while(pos<input.length){
      const n=Math.min(input.length-pos,this.size-this.used);
      this.buffer.set(input.subarray(pos,pos+n),this.used);pos+=n;this.used+=n;
      if(this.used===this.size){this.block(this.buffer);this.used=0;}
    }return this;
  }
  block(b){
    if(this.size===64){
      const w=new Uint32Array(64);for(let j=0;j<16;j++)w[j]=((b[j*4]<<24)|(b[j*4+1]<<16)|(b[j*4+2]<<8)|b[j*4+3])>>>0;
      for(let j=16;j<64;j++){const x=w[j-15],y=w[j-2];w[j]=(w[j-16]+(r32(x,7)^r32(x,18)^(x>>>3))+w[j-7]+(r32(y,17)^r32(y,19)^(y>>>10)))>>>0;}
      let [a,c,d,e,f,g,h,i]=this.h;
      for(let j=0;j<64;j++){
        const t1=(i+(r32(f,6)^r32(f,11)^r32(f,25))+((f&g)^(~f&h))+K256[j]+w[j])>>>0;
        const t2=((r32(a,2)^r32(a,13)^r32(a,22))+((a&c)^(a&d)^(c&d)))>>>0;
        i=h;h=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0;
      }
      const v=[a,c,d,e,f,g,h,i];for(let j=0;j<8;j++)this.h[j]=(this.h[j]+v[j])>>>0;
    }else{
      const w=new Array(80);for(let j=0;j<16;j++){let n=0n;for(let k=0;k<8;k++)n=(n<<8n)|BigInt(b[j*8+k]);w[j]=n;}
      for(let j=16;j<80;j++){const x=w[j-15],y=w[j-2];w[j]=(w[j-16]+(r64(x,1)^r64(x,8)^(x>>7n))+w[j-7]+(r64(y,19)^r64(y,61)^(y>>6n)))&mask;}
      let [a,c,d,e,f,g,h,i]=this.h;
      for(let j=0;j<80;j++){
        const t1=(i+(r64(f,14)^r64(f,18)^r64(f,41))+((f&g)^((~f&mask)&h))+K512[j]+w[j])&mask;
        const t2=((r64(a,28)^r64(a,34)^r64(a,39))+((a&c)^(a&d)^(c&d)))&mask;
        i=h;h=g;g=f;f=(e+t1)&mask;e=d;d=c;c=a;a=(t1+t2)&mask;
      }
      const v=[a,c,d,e,f,g,h,i];for(let j=0;j<8;j++)this.h[j]=(this.h[j]+v[j])&mask;
    }
  }
  digest(){
    if(this.done)throw new Error('Digest already finalized');this.done=true;
    const lengthBytes=this.size===64?8:16,total=this.used+1+lengthBytes<=this.size?this.size:this.size*2;
    const tail=new Uint8Array(total);tail.set(this.buffer.subarray(0,this.used));tail[this.used]=128;
    let n=this.length*8n;for(let j=0;j<lengthBytes;j++){tail[total-1-j]=Number(n&255n);n>>=8n;}
    for(let j=0;j<total;j+=this.size)this.block(tail.subarray(j,j+this.size));
    const out=new Uint8Array(this.algorithm==='sha256'?32:this.algorithm==='sha384'?48:64),word=this.size===64?4:8;
    for(let j=0;j<out.length;j++)out[j]=Number((BigInt(this.h[Math.floor(j/word)])>>BigInt((word-1-j%word)*8))&255n);
    return out;
  }
}
class HMAC {
  constructor(key){
    bytes(key);if(key.length>64)key=new SHA().update(key).digest();
    const inner=new Uint8Array(64).fill(0x36),outer=new Uint8Array(64).fill(0x5c);
    for(let i=0;i<key.length;i++){inner[i]^=key[i];outer[i]^=key[i];}
    this.inner=new SHA().update(inner);this.outer=new SHA().update(outer);inner.fill(0);outer.fill(0);this.done=false;
  }
  update(data){if(this.done)throw new Error('HMAC already finalized');this.inner.update(data);return this;}
  digest(){if(this.done)throw new Error('HMAC already finalized');this.done=true;return this.outer.update(this.inner.digest()).digest();}
}
class CRC32 {
  constructor(){this.state=0xffffffff;this.done=false;}
  update(input){bytes(input);if(this.done)throw new Error('CRC already finalized');let c=this.state;for(const b of input){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}this.state=c>>>0;return this;}
  digest(){if(this.done)throw new Error('CRC already finalized');this.done=true;const c=(this.state^0xffffffff)>>>0;return Uint8Array.of(c>>>24,(c>>>16)&255,(c>>>8)&255,c&255);}
}
function engine(algorithm,key){
  if(algorithm==='crc32')return new CRC32();
  if(algorithm==='hmac-sha256')return new HMAC(bytes(key));
  return new SHA(algorithm);
}
function digest(algorithm,input,key){return engine(algorithm,key).update(bytes(input)).digest();}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function hex(input){return Array.from(bytes(input),b=>b.toString(16).padStart(2,'0')).join('');}
function unhex(s){if(typeof s!=='string'||! /^(?:[0-9a-fA-F]{2})*$/.test(s))throw new Error('Expected even-length hexadecimal bytes');const a=new Uint8Array(s.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a;}
function base64(input){
  bytes(input);let out='';
  for(let i=0;i<input.length;i+=3){const n=(input[i]<<16)|((input[i+1]||0)<<8)|(input[i+2]||0);out+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<input.length?alphabet[(n>>>6)&63]:'=')+(i+2<input.length?alphabet[n&63]:'=');}return out;
}
function unbase64(s){
  if(typeof s!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw new Error('Expected canonical padded Base64');
  const out=[];for(let i=0;i<s.length;i+=4){const n=(alphabet.indexOf(s[i])<<18)|(alphabet.indexOf(s[i+1])<<12)|((s[i+2]==='='?0:alphabet.indexOf(s[i+2]))<<6)|(s[i+3]==='='?0:alphabet.indexOf(s[i+3]));out.push((n>>>16)&255);if(s[i+2]!=='=')out.push((n>>>8)&255);if(s[i+3]!=='=')out.push(n&255);}
  const a=Uint8Array.from(out);if(base64(a)!==s)throw new Error('Non-canonical Base64 padding bits');return a;
}
function format(input,type='hex',algorithm='sha256'){
  if(type==='hex')return hex(input);if(type==='base64')return base64(input);
  if(type==='sri'&&['sha256','sha384','sha512'].includes(algorithm))return algorithm+'-'+base64(input);
  throw new Error('SRI requires a SHA digest (not HMAC or CRC32)');
}
function decode(s,type='hex',algorithm='sha256'){
  s=s.trim();if(type==='hex')return unhex(s);if(type==='base64')return unbase64(s);
  if(type==='sri'&&['sha256','sha384','sha512'].includes(algorithm)&&s.startsWith(algorithm+'-'))return unbase64(s.slice(algorithm.length+1));
  throw new Error('Expected matching SRI algorithm');
}
function equal(a,b){
  bytes(a);bytes(b);let difference=a.length^b.length;
  // Full public-length scan; no early exit on differing content. JS/JIT cannot promise hardware constant-time.
  for(let i=0,n=Math.max(a.length,b.length);i<n;i++)difference|=(a[i]||0)^(b[i]||0);
  return difference===0;
}
function safeName(s){
  if(typeof s!=='string'||s.length===0||s.includes('\0'))throw new Error('Filename must be nonempty and contain no NUL');
  for(let i=0;i<s.length;i++){const n=s.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const m=s.charCodeAt(++i);if(!(m>=0xdc00&&m<=0xdfff))throw new Error('Invalid Unicode filename');}else if(n>=0xdc00&&n<=0xdfff)throw new Error('Invalid Unicode filename');}
  return s;
}
function manifest(entries){
  if(entries.length>10000)throw new Error('Manifest entry limit exceeded');
  const seen=new Set(),rows=[];
  for(const e of entries){
    safeName(e.name);if(seen.has(e.name))throw new Error('Duplicate filename');seen.add(e.name);
    const hash=e.hash??hex(digest('sha256',bytes(e.data)));if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('Expected lowercase SHA-256 hex');
    const escaped=/[\\\n\r]/.test(e.name),name=e.name.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll('\r','\\r');
    rows.push({name:e.name,text:(escaped?'\\':'')+hash+'  '+name});
  }
  rows.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);return rows.map(x=>x.text).join('\n')+(rows.length?'\n':'');
}
function parseManifest(s){
  if(s.length>4*1024*1024)throw new Error('Manifest limit is 4 MiB');
  const lines=s.split('\n');if(lines.at(-1)==='')lines.pop();if(lines.length>10000)throw new Error('Manifest entry limit exceeded');
  const entries=[],seen=new Set();
  for(let i=0;i<lines.length;i++){
    let line=lines[i];if(line.endsWith('\r'))line=line.slice(0,-1);
    const m=/^(\\?)([0-9a-fA-F]{64}) ([ *])(.+)$/.exec(line);
    const fail=message=>{throw new Error(message+' at '+(i+1)+':1');};
    if(!m)fail('Invalid sha256sum line');
    let name=m[4];
    if(m[1]){
      let decoded='';for(let j=0;j<name.length;j++){if(name[j]!=='\\'){decoded+=name[j];continue;}const c=name[++j];if(c==='\\')decoded+='\\';else if(c==='n')decoded+='\n';else if(c==='r')decoded+='\r';else fail('Invalid filename escape');}name=decoded;
    }
    try{safeName(name);}catch{fail('Invalid filename');}if(seen.has(name))fail('Duplicate manifest filename');seen.add(name);entries.push({name,hash:m[2].toLowerCase()});
  }return entries;
}
function verify(text,entries){
  const expected=parseManifest(text),actual=new Map();
  for(const e of entries){safeName(e.name);if(actual.has(e.name))throw new Error('Duplicate selected filename');const h=e.hash??hex(digest('sha256',bytes(e.data)));if(!/^[0-9a-f]{64}$/.test(h))throw new Error('Invalid supplied digest');actual.set(e.name,h);}
  const rows=expected.map(e=>({name:e.name,status:!actual.has(e.name)?'MISSING':equal(unhex(e.hash),unhex(actual.get(e.name)))?'OK':'MISMATCH'}));
  const wanted=new Set(expected.map(e=>e.name));for(const name of actual.keys())if(!wanted.has(name))rows.push({name,status:'EXTRA'});
  return {ok:rows.length>0&&rows.every(x=>x.status==='OK'),rows};
}
const api={SHA,HMAC,CRC32,engine,digest,hex,unhex,base64,unbase64,format,decode,equal,manifest,parseManifest,verify};
if(typeof module==='object'&&module.exports)module.exports=api;else host.HashKit=Object.freeze(api);
})(globalThis);
