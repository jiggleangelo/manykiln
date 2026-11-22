'use strict';
const $=id=>document.getElementById(id);
$('theme').addEventListener('change',()=>{const v=$('theme').value;if(v==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=v;});
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function download(text,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

let serial=0,result='',filename='result.json';
function invalidate(){serial++;result='';$('output').value='';$('download').disabled=true;status('Input changed. Convert to validate.');}
for(const id of ['source','direction','typed'])$(id).addEventListener(id==='source'?'input':'change',invalidate);
function run(lint=false){
  invalidate();try{
    const source=$('source').value,typed=$('typed').checked;
    if($('direction').value==='toml'){
      const parsed=TomlKit.parse(source);
      if(lint){status('Valid TOML 1.0 syntax.');return;}
      result=TomlKit.canonical(parsed,typed);filename='result.json';
      status(typed?'Converted. Lossless TOML types preserved.':'Converted. Dates are JSON strings; use lossless mode to preserve TOML types.');
    }else{
      const converted=TomlKit.fromJSON(source,typed);TomlKit.parse(converted);
      if(lint){status('Valid JSON and representable as TOML.');return;}
      result=converted;filename='result.toml';status('Converted to valid TOML. Object keys are sorted.');
    }
    $('output').value=result;$('download').disabled=false;
  }catch(e){result='';$('output').value='';$('download').disabled=true;status(e.message,true);}
}
$('convert').addEventListener('click',()=>run());
$('lint').addEventListener('click',()=>run(true));
$('source').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}});
$('download').addEventListener('click',()=>{if(result)download(result,filename);});
$('clear').addEventListener('click',()=>{$('source').value='';$('file').value='';invalidate();});
$('example').addEventListener('click',()=>{
  $('direction').value='toml';$('source').value='# A fictional offline project\nname = "ManyKiln"\nreleased = 2026-11-21T09:00:00Z\n[build]\nready = true\nversions = [1, 2, 3]\nmetadata = { license = "MIT", offline = true }\n[[tools]]\nname = "toml2json"\n[[tools]]\nname = "hashmac"\n';invalidate();run();
});
$('file').addEventListener('change',async()=>{
  invalidate();const token=serial,f=$('file').files[0];if(!f)return;
  try{if(f.size>2*1024*1024)throw new Error('File limit is 2 MiB');const buf=await f.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:true}).decode(buf);if(token!==serial)return;$('source').value=text;status('Imported local file. Convert to validate.');}catch(e){if(token===serial)status(e.message,true);}
});
