/* Original MIT ASN.1 DER / X.509 reader. No trust or signature verification. */
(function(root){
'use strict';
const MAX=1048576;
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function der(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(!bytes.length||bytes.length>MAX)throw Error('DER input must be 1–1,048,576 bytes');
 let count=0;
 function read(start,limit,depth){
  if(depth>32||++count>20000)throw Error('ASN.1 resource limit');
  let p=start;if(p>=limit)throw Error('Truncated ASN.1 tag');
  const first=bytes[p++],cls=first>>>6,constructed=!!(first&32);let tag=first&31;
  if(tag===31){tag=0;let n=0;do{if(p>=limit||n++>4)throw Error('Invalid high tag');const v=bytes[p++];if(n===1&&v===128)throw Error('Nonminimal high tag');tag=tag*128+(v&127);if(!(v&128))break;}while(true);if(tag<31)throw Error('Nonminimal tag');}
  if(p>=limit)throw Error('Missing ASN.1 length');
  let length=bytes[p++];
  if(length&128){const n=length&127;if(!n||n>4||p+n>limit||bytes[p]===0)throw Error('Invalid DER length');length=0;for(let i=0;i<n;i++)length=length*256+bytes[p++];if(length<128)throw Error('Nonminimal DER length');}
  const head=p,end=p+length;if(end>limit)throw Error('ASN.1 length exceeds container');
  if(cls===0){
   if(tag===0)throw Error('DER end-of-content prohibited');
   if([16,17].includes(tag)!==constructed)throw Error('Invalid universal constructed form');
   if(tag===1&&(length!==1||![0,255].includes(bytes[p])))throw Error('Invalid DER boolean');
   if(tag===2&&(!length||(length>1&&((bytes[p]===0&&!(bytes[p+1]&128))||(bytes[p]===255&&(bytes[p+1]&128))))))throw Error('Nonminimal DER integer');
   if(tag===3){if(!length||bytes[p]>7||(length===1&&bytes[p]!==0)||(length>1&&bytes[p]&&((bytes[end-1]&((1<<bytes[p])-1))!==0)))throw Error('Invalid DER bit string');}
   if(tag===5&&length)throw Error('Invalid NULL');
  }
  const children=[];
  if(constructed){while(p<end){const n=read(p,end,depth+1);children.push(n);p=n.end;}
   if(cls===0&&tag===17){for(let i=1;i<children.length;i++){const a=bytes.slice(children[i-1].start,children[i-1].end),b=bytes.slice(children[i].start,children[i].end);let k=0;while(k<Math.min(a.length,b.length)&&a[k]===b[k])k++;if(k<Math.min(a.length,b.length)?a[k]>b[k]:a.length>b.length)throw Error('Unsorted DER SET');}}
  }
  return {cls,tag,constructed,start,head,end,bytes:bytes.slice(head,end),encoded:bytes.slice(start,end),children};
 }
 const node=read(0,bytes.length,0);if(node.end!==bytes.length)throw Error('Trailing DER bytes');return node;
}
function expect(n,tag,cls=0){if(!n||n.cls!==cls||n.tag!==tag)throw Error('Unexpected ASN.1 structure (expected '+tag+')');return n;}
function oid(n){
 const b=expect(n,6).bytes;if(!b.length||b.length>128)throw Error('Invalid OID');
 const arcs=[];let v=0n,first=true;
 for(const x of b){if(first&&x===128)throw Error('Nonminimal OID arc');v=(v<<7n)|BigInt(x&127);if(x&128){first=false;continue;}arcs.push(v);v=0n;first=true;}
 if(!first)throw Error('Unfinished OID');const a=arcs.shift();return [a<40n?0:a<80n?1:2,a<40n?a:a<80n?a-40n:a-80n,...arcs].join('.');
}
const labels={'2.5.4.3':'CN','2.5.4.6':'C','2.5.4.7':'L','2.5.4.8':'ST','2.5.4.10':'O','2.5.4.11':'OU','1.2.840.113549.1.9.1':'emailAddress','0.9.2342.19200300.100.1.25':'DC'};
function string(n){
 if(!n||n.cls!==0)throw Error('Invalid directory string');
 const b=n.bytes;
 if(n.tag===12)return new TextDecoder('utf-8',{fatal:true}).decode(b);
 if(n.tag===30){if(b.length%2)throw Error('Invalid BMPString');let s='';for(let i=0;i<b.length;i+=2){const v=b[i]*256+b[i+1];if(v>=0xd800&&v<=0xdfff)throw Error('Invalid BMP surrogate');s+=String.fromCharCode(v);}return s;}
 if(n.tag===28){if(b.length%4)throw Error('Invalid UniversalString');let s='';for(let i=0;i<b.length;i+=4){const v=b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3];if(v>0x10ffff||(v>=0xd800&&v<=0xdfff))throw Error('Invalid UniversalString codepoint');s+=String.fromCodePoint(v);}return s;}
 if([19,22,18].includes(n.tag)){if(b.some(x=>x>127))throw Error('Non-ASCII ASN.1 string');const s=String.fromCharCode(...b);if(n.tag===19&&!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(s))throw Error('Invalid PrintableString');if(n.tag===18&&!/^[0-9 ]*$/.test(s))throw Error('Invalid NumericString');return s;}
 if(n.tag===20)return Array.from(b,x=>String.fromCharCode(x)).join(''); // explicit legacy byte-preserving display
 throw Error('Unsupported directory string tag '+n.tag);
}
function name(n){
 expect(n,16);const rdns=n.children.map(set=>{expect(set,17);if(!set.children.length)throw Error('Empty RDN');return set.children.map(a=>{expect(a,16);if(a.children.length!==2)throw Error('Invalid attribute');const id=oid(a.children[0]);return {oid:id,label:labels[id]||id,value:string(a.children[1])};});});
 const canonical=JSON.stringify(rdns.map(r=>r.map(a=>[a.oid,a.value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
 return {rdns,text:rdns.map(r=>r.map(a=>a.label+'='+a.value).join(' + ')).join(', '),canonical,derHex:hex(n.encoded)};
}
function time(n){
 if(!n||n.cls!==0||![23,24].includes(n.tag))throw Error('Invalid X.509 time tag');
 if(n.bytes.some(x=>x>127))throw Error('Invalid time encoding');
 const s=String.fromCharCode(...n.bytes),m=s.match(n.tag===23?/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/:/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
 if(!m)throw Error('Time must contain seconds and Z UTC');
 let y=+m[1];if(n.tag===23)y+=y>=50?1900:2000;
 const parts=[y,+m[2],+m[3],+m[4],+m[5],+m[6]];
 const d=new Date(0);d.setUTCFullYear(parts[0],parts[1]-1,parts[2]);d.setUTCHours(parts[3],parts[4],parts[5],0);
 if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==parts[1]||d.getUTCDate()!==parts[2]||d.getUTCHours()!==parts[3]||d.getUTCMinutes()!==parts[4]||d.getUTCSeconds()!==parts[5])throw Error('Out-of-range certificate time');
 return d.toISOString();
}
function positive(n){const b=expect(n,2).bytes;if(b[0]&128)throw Error('Negative integer');let v=0n;for(const x of b)v=(v<<8n)|BigInt(x);return v;}
function algorithm(n){expect(n,16);if(n.children.length<1||n.children.length>2)throw Error('Invalid algorithm identifier');return oid(n.children[0]);}
const ekuNames={'1.3.6.1.5.5.7.3.1':'TLS Web Server Authentication','1.3.6.1.5.5.7.3.2':'TLS Web Client Authentication','1.3.6.1.5.5.7.3.3':'Code Signing','1.3.6.1.5.5.7.3.4':'Email Protection','1.3.6.1.5.5.7.3.8':'Time Stamping','1.3.6.1.5.5.7.3.9':'OCSP Signing','2.5.29.37.0':'Any Extended Key Usage'};
function ip(b){
 if(b.length===4)return Array.from(b).join('.');
 if(b.length!==16)throw Error('SAN IP must contain 4 or 16 bytes');
 const words=[];for(let i=0;i<16;i+=2)words.push((b[i]*256+b[i+1]).toString(16));
 let best=-1,len=1;for(let i=0;i<8;){if(words[i]!=='0'){i++;continue;}let j=i;while(j<8&&words[j]==='0')j++;if(j-i>len){best=i;len=j-i;}i=j;}
 return best<0?words.join(':'):words.slice(0,best).join(':')+'::'+words.slice(best+len).join(':');
}
function certificate(input){
 const tree=der(input);expect(tree,16);if(tree.children.length!==3)throw Error('Certificate must contain three fields');
 const [tbs,alg,sig]=tree.children;expect(tbs,16);algorithm(alg);expect(sig,3);if(sig.bytes[0]!==0||sig.bytes.length<2)throw Error('Invalid certificate signature bit string');
 const a=tbs.children;let i=0,version=1;
 if(a[i]?.cls===2&&a[i].tag===0){const v=a[i++];if(!v.constructed||v.children.length!==1)throw Error('Invalid version');version=Number(positive(v.children[0]))+1;if(version<2||version>3)throw Error('Invalid/default DER certificate version');}
 const serialNode=expect(a[i++],2),serialNumber=positive(serialNode);if(serialNumber===0n)throw Error('Certificate serial must be positive');
 const innerAlg=a[i++];const signatureAlgorithm=algorithm(innerAlg);if(!eq(innerAlg.encoded,alg.encoded))throw Error('Inner/outer signature algorithms differ');
 const issuer=name(a[i++]);const valid=expect(a[i++],16);if(valid.children.length!==2)throw Error('Invalid validity sequence');
 const notBefore=time(valid.children[0]),notAfter=time(valid.children[1]);if(notBefore>notAfter)throw Error('Reversed validity interval');
 const subject=name(a[i++]);const spki=expect(a[i++],16);if(spki.children.length!==2)throw Error('Invalid public key structure');
 const publicKeyAlgorithm=algorithm(spki.children[0]);expect(spki.children[1],3);
 if(spki.children[1].bytes.length<2)throw Error('Empty public key');
 const result={version,subject,issuer,serial:hex(serialNode.bytes).replace(/^00(?=..)/,''),notBefore,notAfter,signatureAlgorithm,publicKeyAlgorithm,san:[],keyUsage:[],extendedKeyUsage:[],basicConstraints:null,extensions:[],notes:[]};
 let last=0;
 while(i<a.length){const n=a[i++];if(n.cls!==2||n.tag<1||n.tag>3||n.tag<=last)throw Error('Unexpected/duplicate TBSCertificate field');last=n.tag;
  if(n.tag!==3){if(version===1||n.constructed||!n.bytes.length||n.bytes[0]>7||(n.bytes.length===1&&n.bytes[0]!==0)||(n.bytes.length>1&&n.bytes[0]&&(n.bytes[n.bytes.length-1]&((1<<n.bytes[0])-1))))throw Error('Invalid unique ID');result.notes.push('Issuer/subject unique ID not interpreted');continue;}
  if(version!==3||!n.constructed||n.children.length!==1)throw Error('Extensions require version 3');
  const exts=expect(n.children[0],16);if(!exts.children.length)throw Error('Empty extensions');const seen=new Set();
  for(const e of exts.children){
   expect(e,16);let p=0;const id=oid(e.children[p++]);if(seen.has(id))throw Error('Duplicate extension '+id);seen.add(id);let critical=false;
   if(e.children[p]?.tag===1&&e.children[p]?.cls===0){critical=e.children[p++].bytes[0]===255;if(!critical)throw Error('Default FALSE critical must be omitted in DER');}
   const octet=expect(e.children[p++],4);if(p!==e.children.length)throw Error('Unexpected extension fields');const v=der(octet.bytes);
   result.extensions.push({oid:id,critical,recognized:['2.5.29.17','2.5.29.15','2.5.29.37','2.5.29.19'].includes(id)});
   if(id==='2.5.29.17'){expect(v,16);if(!v.children.length)throw Error('Empty SAN');for(const g of v.children){if(g.cls!==2||g.tag>8)throw Error('Invalid GeneralName');
     if(g.tag===2){if(g.constructed||!g.bytes.length||g.bytes.some(x=>x>127))throw Error('Invalid SAN DNS encoding');result.san.push({type:'DNS',value:Array.from(g.bytes,x=>String.fromCharCode(x)).join('')});}
     else if(g.tag===7){if(g.constructed)throw Error('Invalid SAN IP encoding');result.san.push({type:'IP',value:ip(g.bytes)});}
     else result.notes.push('SAN GeneralName tag '+g.tag+' displayed only in extension inventory');
    }}
   else if(id==='2.5.29.15'){
    expect(v,3);const names=['digitalSignature','contentCommitment','keyEncipherment','dataEncipherment','keyAgreement','keyCertSign','cRLSign','encipherOnly','decipherOnly'];
    if(v.bytes.length>3||(v.bytes.length===3&&(v.bytes[2]&127)))throw Error('Invalid Key Usage bits');
    names.forEach((label,k)=>{if(v.bytes[1+(k>>>3)]&(128>>(k%8)))result.keyUsage.push(label);});
   }else if(id==='2.5.29.37'){expect(v,16);if(!v.children.length)throw Error('Empty EKU');result.extendedKeyUsage=v.children.map(n=>{const id=oid(n);return {oid:id,name:ekuNames[id]||id};});}
   else if(id==='2.5.29.19'){
    expect(v,16);let j=0,ca=false,pathLen=null;
    if(v.children[j]?.cls===0&&v.children[j]?.tag===1){ca=v.children[j++].bytes[0]===255;if(!ca)throw Error('Default FALSE CA flag must be omitted');}
    if(j<v.children.length){pathLen=positive(v.children[j++]).toString();if(!ca)throw Error('pathLen requires CA true');}
    if(j!==v.children.length)throw Error('Invalid Basic Constraints');result.basicConstraints={ca,pathLen};
   }else if(critical)result.notes.push('Unrecognized critical extension '+id+'; trust validation would need support');
  }
 }
 result.selfIssued=subject.canonical===issuer.canonical;
 result.notes.push('Names use approximate normalized RDN matching. No signature, trust, hostname or revocation validation.');
 return result;
}
function base64decode(s){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 if(!s.length||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Invalid PEM base64');
 const out=[];for(let i=0;i<s.length;i+=4){const vals=[...s.slice(i,i+4)].map(c=>c==='='?0:alphabet.indexOf(c));if(s[i+2]==='='&&(vals[1]&15)||s[i+3]==='='&&s[i+2]!=='='&&(vals[2]&3))throw Error('Noncanonical base64 padding');const n=(vals[0]<<18)|(vals[1]<<12)|(vals[2]<<6)|vals[3];out.push(n>>>16);if(s[i+2]!=='=')out.push((n>>>8)&255);if(s[i+3]!=='=')out.push(n&255);}
 return Uint8Array.from(out);
}
function inputs(input){
 if(typeof input!=='string'){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>MAX)throw Error('Certificate input too large');return [bytes];}
 if(input.length>1500000)throw Error('PEM input limit: 1,500,000 characters');
 const re=/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;let m,last=0;const out=[];
 while((m=re.exec(input))){if(input.slice(last,m.index).trim())throw Error('Only CERTIFICATE PEM blocks and whitespace are allowed');out.push(base64decode(m[1].replace(/\s/g,'')));last=re.lastIndex;if(out.length>16)throw Error('Chain limit: 16 certificates');}
 if(!out.length||input.slice(last).trim())throw Error('Expected complete CERTIFICATE PEM blocks');
 if(out.reduce((n,b)=>n+b.length,0)>MAX)throw Error('Decoded chain limit: 1,048,576 bytes');return out;
}
// SHA-256: original direct 32-bit implementation of the public algorithm.
function sha256(bytes){
 const K=Uint32Array.from([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
 const h=Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),total=Math.ceil((bytes.length+9)/64)*64,b=new Uint8Array(total);b.set(bytes);b[bytes.length]=128;let bits=BigInt(bytes.length)*8n;for(let i=0;i<8;i++){b[total-1-i]=Number(bits&255n);bits>>=8n;}
 const r=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
 for(let off=0;off<total;off+=64){for(let i=0;i<16;i++)w[i]=((b[off+i*4]<<24)|(b[off+i*4+1]<<16)|(b[off+i*4+2]<<8)|b[off+i*4+3])>>>0;
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))>>>0;}
  let [a,c,d,e,f,g,j,k]=h;
  for(let i=0;i<64;i++){const t1=(k+(r(f,6)^r(f,11)^r(f,25))+((f&g)^(~f&j))+K[i]+w[i])>>>0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&c)^(a&d)^(c&d)))>>>0;k=j;j=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0;}
  [a,c,d,e,f,g,j,k].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
 }return Array.from(h,x=>x.toString(16).padStart(8,'0')).join('').toUpperCase();
}
async function fingerprint(bytes,subtle=root.crypto?.subtle){if(subtle){try{return hex(new Uint8Array(await subtle.digest('SHA-256',bytes)));}catch{}}return sha256(bytes);}
function reference(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?Z$/.test(value))throw Error('Reference must be a UTC ISO date ending Z');
 const s=value.replace(/Z$/,value.length===17?':00.000Z':value.includes('.')?'Z':'.000Z');const d=new Date(s);
 if(!Number.isFinite(+d)||d.toISOString()!==s)throw Error('Invalid reference UTC date');return +d;
}
function validity(cert,utc){
 const now=reference(utc),start=Date.parse(cert.notBefore),end=Date.parse(cert.notAfter),seconds=Math.trunc((end-now)/1000);
 return {status:now<start?'not-yet-valid':now>end?'expired':'valid-at-reference',secondsUntilExpiry:seconds,daysUntilExpiry:Number(((end-now)/86400000).toFixed(3))};
}
function chain(certs){
 if(!Array.isArray(certs)||!certs.length||certs.length>16)throw Error('Chain must contain 1–16 certificates');
 const issues=[],add=(code,message)=>issues.push({code,message});
 for(let i=0;i<certs.length;i++){
  const c=certs[i];if(certs.slice(0,i).some(p=>p.fingerprint===c.fingerprint&&c.fingerprint))add('DUPLICATE','Duplicate certificate at position '+(i+1));
  if(i<certs.length-1){const issuer=certs[i+1];
   if(c.selfIssued)add('SELF_ISSUED_NOT_LAST','Self-issued certificate before end at position '+(i+1));
   if(c.issuer.canonical!==issuer.subject.canonical)add('ORDER_MISMATCH','Position '+(i+1)+' issuer does not match position '+(i+2)+' subject; expected leaf → issuer → root');
   if(!issuer.basicConstraints?.ca)add('ISSUER_NOT_CA','Position '+(i+2)+' is missing CA=true');
   if(issuer.extensions.some(e=>e.oid==='2.5.29.15')&&!issuer.keyUsage.includes('keyCertSign'))add('ISSUER_KEY_USAGE','Position '+(i+2)+' Key Usage lacks keyCertSign');
   const subordinateCAs=certs.slice(0,i+1).filter(x=>x.basicConstraints?.ca&&!x.selfIssued).length;
   if(issuer.basicConstraints?.pathLen!==null&&issuer.basicConstraints?.pathLen!==undefined&&BigInt(subordinateCAs)>BigInt(issuer.basicConstraints.pathLen))add('PATH_LENGTH','Position '+(i+2)+' pathLen is less than supplied subordinate CA count');
  }else if(!c.selfIssued)add('INCOMPLETE_CHAIN','Last certificate is not self-issued; issuer may be missing');
 }
 return {convention:'leaf → issuer → root',issues,notice:'Structural/name-order hints only; no cryptographic signature, trust-store, hostname, revocation or policy validation. Self-issued does not prove self-signed.'};
}
async function inspect(input,utc){
 reference(utc);const raw=inputs(input),certs=[];for(const bytes of raw){const cert=certificate(bytes);cert.fingerprint=await fingerprint(bytes);cert.validity=validity(cert,utc);certs.push(cert);}return {referenceUTC:utc,certificates:certs,chain:chain(certs)};
}
const api={der,oid,string,name,time,certificate,inputs,sha256,fingerprint,validity,chain,inspect,reference,ip,hex};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CertInspect=api;
})(globalThis);
