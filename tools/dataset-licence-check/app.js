'use strict';
const PRESETS=[
  {
    "name": "Declared MIT ancestry",
    "graph": {
      "root": "model",
      "targetLicense": "MIT",
      "acceptedObligations": [
        "notice"
      ],
      "now": 1000000,
      "maxAgeMs": 86400000,
      "nodes": [
        {
          "id": "model",
          "type": "model",
          "license": "MIT",
          "parents": [
            "data"
          ],
          "reviewedAt": 1000000
        },
        {
          "id": "data",
          "type": "dataset",
          "license": "MIT",
          "parents": [],
          "reviewedAt": 1000000
        }
      ]
    }
  },
  {
    "name": "Transitive noncommercial taint",
    "graph": {
      "root": "model",
      "targetLicense": "MIT",
      "acceptedObligations": [
        "notice"
      ],
      "now": 1000000,
      "maxAgeMs": 86400000,
      "nodes": [
        {
          "id": "model",
          "type": "model",
          "license": "MIT",
          "parents": [
            "middle"
          ],
          "reviewedAt": 1000000
        },
        {
          "id": "middle",
          "type": "model",
          "license": "MIT",
          "parents": [
            "data"
          ],
          "reviewedAt": 1000000
        },
        {
          "id": "data",
          "type": "dataset",
          "license": "CC-BY-NC-4.0",
          "parents": [],
          "reviewedAt": 1000000
        }
      ]
    }
  },
  {
    "name": "Dependency cycle",
    "graph": {
      "root": "model",
      "targetLicense": "MIT",
      "acceptedObligations": [
        "notice"
      ],
      "now": 1000000,
      "maxAgeMs": 86400000,
      "nodes": [
        {
          "id": "model",
          "type": "model",
          "license": "MIT",
          "parents": [
            "data"
          ],
          "reviewedAt": 1000000
        },
        {
          "id": "data",
          "type": "model",
          "license": "MIT",
          "parents": [
            "model"
          ],
          "reviewedAt": 1000000
        }
      ]
    }
  },
  {
    "name": "Missing licence",
    "graph": {
      "root": "model",
      "targetLicense": "MIT",
      "acceptedObligations": [
        "notice"
      ],
      "now": 1000000,
      "maxAgeMs": 86400000,
      "nodes": [
        {
          "id": "model",
          "type": "dataset",
          "license": "UNKNOWN",
          "parents": [],
          "reviewedAt": 1000000
        }
      ]
    }
  }
];
const byId=id=>document.getElementById(id);
const output=byId('result'), status=byId('status');
function clearResult() {output.textContent='';output.hidden=true;}
function show(value) {output.textContent=JSON.stringify(value,null,2);output.hidden=false;}
function read(id) {const text=byId(id).value;if (!text.trim()) throw Error('Missing '+id+' input.');if(text.length>100000) throw Error('Input exceeds 100000 characters; nothing was checked.');return JSON.parse(text);}
function load(p){byId('graph').value=JSON.stringify(p.graph,null,2);clearResult();status.textContent='Made-up example loaded. Click Check ancestry.';}
byId('run').addEventListener('click',()=>{clearResult();try{const value=DataLineage.analyse(read('graph'));show(value);status.textContent=value.allowed?'POLICY_CLEAR for declared root ancestry; unverified input, not legal clearance.':'BLOCKED: '+value.issues.map(i=>i.code).join(', ');}catch(e){status.textContent='BLOCKED: '+e.message;}});
byId('clear').addEventListener('click',()=>{byId('graph').value='';clearResult();status.textContent='Cleared; no saved history.';});
for(const p of PRESETS){const button=document.createElement('button');button.type='button';button.textContent='Made-up example: '+p.name;button.addEventListener('click',()=>load(p));byId('examples').appendChild(button);}
