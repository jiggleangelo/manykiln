'use strict';
const $=id=>document.getElementById(id);
$('theme').addEventListener('change',()=>{const v=$('theme').value;if(v==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=v;});
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function download(text,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const LIMIT=16*1024*1024;
let epoch=0,manifestEpoch=0,last=null,lastAlgorithm='',lastFormat='';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function invalidateDigest(){
  epoch++;last=null;$('digest-output').value='';$('comparison').textContent='';$('compare').disabled=true;$('digest-download').disabled=true;status('Input changed. Compute a new digest.');
}
for(const id of ['text','key','expected'])$(id).addEventListener('input',()=>{if(id==='expected')$('comparison').textContent='';else invalidateDigest();});
for(const id of ['algorithm','format','source-kind','encoding','key-encoding','digest-file'])$(id).addEventListener('change',invalidateDigest);
function inputBytes(text,encoding){
  if(text.length>LIMIT)throw new Error('Text limit is 16 MiB');
  if(encoding==='hex')return HashKit.unhex(text);
  // Reject ill-formed UTF-16 instead of silently replacing user input.
  for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const m=text.charCodeAt(++i);if(!(m>=0xdc00&&m<=0xdfff))throw new Error('Invalid Unicode input');}else if(n>=0xdc00&&n<=0xdfff)throw new Error('Invalid Unicode input');}
  const bytes=new TextEncoder().encode(text);if(bytes.length>LIMIT)throw new Error('UTF-8 byte limit is 16 MiB');return bytes;
}
async function hashFile(file,algorithm,key,alive){
  if(file.size>LIMIT)throw new Error('File limit is 16 MiB');
  const h=HashKit.engine(algorithm,key);
  for(let at=0;at<file.size;at+=65536){
    if(!alive())throw new Error('Cancelled stale work');
    h.update(new Uint8Array(await file.slice(at,at+65536).arrayBuffer()));await pause();
  }
  if(!alive())throw new Error('Cancelled stale work');return h.digest();
}
$('digest').addEventListener('click',async()=>{
  invalidateDigest();const token=epoch,algorithm=$('algorithm').value,format=$('format').value;status('Computing locally…');
  let key;
  try{
    if(format==='sri'&&!['sha256','sha384','sha512'].includes(algorithm))throw new Error('SRI requires an unkeyed SHA digest');
    key=algorithm==='hmac-sha256'?inputBytes($('key').value,$('key-encoding').value):undefined;
    let data;
    if($('source-kind').value==='file'){
      const f=$('digest-file').files[0];if(!f)throw new Error('Select a local file');
      data=await hashFile(f,algorithm,key,()=>epoch===token);
    }else{
      const bytes=inputBytes($('text').value,$('encoding').value),h=HashKit.engine(algorithm,key);
      for(let at=0;at<bytes.length;at+=65536){if(epoch!==token)return;h.update(bytes.subarray(at,at+65536));await pause();}
      data=h.digest();
    }
    if(epoch!==token)return;last=data;lastAlgorithm=algorithm;lastFormat=format;
    $('digest-output').value=HashKit.format(data,format,algorithm);$('compare').disabled=false;$('digest-download').disabled=false;status('Digest ready. Pure JavaScript; no Web Crypto required.');
  }catch(e){if(epoch===token){last=null;status(e.message,true);}}finally{if(key)key.fill(0);}
});
$('compare').addEventListener('click',()=>{
  if(!last)return;try{const expected=HashKit.decode($('expected').value,lastFormat,lastAlgorithm),match=HashKit.equal(last,expected);$('comparison').textContent=match?'MATCH — digests are equal.':'MISMATCH — digests differ.';status(match?'Digest comparison: MATCH.':'Digest comparison: MISMATCH.',!match);}catch(e){$('comparison').textContent='';status(e.message,true);}
});
$('digest-download').addEventListener('click',()=>{if(last)download(HashKit.format(last,lastFormat,lastAlgorithm)+'\n','digest.txt');});
function invalidateManifest(){
  manifestEpoch++;$('verification').replaceChildren();$('manifest-download').disabled=true;status('Manifest input changed. Generate or verify.');
}
$('manifest').addEventListener('input',invalidateManifest);
$('manifest-files').addEventListener('change',()=>{
  invalidateManifest();$('file-summary').textContent=$('manifest-files').files.length+' local file(s) selected.';
});
async function fileEntries(token){
  const files=Array.from($('manifest-files').files);if(!files.length)throw new Error('Select files for the manifest');
  if(files.length>1000)throw new Error('Selection limit is 1,000 files');
  if(files.reduce((sum,f)=>sum+f.size,0)>64*1024*1024)throw new Error('Total file limit is 64 MiB');
  const seen=new Set(),entries=[];for(const file of files){
    if(seen.has(file.name))throw new Error('Duplicate selected filename');seen.add(file.name);
    const hash=await hashFile(file,'sha256',undefined,()=>manifestEpoch===token);
    entries.push({name:file.name,hash:HashKit.hex(hash)});
  }return entries;
}
$('generate').addEventListener('click',async()=>{
  invalidateManifest();const token=manifestEpoch;status('Generating SHA-256 manifest locally…');
  try{const entries=await fileEntries(token);if(token!==manifestEpoch)return;$('manifest').value=HashKit.manifest(entries);$('manifest-download').disabled=false;status('Manifest ready: '+entries.length+' files, sorted by exact filename.');}catch(e){if(token===manifestEpoch)status(e.message,true);}
});
$('verify').addEventListener('click',async()=>{
  invalidateManifest();const token=manifestEpoch,text=$('manifest').value;status('Verifying SHA-256 manifest locally…');
  try{
    HashKit.parseManifest(text);const entries=await fileEntries(token);if(token!==manifestEpoch)return;
    const report=HashKit.verify(text,entries),table=document.createElement('table'),caption=document.createElement('caption');caption.textContent='Manifest verification';table.append(caption);
    const header=document.createElement('tr');for(const text of ['Filename','Status']){const th=document.createElement('th');th.scope='col';th.textContent=text;header.append(th);}table.append(header);
    for(const row of report.rows){const tr=document.createElement('tr');for(const text of [row.name,row.status]){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.lastChild.className=row.status==='OK'?'ok':'bad';table.append(tr);}
    $('verification').replaceChildren(table);$('manifest-download').disabled=false;status(report.ok?'Verified: every selected file matches.':'Verification failed: inspect missing, extra or mismatched entries.',!report.ok);
  }catch(e){if(token===manifestEpoch)status(e.message,true);}
});
$('manifest-download').addEventListener('click',()=>{if(!$('manifest-download').disabled)download($('manifest').value,'SHA256SUMS.txt');});
$('manifest-import').addEventListener('change',async()=>{
  invalidateManifest();const token=manifestEpoch,file=$('manifest-import').files[0];if(!file)return;
  try{if(file.size>4*1024*1024)throw new Error('Manifest limit is 4 MiB');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(token!==manifestEpoch)return;$('manifest').value=text;status('Manifest imported. Select matching files, then verify.');}catch(e){if(token===manifestEpoch)status(e.message,true);}
});
$('clear').addEventListener('click',()=>{
  for(const id of ['text','key','expected','digest-file','manifest-files','manifest','manifest-import'])$(id).value='';
  invalidateDigest();invalidateManifest();$('file-summary').textContent='No files selected.';status('Inputs and results cleared. Browser memory erasure is not guaranteed.');
});
