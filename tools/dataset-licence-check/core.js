/* Original MIT implementation: conservative declared-licence policy, not legal analysis. */
(function(root,factory) {
  'use strict'; const api=factory();
  if (typeof module === 'object' && module.exports) module.exports=api;
  else root.DataLineage=api;
}(typeof globalThis !== 'undefined' ? globalThis : this,function() {
  'use strict';
  const RULES=Object.freeze(Object.fromEntries(Object.entries({
    'CC0-1.0':[], 'MIT':['notice'], 'BSD-2-Clause':['notice'], 'BSD-3-Clause':['notice'],
    'Apache-2.0':['notice','apache-conditions'], 'CC-BY-4.0':['attribution'],
    'CC-BY-SA-4.0':['attribution','sharealike']
  }).map(([k,v]) => [k,Object.freeze(v)])));
  const MAX_CHARS=100000, MAX_NODES=200;
  const integer=x => Number.isSafeInteger(x) && x >= 0;
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw Error('Missing graph input.');
    if (text.length > MAX_CHARS) throw Error('Input exceeds 100000 characters; nothing was checked.');
    return JSON.parse(text);
  }
  function analyse(doc) {
    const issues=[];
    function issue(code,node,path,detail) { return {code,node,path,detail}; }
    const fail=detail => ({allowed:false, verdict:'BLOCKED', source:'unverified declared input; conservative policy', issues:[issue('INVALID_INPUT',null,[],detail)], nodes:[]});
    if (!doc || !Array.isArray(doc.nodes) || !doc.nodes.length || doc.nodes.length > MAX_NODES) return fail('Provide 1–200 nodes.');
    if (!integer(doc.now) || !integer(doc.maxAgeMs)) return fail('Missing or invalid as-of clock/freshness limit.');
    const accepted=doc.acceptedObligations;
    if (!Array.isArray(accepted) || accepted.some(x => !['notice','apache-conditions','attribution','sharealike'].includes(x))) return fail('Explicit acceptedObligations array required.');
    if (!Object.hasOwn(RULES,doc.targetLicense)) return fail('Target licence is not in the supported policy.');
    const map=new Map();
    for (const n of doc.nodes) {
      if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(n.id) || map.has(n.id) || !['dataset','model','artifact'].includes(n.type) || !Array.isArray(n.parents) || n.parents.length > MAX_NODES || n.parents.some(p => typeof p !== 'string') || new Set(n.parents).size !== n.parents.length) return fail('Malformed/duplicate node or missing explicit parents array.');
      map.set(n.id,n);
    }
    if (!map.has(doc.root)) return fail('Root is missing from nodes.');
    // Audit topology across every component, including disconnected cycles/missing edges.
    const colors=new Map(), cycles=[], missing=[];
    function topology(id,path) {
      if (!map.has(id)) { missing.push(issue('MISSING_PARENT',id,[...path,id],'Referenced node is absent.')); return; }
      if (colors.get(id)===1) { cycles.push(issue('CYCLE',id,[...path,id],'A dependency cycle blocks evaluation.')); return; }
      if (colors.get(id)===2) return;
      colors.set(id,1); for (const parent of map.get(id).parents) topology(parent,[...path,id]); colors.set(id,2);
    }
    for (const id of map.keys()) topology(id,[]);
    issues.push(...cycles,...missing);
    const memo=new Map();
    function walk(id,path,active) {
      if (!map.has(id) || active.has(id)) return [];
      if (memo.has(id)) return memo.get(id);
      const n=map.get(id), local=[];
      const add=(code,detail) => local.push(issue(code,id,[id],detail));
      if (!integer(n.reviewedAt) || n.reviewedAt > doc.now || doc.now-n.reviewedAt > doc.maxAgeMs) add('STALE_OR_MISSING_EVIDENCE','Review timestamp is missing, invalid, future or stale.');
      if (typeof n.license !== 'string' || !n.license.trim()) add('MISSING_LICENSE','No licence was declared.');
      else if (/\bNC\b|non[- ]?commercial/i.test(n.license)) add('NONCOMMERCIAL','Noncommercial declarations block commercial use under this policy.');
      else if (!Object.hasOwn(RULES,n.license)) add('UNKNOWN_LICENSE','Unsupported or UNKNOWN licence; review is required.');
      else {
        for (const obligation of RULES[n.license]) if (!accepted.includes(obligation)) add('UNACCEPTED_OBLIGATION','Required policy acknowledgement: '+obligation+'.');
        if (n.license==='CC-BY-SA-4.0' && doc.targetLicense!=='CC-BY-SA-4.0') add('INCOMPATIBLE_SHAREALIKE','This policy requires the same sharealike target.');
        if (n.license==='Apache-2.0' && !['Apache-2.0','CC-BY-SA-4.0'].includes(doc.targetLicense)) add('REVIEW_LICENSE_COMBINATION','This policy does not clear this Apache target combination.');
      }
      const next=new Set(active); next.add(id);
      for (const parent of n.parents) for (const inherited of walk(parent,[...path,id],next)) local.push({...inherited,path:[id,...inherited.path]});
      // Bound diamond expansion while retaining one explanatory path per issue/node.
      const unique=Array.from(new Map(local.map(i => [i.node+'|'+i.code+'|'+i.detail,i])).values());
      memo.set(id,unique); return unique;
    }
    const inherited=walk(doc.root,[],new Set()); issues.push(...inherited);
    const reachable=new Set();
    function mark(id) { if (reachable.has(id) || !map.has(id)) return; reachable.add(id); map.get(id).parents.forEach(mark); }
    mark(doc.root);
    return {allowed:issues.length===0, verdict:issues.length ? 'BLOCKED':'POLICY_CLEAR', source:'unverified declared input; conservative policy', root:doc.root, targetLicense:doc.targetLicense, issues,
      nodes:Array.from(map.values(),n => ({id:n.id,license:n.license ?? '(missing)',reachable:reachable.has(n.id),evaluated:reachable.has(n.id),tainted:reachable.has(n.id) ? walk(n.id,[],new Set()).length>0 : null})),
      note:'Only root ancestry receives licence checks. All components receive topology checks. POLICY_CLEAR is not legal clearance or proof of input authenticity.'};
  }
  return Object.freeze({RULES,MAX_CHARS,MAX_NODES,parse,analyse});
}));
