/* Original clean-room implementation. MIT License. Never executes a user RegExp. */
(function(root){'use strict';
const LIMITS=Object.freeze({pattern:1024,nodes:512,depth:24,input:2048,steps:200000,matches:200,repeat:1000});
function fail(s){throw new Error(s);}
class Parser {
 constructor(pattern){if(typeof pattern!=='string'||pattern.length>LIMITS.pattern)fail('Pattern must be text, at most 1024 UTF-16 units.');this.s=pattern;this.i=0;this.nodes=0;this.groups=0;this.names=Object.create(null);this.depth=0;}
 node(type,fields={}){if(++this.nodes>LIMITS.nodes)fail('Pattern exceeds 512 AST nodes.');return {type,...fields};}
 parse(){const ast=this.alt();if(this.i!==this.s.length)fail('Unexpected ) at '+this.i+'.');return {ast,groups:this.groups,names:this.names};}
 alt(){if(++this.depth>LIMITS.depth)fail('Pattern nesting exceeds 24.');const branches=[this.seq()];while(this.s[this.i]==='|'){this.i++;branches.push(this.seq());}this.depth--;return branches.length===1?branches[0]:this.node('alt',{branches});}
 seq(){const items=[];while(this.i<this.s.length&&![')', '|'].includes(this.s[this.i]))items.push(this.term());return this.node('seq',{items});}
 term(){let atom=this.atom(),c=this.s[this.i],min,max;
  if(c==='*'||c==='+'||c==='?'){this.i++;min=c==='+'?1:0;max=c==='?'?1:Infinity;}
  else if(c==='{'){
   const rest=this.s.slice(this.i),m=/^\{(\d+)(?:,(\d*))?\}/.exec(rest);if(!m)fail('Malformed repetition at '+this.i+'.');
   this.i+=m[0].length;min=Number(m[1]);max=m[2]===undefined?min:m[2]===''?Infinity:Number(m[2]);
   if(min>LIMITS.repeat||max!==Infinity&&max>LIMITS.repeat||min>max)fail('Repetition bounds invalid or above 1000.');
  }
  if(min!==undefined){if(['anchor','boundary'].includes(atom.type))fail('Cannot repeat an assertion.');let greedy=true;if(this.s[this.i]==='?'){this.i++;greedy=false;}atom=this.node('repeat',{child:atom,min,max,greedy});}
  return atom;
 }
 atom(){const c=this.s[this.i++];
  if(['*','+','?','{','}'].includes(c))fail('Unexpected quantifier at '+(this.i-1)+'.');
  if(c==='('){let id=null,name=null;
   if(this.s[this.i]==='?'){
    this.i++;if(this.s[this.i]===':')this.i++;
    else if(this.s[this.i]==='<'&&!['=','!'].includes(this.s[this.i+1])){
     this.i++;const end=this.s.indexOf('>',this.i);if(end<0)fail('Unclosed named group.');name=this.s.slice(this.i,end);if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)||Object.hasOwn(this.names,name))fail('Invalid or duplicate group name.');this.i=end+1;id=++this.groups;this.names[name]=id;
    }else fail('Lookarounds and inline modifiers are unsupported; no pattern was executed.');
   }else id=++this.groups;
   const child=this.alt();if(this.s[this.i++]!==')')fail('Unclosed group.');return this.node('group',{child,id,name});
  }
  if(c==='[')return this.charClass();if(c==='\\')return this.escape(false);
  if(c==='.')return this.node('dot');if(c==='^'||c==='$')return this.node('anchor',{kind:c});
  return this.node('literal',{value:c});
 }
 escape(inClass){const c=this.s[this.i++];if(c===undefined)fail('Trailing backslash.');
  if(/[1-9]/.test(c)||c==='k')fail('Backreferences are unsupported; no pattern was executed.');
  if('dDwWsS'.includes(c))return this.node('category',{kind:c});
  if(!inClass&&(c==='b'||c==='B'))return this.node('boundary',{negate:c==='B'});
  const map={n:'\n',r:'\r',t:'\t',f:'\f',v:'\v',b:'\b',0:'\0'};
  if(Object.hasOwn(map,c)){if(c==='0'&&/\d/.test(this.s[this.i]||''))fail('Octal escapes unsupported.');return this.node('literal',{value:map[c]});}
  if(c==='x'||c==='u'){const count=c==='x'?2:4,h=this.s.slice(this.i,this.i+count);if(h.length!==count||!/^[0-9A-Fa-f]+$/.test(h))fail('Malformed hex escape.');this.i+=count;return this.node('literal',{value:String.fromCharCode(parseInt(h,16))});}
  if(/[A-Za-z0-9]/.test(c))fail('Unsupported escape: \\'+c);return this.node('literal',{value:c});
 }
 charClass(){let negate=false;if(this.s[this.i]==='^'){negate=true;this.i++;}const parts=[];
  while(this.i<this.s.length&&this.s[this.i]!==']'){
   let a=this.s[this.i++];a=a==='\\'?this.escape(true):this.node('literal',{value:a});
   if(this.s[this.i]==='-'&&this.s[this.i+1]!==']'&&this.i+1<this.s.length){
    this.i++;let b=this.s[this.i++];b=b==='\\'?this.escape(true):this.node('literal',{value:b});
    if(a.type!=='literal'||b.type!=='literal'||a.value.charCodeAt(0)>b.value.charCodeAt(0))fail('Invalid character range.');parts.push({type:'range',from:a.value.charCodeAt(0),to:b.value.charCodeAt(0)});
   }else parts.push(a);
  }
  if(this.s[this.i++]!==']')fail('Unclosed character class.');return this.node('class',{parts,negate});
 }
}
const fold=c=>c>='A'&&c<='Z'?c.toLowerCase():c;
const line=c=>c==='\r'||c==='\n'||c==='\u2028'||c==='\u2029';
const word=c=>c!==undefined&&/[A-Za-z0-9_]/.test(c);
function charTest(node,c,flags){if(c===undefined)return false;
 if(node.type==='literal')return flags.includes('i')?fold(c)===fold(node.value):c===node.value;
 if(node.type==='dot')return flags.includes('s')||!line(c);
 if(node.type==='range'){const n=c.charCodeAt(0);return n>=node.from&&n<=node.to||flags.includes('i')&&((n>=65&&n<=90&&n+32>=node.from&&n+32<=node.to)||(n>=97&&n<=122&&n-32>=node.from&&n-32<=node.to));}
 if(node.type==='category'){let yes;switch(node.kind.toLowerCase()){case 'd':yes=c>='0'&&c<='9';break;case 'w':yes=word(c);break;case 's':yes=/[\s\uFEFF]/.test(c);break;}return node.kind===node.kind.toUpperCase()?!yes:yes;}
 if(node.type==='class'){const yes=node.parts.some(p=>charTest(p,c,flags));return node.negate?!yes:yes;}
 return false;
}
function nullable(n){switch(n.type){case 'seq':return n.items.every(nullable);case 'alt':return n.branches.some(nullable);case 'repeat':return n.min===0||nullable(n.child);case 'group':return nullable(n.child);case 'anchor':case 'boundary':return true;default:return false;}}
function first(n){switch(n.type){case 'seq':{let a=[];for(const x of n.items){a=a.concat(first(x));if(!nullable(x))break;}return a;}case 'alt':return n.branches.flatMap(first);case 'group':return first(n.child);case 'repeat':return n.max===0?[]:first(n.child);case 'anchor':case 'boundary':return [];default:return [n];}}
function overlap(a,b,flags){
 const aa=first(a),bb=first(b);if(nullable(a)&&nullable(b))return true;
 // Exact for ASCII witnesses, conservative for any possible non-ASCII intersection.
 for(let i=0;i<128;i++){const c=String.fromCharCode(i);if(aa.some(n=>charTest(n,c,flags))&&bb.some(n=>charTest(n,c,flags)))return true;}
 const broad=n=>!['literal','range'].includes(n.type)||n.type==='literal'&&n.value.charCodeAt(0)>127||n.type==='range'&&n.to>127;
 return aa.some(broad)&&bb.some(broad);
}
function analyze(pattern,flags=''){
 if(typeof flags!=='string'||!/^[ims]*$/.test(flags)||new Set(flags).size!==flags.length)fail('Only distinct i, m, s flags are supported; i folds ASCII.');
 const parsed=new Parser(pattern).parse(),findings=[];
 const add=(code,detail)=>{if(!findings.some(f=>f.code===code&&f.detail===detail))findings.push({code,severity:'risk',detail});};
 function walk(n,repeating=false){
  if(n.type==='repeat'){
   const many=n.max>1;if(many&&repeating)add('nested_quantifier','Repeated expression contains another repetition.');
   if(many&&nullable(n.child))add('nullable_repeat','Repetition contains an expression that can match empty text.');walk(n.child,repeating||many);
  }else if(n.type==='alt'){
   for(let i=0;i<n.branches.length;i++)for(let j=i+1;j<n.branches.length;j++)if(overlap(n.branches[i],n.branches[j],flags))add('overlapping_alternation',repeating?'Repeated alternatives share a possible first character.':'Alternatives share a possible first character; inspect ambiguous prefixes.');
   n.branches.forEach(x=>walk(x,repeating));
  }else if(n.type==='group')walk(n.child,repeating);
  else if(n.type==='seq'){
   // Repeats separated by nullable nodes can redistribute the same characters.
   for(let i=0;i<n.items.length;i++){const a=n.items[i];if(a.type!=='repeat'||a.max<=1)continue;
    for(let j=i+1;j<n.items.length;j++){const b=n.items[j];if(b.type==='repeat'&&b.max>1&&overlap(a,b,flags))add('overlapping_repeats','Sequential repetitions can consume the same character.');if(!nullable(b))break;}}
   n.items.forEach(x=>walk(x,repeating));
  }
 }
 walk(parsed.ast);return {...parsed,flags,findings,risky:findings.length>0,analysis:'Conservative subset linter; absence of findings is not a proof of ReDoS safety.'};
}
function groupIds(n){if(n.type==='group')return [...(n.id?[n.id]:[]),...groupIds(n.child)];if(n.type==='repeat')return groupIds(n.child);if(n.type==='seq')return n.items.flatMap(groupIds);if(n.type==='alt')return n.branches.flatMap(groupIds);return [];}
class StepLimit extends Error{}
function run(pattern,text,{flags='',stepLimit=50000,allowRisk=false,global=true,maxMatches=100}={}){
 const analysis=analyze(pattern,flags);
 if(typeof text!=='string'||text.length>LIMITS.input)fail('Input must be text, at most 2048 UTF-16 units.');
 if(!Number.isInteger(stepLimit)||stepLimit<1||stepLimit>LIMITS.steps)fail('Step limit must be 1–200000.');
 if(!Number.isInteger(maxMatches)||maxMatches<1||maxMatches>LIMITS.matches)fail('Match limit must be 1–200.');
 if(analysis.risky&&!allowRisk)return {status:'risk_blocked',steps:0,matches:[],findings:analysis.findings,complete:false};
 let steps=0;const matches=[];const tick=()=>{if(steps>=stepLimit)throw new StepLimit('Step limit reached.');steps++;};
 function* visit(n,pos,caps){tick();
  if(['literal','category','class','dot'].includes(n.type)){if(charTest(n,text[pos],flags))yield {pos:pos+1,caps};return;}
  if(n.type==='anchor'){if(n.kind==='^'?(pos===0||flags.includes('m')&&line(text[pos-1])):(pos===text.length||flags.includes('m')&&line(text[pos])))yield {pos,caps};return;}
  if(n.type==='boundary'){const yes=word(text[pos-1])!==word(text[pos]);if(yes!==n.negate)yield {pos,caps};return;}
  if(n.type==='group'){
   const clean=caps.slice();for(const id of groupIds(n))clean[id]=null;
   for(const s of visit(n.child,pos,clean)){tick();const next=s.caps.slice();if(n.id)next[n.id]=[pos,s.pos];yield {pos:s.pos,caps:next};}return;
  }
  if(n.type==='alt'){for(const child of n.branches)yield* visit(child,pos,caps);return;}
  if(n.type==='seq'){
   // Explicit sequence stack avoids call depth proportional to pattern length.
   const stack=[{index:0,pos,caps,iterator:null}];
   while(stack.length){tick();const f=stack[stack.length-1];if(f.index===n.items.length){yield {pos:f.pos,caps:f.caps};stack.pop();continue;}
    if(!f.iterator)f.iterator=visit(n.items[f.index],f.pos,f.caps);const next=f.iterator.next();if(next.done){stack.pop();continue;}stack.push({index:f.index+1,...next.value,iterator:null});}return;
  }
  if(n.type==='repeat'){
   const ids=groupIds(n.child),stack=[{pos,caps,count:0,iterator:null,emitted:false}];
   while(stack.length){tick();const f=stack[stack.length-1];
    if(!n.greedy&&!f.emitted){f.emitted=true;if(f.count>=n.min)yield {pos:f.pos,caps:f.caps};}
    if(f.count<n.max){
     if(!f.iterator){const clean=f.caps.slice();for(const id of ids)clean[id]=null;f.iterator=visit(n.child,f.pos,clean);}
     const next=f.iterator.next();if(!next.done){if(next.value.pos!==f.pos||f.count<n.min){stack.push({...next.value,count:f.count+1,iterator:null,emitted:false});}continue;}
    }
    if(n.greedy&&!f.emitted){f.emitted=true;if(f.count>=n.min)yield {pos:f.pos,caps:f.caps};}
    stack.pop();
   }
  }
 }
 let start=0;
 try{
  while(start<=text.length){tick();let found=null;
   for(let pos=start;pos<=text.length;pos++){tick();const caps=Array(analysis.groups+1).fill(null),it=visit(analysis.ast,pos,caps),next=it.next();
    if(!next.done){found={start:pos,end:next.value.pos,caps:next.value.caps};break;}}
   if(!found)return {status:'complete',complete:true,steps,matches,findings:analysis.findings};
   found.caps[0]=[found.start,found.end];const groups=found.caps.map((span,id)=>({id,span,value:span?text.slice(...span):null}));
   const named=Object.create(null);for(const [name,id] of Object.entries(analysis.names))named[name]=groups[id];
   matches.push({start:found.start,end:found.end,value:text.slice(found.start,found.end),groups,named});
   if(!global)return {status:'complete',complete:true,steps,matches,findings:analysis.findings};
   start=found.end===found.start?found.end+1:found.end;
   if(start>text.length)return {status:'complete',complete:true,steps,matches,findings:analysis.findings};
   if(matches.length>=maxMatches)return {status:'match_limit',complete:false,steps,matches,findings:analysis.findings};
  }
 }catch(e){if(!(e instanceof StepLimit))throw e;return {status:'step_limit',complete:false,steps,matches,findings:analysis.findings};}
 return {status:'complete',complete:true,steps,matches,findings:analysis.findings};
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const api={LIMITS,Parser,analyze,run,escapeHTML};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RegexBench=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
