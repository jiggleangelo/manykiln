/* Original MIT, 2026 Manykiln. No network/storage APIs. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);let exported=null;
 function invalidate(message='Inputs changed. Run the simulation again.'){exported=null;$('export').disabled=true;$('output').hidden=true;$('result').textContent='';$('run-rows').replaceChildren();$('collisions').textContent='';$('explanation').textContent='';$('collision-summary').textContent='';$('status').className='';$('status').textContent=message;}
 function number(id){const value=$(id).value;if(!/^\d+$/.test(value))throw Error('Enter an integer for '+id);return Number(value);}
 function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);}
 document.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>invalidate()));
 $('run').addEventListener('click',()=>{
  invalidate('Computing…');try{
   const a=$('cron-a').value,b=$('cron-b').value,zone=$('zone').value,after=$('after').value,count=number('count');
   const runA=CronPulse.nextRuns(a,zone,after,count),runB=CronPulse.nextRuns(b,zone,after,count);
   const overlaps=CronPulse.collisions(a,b,zone,after,{windowDays:number('window'),durationA:number('duration-a'),durationB:number('duration-b')});
   const result={tool:'cronpulse',version:1,input:{a,b,zone,after,count,windowDays:number('window'),durationA:number('duration-a'),durationB:number('duration-b')},explanations:{a:CronPulse.explain(a),b:CronPulse.explain(b)},nextA:{...runA,runs:CronPulse.rows(runA.runs,zone)},nextB:{...runB,runs:CronPulse.rows(runB.runs,zone)},collisions:overlaps};
   $('explanation').textContent='A: '+result.explanations.a+' B: '+result.explanations.b;
   $('selected-heading').textContent=zone;
   for(const [name,group] of [['A',result.nextA],['B',result.nextB]])for(const r of group.runs){const tr=document.createElement('tr');for(const v of [name,r.utc,r.kualaLumpur,r.selected])cell(tr,v);$('run-rows').append(tr);}
   $('collision-summary').textContent=overlaps.overlaps.length+' overlapping execution pairs in ['+overlaps.windowStart+', '+overlaps.windowEnd+'). '+overlaps.runsA+' A starts; '+overlaps.runsB+' B starts (includes lookback). No claim outside this window.';
   $('collisions').textContent=overlaps.overlaps.length?JSON.stringify(overlaps.overlaps,null,2):'No overlap found in the inspected window.';
   $('result').textContent=JSON.stringify(result,null,2);exported=result;$('output').hidden=false;$('export').disabled=false;
   $('status').textContent=runA.complete&&runB.complete?'VALID — schedules evaluated; overlap check complete for the stated window.':'INCOMPLETE — fewer than requested next runs within 2,928 local dates; overlap window still fully checked.';
  }catch(error){invalidate('BLOCKED: '+error.message);$('status').className='error';}
 });
 $('clear').addEventListener('click',()=>{document.querySelectorAll('input').forEach(x=>x.value='');invalidate('Cleared. Enter both schedules and settings to begin.');});
 function example(a,b,zone,after,count,days,da,db){for(const [id,value] of Object.entries({'cron-a':a,'cron-b':b,zone,after,count,window:days,'duration-a':da,'duration-b':db}))$(id).value=value;invalidate('Made-up example loaded. Simulate to inspect.');}
 $('example-dst').addEventListener('click',()=>example('30 1 * * *','45 1 * * *','America/New_York','2026-11-01T00:00:00Z',4,1,30,15));
 $('example-leap').addEventListener('click',()=>example('0 0 29 2 *','0 0 1 3 *','UTC','2026-01-01T00:00:00Z',1,60,1,1));
 $('export').addEventListener('click',()=>{if(!exported)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cronpulse-simulation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
})();
