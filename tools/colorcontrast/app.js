(()=>{'use strict';const $=id=>document.getElementById(id),C=globalThis.ToolCore;let report=null;
const notify=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('error',error);};
function invalidate(){report=null;$('results').hidden=true;for(const id of ['ratio','apca','grades','matrix','tokens'])$(id).replaceChildren();$('preview').removeAttribute('style');notify('Inputs changed. Check contrast to update.');}
function build(){invalidate();try{
 const pair=C.compare($('fg').value,$('bg').value),colors=C.parsePalette($('palette').value),mode=$('vision').value;report={version:1,...pair,palette:colors,matrix:C.matrix(colors),simulation:mode,tokens:C.tokens(colors)};
 $('ratio').textContent=pair.ratio.toFixed(3)+':1';$('apca').textContent=pair.apca.toFixed(2);
 const labels={aaNormal:'AA normal',aaaNormal:'AAA normal',aaLarge:'AA large',aaaLarge:'AAA large',nonText:'Non-text'};
 $('grades').textContent=Object.entries(pair.wcag).map(([k,v])=>`${labels[k]}: ${v?'PASS':'FAIL'}`).join(' · ');
 $('preview').style.color=C.simulate(pair.foreground,mode).css;$('preview').style.backgroundColor=C.simulate(pair.background,mode).css;
 const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
 for(const label of ['Text ↓ / background →',...colors.map((c,i)=>`${i+1} ${c.hex}`)]){const th=document.createElement('th');th.textContent=label;th.scope='col';tr.append(th);}head.append(tr);table.append(head);
 const body=document.createElement('tbody');colors.forEach((c,i)=>{const row=document.createElement('tr'),th=document.createElement('th'),swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor=C.simulate(c,mode).css;th.append(swatch,document.createTextNode(`${i+1} ${c.hex}`));th.scope='row';row.append(th);report.matrix[i].forEach(cell=>{const td=document.createElement('td');td.textContent=`${cell.ratio.toFixed(3)}:1 · ${cell.ratio>=4.5?'AA pass':'AA fail'} · Lc ${cell.apca.toFixed(1)}`;row.append(td);});body.append(row);});table.append(body);$('matrix').append(table);
 $('tokens').textContent=report.tokens;$('results').hidden=false;notify('Contrast checked. Ratios use the original opaque sRGB colors.');
 }catch(e){report=null;notify(e.message,true);}}
function download(kind){if(!report)return;const url=URL.createObjectURL(new Blob([kind==='css'?report.tokens:JSON.stringify(report,null,2)],{type:kind==='css'?'text/css;charset=utf-8':'application/json'})),a=document.createElement('a');a.href=url;a.download=kind==='css'?'tokens.css':'contrast-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(`${kind.toUpperCase()} export prepared.`);}
for(const id of ['fg','bg','palette','vision']){$(id).addEventListener('input',invalidate);$(id).addEventListener('change',invalidate);}
$('check').addEventListener('click',build);$('swap').addEventListener('click',()=>{const fg=$('fg').value;$('fg').value=$('bg').value;$('bg').value=fg;build();});
$('example').addEventListener('click',()=>{$('fg').value='#17283d';$('bg').value='#ffffff';$('palette').value='#17283d\n#ffffff\n#08624f\n#f5bc63';$('vision').value='normal';build();});
$('clear').addEventListener('click',()=>{for(const id of ['fg','bg','palette'])$(id).value='';invalidate();notify('Cleared.');$('fg').focus();});
$('css').addEventListener('click',()=>download('css'));$('json').addEventListener('click',()=>download('json'));$('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';});
})();
