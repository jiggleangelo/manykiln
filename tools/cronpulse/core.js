/* Original MIT implementation, copyright 2026 Manykiln. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CronPulse=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MINUTE=60000, DAY=86400000, MAX_DAYS=2928;
const ranges=[[0,59],[0,23],[1,31],[1,12],[0,7]];
const labels=['minute','hour','day of month','month','day of week'];
function integer(n,min,max,label){if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(label+' must be an integer '+min+'–'+max);return n;}
function parse(expression){
 if(typeof expression!=='string'||expression.length>256)throw Error('Cron must be a string of at most 256 characters');
 const tokens=expression.trim().split(/\s+/);if(tokens.length!==5)throw Error('Exactly five cron fields are required');
 const fields=tokens.map((token,i)=>{
  const [min,max]=ranges[i], values=new Set();
  for(const part of token.split(',')){
   const m=/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);if(!m)throw Error('Invalid '+labels[i]+' syntax');
   const body=m[1], step=m[2]===undefined?1:integer(Number(m[2]),1,max-min+1,'Step');
   if(m[2]!==undefined&&body!=='*'&&!body.includes('-'))throw Error('Steps require a wildcard or range');
   let lo,hi;if(body==='*'){lo=min;hi=max;}else{const pair=body.split('-');lo=Number(pair[0]);hi=pair.length===2?Number(pair[1]):lo;}
   integer(lo,min,max,labels[i]);integer(hi,min,max,labels[i]);if(lo>hi)throw Error('Descending ranges are not supported');
   for(let n=lo;n<=hi;n+=step)values.add(i===4&&n===7?0:n);
  }
  return {values:[...values].sort((a,b)=>a-b),wildcard:token==='*',raw:token};
 });
 return {expression:tokens.join(' '),fields};
}
function formatter(zone){if(typeof zone!=='string'||!zone||zone.length>100||!/^([A-Za-z][A-Za-z0-9_+.\-]*)(\/[A-Za-z0-9_+.\-]+)*$/.test(zone))throw Error('An IANA timezone is required');try{return new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw Error('Unknown IANA timezone');}}
function parts(ms,fmt){const p={};for(const x of fmt.formatToParts(ms))if(x.type!=='literal')p[x.type]=Number(x.value);return p;}
function wall(p){return Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0,p.second||0);}
function timestamp(input){if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(input))throw Error('Start must be an ISO timestamp with Z or numeric offset');const ms=Date.parse(input);if(!Number.isFinite(ms))throw Error('Invalid start timestamp');const time=input.slice(11,19).split(/[.:Z+\-]/);if(Number(time[0])>23||Number(time[1])>59||(time[2]!==undefined&&Number(time[2])>59))throw Error('Invalid clock fields');const offset=/([+-])(\d\d):(\d\d)$/.exec(input);if(offset&&(Number(offset[2])>23||Number(offset[3])>59))throw Error('Invalid UTC offset');const date=input.slice(0,10), y=Number(date.slice(0,4)), m=Number(date.slice(5,7)), d=Number(date.slice(8,10));if(y<1970||y>2090||new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==date)throw Error('Invalid date; supported starts are 1970–2090');return ms;}
function dayMatches(c,d){const f=c.fields,dom=f[2].values.includes(d.getUTCDate()),dow=f[4].values.includes(d.getUTCDay());return f[3].values.includes(d.getUTCMonth()+1)&&(f[2].wildcard&&f[4].wildcard?true:f[2].wildcard?dow:f[4].wildcard?dom:dom||dow);}
function explain(expression){
 const c=parse(expression),f=c.fields;
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const pad=n=>String(n).padStart(2,'0');
 let clock;if(f[0].values.length===1&&f[1].values.length===1)clock='At '+pad(f[1].values[0])+':'+pad(f[0].values[0]);
 else clock=(f[0].wildcard?'Every minute':'At minutes '+f[0].values.join(', '))+(f[1].wildcard?' of every hour':' during hours '+f[1].values.map(pad).join(', '));
 const dom='day of month '+f[2].values.join(', '),dow=f[4].values.map(n=>weekdays[n]).join(', ');
 const calendar=f[2].wildcard&&f[4].wildcard?'Every calendar day.':f[2].wildcard?'On '+dow+'.':f[4].wildcard?'On '+dom+'.':'On '+dom+' OR '+dow+'.';
 return clock+'. '+calendar+' '+(f[3].wildcard?'Every month.':'In '+f[3].values.map(n=>months[n-1]).join(', ')+'.')+' Evaluated as local wall time in the selected schedule timezone; DST gaps skipped and repeated times run twice.';
}
// Enumerate wall dates, then validate candidate instants against the host IANA database.
// Offsets surrounding each date discover both sides of ordinary and full-day DST changes.
function enumerate(expression,zone,after,{count=20,days=MAX_DAYS,end=null,limit=20000}={}){
 const c=parse(expression),fmt=formatter(zone),start=timestamp(after);integer(count,1,20000,'Run count');integer(days,1,MAX_DAYS,'Search days');integer(limit,1,20000,'Event limit');
 if(end!==null&&(!Number.isFinite(end)||end<=start))throw Error('Invalid window end');
 const local=parts(start,fmt),first=Date.UTC(local.year,local.month-1,local.day),runs=[];
 for(let index=0;index<days;index++){
  const dateMs=first+index*DAY,d=new Date(dateMs);if(end!==null&&dateMs>end+2*DAY)break;if(!dayMatches(c,d))continue;
  const offsets=new Set();for(let h=-36;h<=36;h+=6){const t=dateMs+h*3600000;offsets.add(wall(parts(t,fmt))-t);}
  const candidates=[];
  for(const h of c.fields[1].values)for(const m of c.fields[0].values){const target=dateMs+h*3600000+m*MINUTE;for(const offset of offsets){const t=target-offset;if(t<=start||end!==null&&t>=end)continue;const p=parts(t,fmt);if(wall(p)===target)candidates.push(t);}}
  candidates.sort((a,b)=>a-b);for(const t of new Set(candidates)){runs.push(t);if(runs.length>limit)throw Error('Event limit exceeded; narrow the collision window or schedule density');if(end===null&&runs.length>=count)return {runs,complete:true,searchedDays:index+1};}
 }
 return {runs,complete:end!==null?true:runs.length>=count,searchedDays:days};
}
function nextRuns(expression,zone,after,count=20,days=MAX_DAYS){integer(count,1,200,'Run count');return enumerate(expression,zone,after,{count,days});}
function display(ms,zone){const p=parts(ms,formatter(zone));return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')} ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}:${String(p.second).padStart(2,'0')} [${zone}]`;}
function rows(runs,zone){formatter(zone);return runs.map(t=>({utc:new Date(t).toISOString(),kualaLumpur:display(t,'Asia/Kuala_Lumpur'),selected:display(t,zone)}));}
function collisions(a,b,zone,after,{windowDays=7,durationA=1,durationB=1}={}){
 integer(windowDays,1,366,'Collision window days');integer(durationA,1,10080,'Duration A minutes');integer(durationB,1,10080,'Duration B minutes');
 const start=timestamp(after),end=start+windowDays*DAY,lookback=Math.max(durationA,durationB)*MINUTE;
 const searchStart=new Date(start-lookback-MINUTE).toISOString();
 const args={days:windowDays+Math.ceil(lookback/DAY)+4,end,limit:20000};
 const aa=enumerate(a,zone,searchStart,args).runs,bb=enumerate(b,zone,searchStart,args).runs;
 let j=0;const overlaps=[];
 for(const t of aa){const stop=t+durationA*MINUTE;if(stop<=start)continue;while(j<bb.length&&bb[j]+durationB*MINUTE<=t)j++;
  for(let k=j;k<bb.length&&bb[k]<stop;k++){const u=bb[k],overlapStart=Math.max(t,u,start),overlapEnd=Math.min(stop,u+durationB*MINUTE,end);if(overlapStart>=overlapEnd)continue;if(overlaps.length>=2000)throw Error('Overlap limit exceeded; narrow the window');overlaps.push({a:new Date(t).toISOString(),b:new Date(u).toISOString(),sameStart:t===u,start:new Date(overlapStart).toISOString(),end:new Date(overlapEnd).toISOString()});}
 }
 return {windowStart:new Date(start).toISOString(),windowEnd:new Date(end).toISOString(),intervalRule:'Half-open [start, start + duration); no claim outside this window',runsA:aa.length,runsB:bb.length,overlaps};
}
return {parse,explain,timestamp,nextRuns,rows,collisions};
});
