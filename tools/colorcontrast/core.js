(function(root){
'use strict';
// Original offline color math implementation, MIT. Opaque sRGB only.
const clamp=x=>Math.max(0,Math.min(1,x));
const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
function number(s){if(!NUMBER.test(s)||!Number.isFinite(Number(s)))throw Error('Invalid numeric component.');return Number(s);}
function bounded(n,a,b){if(n<a||n>b)throw Error(`Component outside ${a}–${b}.`);return n;}
function hex(rgb){return '#'+rgb.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');}
function parseColor(raw){
 if(typeof raw!=='string'||raw.length>160)throw Error('Color must be at most 160 characters.');const s=raw.trim().toLowerCase();let rgb;
 if(/^#[\da-f]{3}$/.test(s))rgb=[...s.slice(1)].map(x=>parseInt(x+x,16));
 else if(/^#[\da-f]{6}$/.test(s))rgb=[0,2,4].map(i=>parseInt(s.slice(i+1,i+3),16));
 else {
  const match=/^(rgb|hsl)\(([^()]*)\)$/.exec(s);if(!match)throw Error('Use opaque #RGB, #RRGGBB, rgb() or hsl().');
  const body=match[2].trim(),parts=body.includes(',')?body.split(',').map(x=>x.trim()):body.split(/\s+/);if(parts.length!==3||parts.some(x=>!x))throw Error('Exactly three opaque components required.');
  if(match[1]==='rgb'){
   const percent=parts[0].endsWith('%');if(parts.some(x=>x.endsWith('%')!==percent))throw Error('RGB units must match.');
   rgb=parts.map(x=>percent?bounded(number(x.slice(0,-1)),0,100)*255/100:bounded(number(x),0,255));
  }else{
   const h=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|grad|rad|turn)?$/.exec(parts[0]);if(!h||!parts[1].endsWith('%')||!parts[2].endsWith('%'))throw Error('HSL requires hue and two percentages.');
   let hue=bounded(number(h[1]),-1e6,1e6)*({deg:1,grad:.9,rad:180/Math.PI,turn:360}[h[2]||'deg']);hue=((hue%360)+360)%360;
   const sat=bounded(number(parts[1].slice(0,-1)),0,100)/100,light=bounded(number(parts[2].slice(0,-1)),0,100)/100;
   const c=(1-Math.abs(2*light-1))*sat,x=c*(1-Math.abs((hue/60)%2-1)),m=light-c/2;
   const sectors=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];rgb=sectors[Math.floor(hue/60)].map(v=>(v+m)*255);
  }
 }
 // Preserve fractional sRGB for contrast; hex is a rounded display/representation.
 return {rgb,hex:hex(rgb),css:`rgb(${rgb.map(n=>Number(n.toFixed(6))).join(' ')})`};
}
function linear(c){const x=c/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
function luminance(color){return color.rgb.map(linear).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);}
function ratio(fg,bg){const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
function wcag(value){return {aaNormal:value>=4.5,aaaNormal:value>=7,aaLarge:value>=3,aaaLarge:value>=4.5,nonText:value>=3};}
// APCA candidate 0.0.98G equations; positive = dark text/light background.
// APCA is experimental, polarity sensitive, and not a WCAG 2.2 conformance test.
function apca(fg,bg){
 const y=c=>c.rgb.reduce((a,v,i)=>a+(v/255)**2.4*[.2126729,.7151522,.0721750][i],0);
 const soft=v=>v<.022?v+(.022-v)**1.414:v;
 const t=soft(y(fg)),b=soft(y(bg));if(Math.abs(b-t)<.0005)return 0;
 const raw=b>t?(b**.56-t**.57)*1.14:(b**.65-t**.62)*1.14;
 return b>t?(raw<.1?0:(raw-.027)*100):(raw>-.1?0:(raw+.027)*100);
}
function compare(foreground,background){const fg=parseColor(foreground),bg=parseColor(background),value=ratio(fg,bg);return {foreground:fg,background:bg,ratio:value,wcag:wcag(value),apca:apca(fg,bg)};}
function parsePalette(text){
 if(typeof text!=='string'||text.length>4096)throw Error('Palette exceeds 4096 characters.');const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length<2||lines.length>16)throw Error('Enter 2–16 colors, one per line.');
 return lines.map((line,i)=>{try{return parseColor(line);}catch(e){throw Error(`Palette line ${i+1}: ${e.message}`);}});
}
function matrix(colors){return colors.map(fg=>colors.map(bg=>({ratio:ratio(fg,bg),apca:apca(fg,bg)})));}
function tokens(colors){if(!Array.isArray(colors)||colors.length<2||colors.length>16)throw Error('Expected 2–16 parsed colors.');return ':root {\n'+colors.map((c,i)=>`  --color-${String(i+1).padStart(2,'0')}: ${c.css};`).join('\n')+'\n}\n';}
function simulate(color,type){
 if(!['normal','protanopia','deuteranopia','tritanopia'].includes(type))throw Error('Unknown vision mode.');
 if(type==='normal')return {...color,rgb:[...color.rgb]};
 const [r,g,b]=color.rgb.map(linear);
 // Linear sRGB -> cone-like LMS; project the missing response; invert.
 let l=.31399022*r+.63951294*g+.04649755*b,m=.15537241*r+.75789446*g+.08670142*b,s=.01775239*r+.10944209*g+.87256922*b;
 if(type==='protanopia')l=1.05118294*m-.05116099*s;
 if(type==='deuteranopia')m=.9513092*l+.04866992*s;
 if(type==='tritanopia')s=-.86744736*l+1.86727089*m;
 const channels=[5.47221206*l-4.6419601*m+.16963708*s,-1.1252419*l+2.29317094*m-.1678952*s,.02980165*l-.19318073*m+1.16364789*s];
 const rgb=channels.map(v=>{const c=clamp(v);return 255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055);});return {rgb,hex:hex(rgb),css:`rgb(${rgb.map(n=>n.toFixed(3)).join(' ')})`};
}

const api={parseColor,linear,luminance,ratio,wcag,apca,compare,parsePalette,matrix,tokens,simulate};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.ToolCore=Object.freeze(api);
})(globalThis);
