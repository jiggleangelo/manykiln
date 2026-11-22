/* Original MIT UI. Public cert bytes stay in memory. No persistence or requests. */
'use strict';
const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let result=null,importedDER=null,generation=0;
function invalidate(message='Inputs changed. Inspect again.'){generation++;result=null;$('results').hidden=true;$('json').disabled=true;$('status').textContent=message;}
function utcNow(){$('reference').value=new Date().toISOString().slice(0,19);}
utcNow();
function metric(value,label){const e=node('div',undefined,'metric');e.append(node('strong',value),node('span',label));return e;}
function field(dl,label,value){dl.append(node('dt',label),node('dd',value));}
function render(report){
 $('metrics').replaceChildren(metric(report.certificates.length,'certificates'),metric(report.chain.issues.length,'chain findings'),metric(report.certificates.filter(c=>c.validity.status==='expired').length,'expired at reference'));
 const chain=document.createDocumentFragment();chain.append(node('p',report.chain.notice,'hint'));
 if(!report.chain.issues.length)chain.append(node('p','No structural/name-order findings for this supplied chain. Trust remains unverified.'));
 for(const i of report.chain.issues){const row=node('div',undefined,'issue warning');row.append(node('strong',i.code),node('span',i.message));chain.append(row);}
 $('chain').replaceChildren(chain);
 const cards=document.createDocumentFragment();
 report.certificates.forEach((c,i)=>{const card=node('article',undefined,'panel cert-card');card.append(node('h3',(i+1)+' / '+c.subject.text),node('p',c.validity.status+' · '+c.validity.daysUntilExpiry+' days until expiry at '+report.referenceUTC,'badge'));
 const dl=node('dl');
 field(dl,'Subject',c.subject.text);field(dl,'Issuer',c.issuer.text);field(dl,'Version','v'+c.version);field(dl,'Serial (hex)',c.serial);
 field(dl,'Not Before (UTC)',c.notBefore);field(dl,'Not After (UTC)',c.notAfter);field(dl,'Expiry countdown',c.validity.secondsUntilExpiry+' seconds ('+c.validity.daysUntilExpiry+' days)');
 field(dl,'SHA-256 fingerprint',c.fingerprint.match(/.{2}/g).join(':'));
 field(dl,'Signature algorithm OID',c.signatureAlgorithm);field(dl,'Public key algorithm OID',c.publicKeyAlgorithm);
 field(dl,'Basic Constraints',c.basicConstraints?'CA='+c.basicConstraints.ca+(c.basicConstraints.pathLen!==null?' · pathLen='+c.basicConstraints.pathLen:''):'Not present (CA not established)');
 field(dl,'Key Usage',c.keyUsage.join(', ')||'Not present / no set bits');field(dl,'Extended Key Usage',c.extendedKeyUsage.map(x=>x.name+' ('+x.oid+')').join('; ')||'Not present');
 field(dl,'Subject Alternative Names',c.san.map(x=>x.type+': '+x.value).join('\n')||'No DNS/IP entries');
 field(dl,'Self-issued (name match)',c.selfIssued?'Yes · signature unverified':'No');
 card.append(dl);const details=node('details'),summary=node('summary','Extensions & interpretation notes');details.append(summary);
 for(const e of c.extensions)details.append(node('p',e.oid+(e.critical?' · critical':'')+(e.recognized?' · decoded':' · inventory only'),'hint'));
 for(const n of c.notes)details.append(node('p',n,'hint'));card.append(details);cards.append(card);
 });$('certificates').replaceChildren(cards);$('results').hidden=false;
}
$('run').onclick=async()=>{
 invalidate('Inspecting locally…');const ticket=generation;
 try{const input=importedDER||$('pem').value,reference=$('reference').value+'Z',report=await CertInspect.inspect(input,reference);if(ticket!==generation)return;result=report;render(report);$('json').disabled=false;$('status').textContent='Inspected '+report.certificates.length+' certificate(s). No trust verification performed.';}
 catch(e){if(ticket===generation)invalidate('Error: '+e.message);}
};
$('pem').oninput=()=>{importedDER=null;invalidate();};
$('reference').oninput=()=>invalidate();
$('now').onclick=()=>{utcNow();invalidate('Reference set to current UTC.');};
$('file').onchange=async()=>{
 const file=$('file').files[0];importedDER=null;invalidate('Reading local public certificate…');const ticket=generation;if(!file)return;
 try{if(file.size>1500000)throw Error('File limit: 1.5 MB');const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==generation)return;
  const text=new TextDecoder().decode(bytes);if(text.trimStart().startsWith('-----BEGIN')){$('pem').value=text;importedDER=null;}else{importedDER=bytes;$('pem').value='[Binary DER imported locally. Editing replaces the binary input.]';}
  invalidate('Local certificate imported. Inspect to continue.');
 }catch(e){if(ticket===generation)invalidate('Error: '+e.message);}finally{$('file').value='';}
};
$('sample').onclick=()=>{importedDER=null;$('pem').value=FictionalCertificatePEM;$('reference').value='2030-01-01T00:00:00';invalidate('Fictional self-signed demo loaded.');};
$('clear').onclick=()=>{importedDER=null;$('pem').value='';invalidate('Cleared.');};
$('json').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'})),a=node('a');a.href=url;a.download='certificate-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('theme').onchange=()=>{document.documentElement.dataset.theme=$('theme').value;};
