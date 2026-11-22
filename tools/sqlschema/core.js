/* Original MIT implementation. DDL subset, never executes SQL. */
(function(root){
'use strict';
const MAX=500000, upper=t=>t && t.kind==='word'?t.value.toUpperCase():'';
function tokenize(s,dialect='postgres'){
 if(typeof s!=='string'||s.length>MAX) throw Error('DDL limit: 500,000 characters');
 const out=[]; let i=0;
 const push=(kind,value,start)=>{out.push({kind,value,start});if(out.length>80000)throw Error('DDL token limit: 80,000');};
 while(i<s.length){
  if(/\s/.test(s[i])){i++;continue;}
  if(s.slice(i,i+2)==='--'){while(i<s.length&&s[i]!=='\n')i++;continue;}
  if(s.slice(i,i+2)==='/*'){let level=1; i+=2;while(i<s.length&&level){if(s.slice(i,i+2)==='/*'){level++;i+=2;}else if(s.slice(i,i+2)==='*/'){level--;i+=2;}else i++;}if(level)throw Error('Unclosed SQL comment');continue;}
  const start=i,c=s[i];
  if(c==="'"||c==='"'||c==='\x60'||(c==='['&&dialect==='sqlite')){
   const end=c==='['?']':c;let v='';i++;let closed=false;
   while(i<s.length){if(s[i]===end){if(s[i+1]===end){v+=end;i+=2;}else{i++;closed=true;break;}}else v+=s[i++];}
   if(!closed)throw Error('Unclosed quoted token at '+start);
   push(c==="'"?'string':'id',v,start);continue;
  }
  if(c==='$'){const m=s.slice(i).match(/^\$[A-Za-z_0-9]*\$/);if(m){const end=s.indexOf(m[0],i+m[0].length);if(end<0)throw Error('Unclosed dollar string');push('string',s.slice(i+m[0].length,end),i);i=end+m[0].length;continue;}}
  if(/[A-Za-z_\u0080-\uffff]/.test(c)){i++;while(i<s.length&&/[\w$\u0080-\uffff]/.test(s[i]))i++;push('word',s.slice(start,i),start);continue;}
  if(/[0-9]/.test(c)){i++;while(i<s.length&&/[0-9.]/.test(s[i]))i++;push('number',s.slice(start,i),start);continue;}
  push('symbol',c,start);i++;
 } return out;
}
const is=(t,v)=> t && (t.kind==='symbol'?t.value===v:upper(t)===v);
function split(tokens,delimiter=','){
 const groups=[];let depth=0,start=0;
 tokens.forEach((t,i)=>{if(is(t,'(')){if(++depth>64)throw Error('SQL nesting limit: 64');}if(is(t,')')&&--depth<0)throw Error('Unexpected closing parenthesis');if(is(t,delimiter)&&depth===0){groups.push(tokens.slice(start,i));start=i+1;}});
 if(depth)throw Error('Unbalanced SQL parentheses');groups.push(tokens.slice(start));return groups;
}
function parse(sql,dialect='postgres'){
 if(!['postgres','sqlite'].includes(dialect))throw Error('Choose postgres or sqlite');
 const tokens=tokenize(sql,dialect), tables=[], indexes=[], notes=[];
 const key=t=>dialect==='sqlite'||t.kind==='word'?t.value.toLowerCase():t.value;
 class Cursor{
  constructor(ts){this.ts=ts;this.p=0;}
  peek(){return this.ts[this.p];}
  eat(v){if(is(this.peek(),v)){this.p++;return true;}return false;}
  need(v){if(!this.eat(v))throw Error('Expected '+v+' near token '+this.p);}
  id(){const t=this.ts[this.p++];if(!t||!['id','word'].includes(t.kind))throw Error('Expected identifier');return {name:t.value,key:key(t)};}
  name(){const a=[this.id()];while(this.eat('.'))a.push(this.id());if(a.length>2)throw Error('At most schema.table names supported');return {name:a.map(x=>x.name).join('.'),key:JSON.stringify(a.map(x=>x.key)),parts:a.map(x=>x.key)};}
  group(){this.need('(');let depth=1,start=this.p;while(this.p<this.ts.length){const t=this.ts[this.p++];if(is(t,'(')&&++depth>64)throw Error('SQL nesting limit');if(is(t,')')&&--depth===0)return this.ts.slice(start,this.p-1);}throw Error('Unclosed parenthesis');}
  ids(){const ts=this.group();return split(ts).map(g=>{const c=new Cursor(g),v=c.id();if(c.p!==g.length)throw Error('Expected simple column list');return v.key;});}
 }
 function reference(c,columns){
  const target=c.name();let refColumns=null;if(is(c.peek(),'('))refColumns=c.ids();
  if(refColumns&&refColumns.length!==columns.length)throw Error('Foreign key column count mismatch');
  return {columns,table:target.name,tableKey:target.key,tableParts:target.parts,refColumns};
 }
 // Consume whole FK clauses before returning to column constraints. In particular,
 // SET DEFAULT / SET NULL and NOT DEFERRABLE are not column constraints.
 function referenceSuffix(c){
  while(c.peek()){
   if(c.eat('ON')){
    if(!c.eat('DELETE')&&!c.eat('UPDATE'))throw Error('Expected DELETE or UPDATE after ON');
    if(c.eat('CASCADE')||c.eat('RESTRICT'))continue;
    if(c.eat('NO')){c.need('ACTION');continue;}
    if(c.eat('SET')){if(!c.eat('NULL')&&!c.eat('DEFAULT'))throw Error('Expected NULL or DEFAULT after SET');continue;}
    throw Error('Expected referential action');
   }
   if(c.eat('MATCH')){
    if(!c.eat('FULL')&&!c.eat('PARTIAL')&&!c.eat('SIMPLE'))throw Error('Expected MATCH mode');
    continue;
   }
   if(is(c.peek(),'DEFERRABLE')||(is(c.peek(),'NOT')&&is(c.ts[c.p+1],'DEFERRABLE'))){
    c.eat('NOT');c.need('DEFERRABLE');
    if(c.eat('INITIALLY')&&!c.eat('DEFERRED')&&!c.eat('IMMEDIATE'))throw Error('Expected DEFERRED or IMMEDIATE');
    continue;
   }
   break;
  }
 }
 const constraintWords=new Set(['CONSTRAINT','PRIMARY','NOT','NULL','UNIQUE','REFERENCES','CHECK','DEFAULT','COLLATE','GENERATED']);
 for(const stmt of split(tokens,';')){
  if(!stmt.length)continue;const c=new Cursor(stmt);
  c.need('CREATE');c.eat('TEMP')||c.eat('TEMPORARY');const unique=c.eat('UNIQUE');
  if(c.eat('INDEX')){
   if(c.eat('IF')){c.need('NOT');c.need('EXISTS');}
   const name=c.name();c.need('ON');c.eat('ONLY');const table=c.name();
   let btree=true;if(c.eat('USING')){const method=c.id();btree=method.key==='btree';if(!btree)notes.push('Non-btree index '+name.name+' is not counted for FK coverage');}
   const parts=split(c.group()),cols=[];let simple=true;
   for(const p of parts){const ic=new Cursor(p);try{cols.push(ic.id().key);if(ic.eat('ASC')||ic.eat('DESC')){}if(ic.p!==p.length)simple=false;}catch{simple=false;}}
   const partial=c.eat('WHERE');if(c.p<stmt.length&&!partial)notes.push('Index suffix not analyzed: '+name.name);
   indexes.push({name:name.name,tableKey:table.key,tableParts:table.parts,columns:cols,unique,usable:simple&&!partial&&btree});
   if(!simple||partial)notes.push('Expression/partial index excluded from FK coverage: '+name.name);
   continue;
  }
  if(unique)throw Error('UNIQUE requires CREATE INDEX');
  c.need('TABLE');if(c.eat('IF')){c.need('NOT');c.need('EXISTS');}
  const name=c.name();if(!is(c.peek(),'('))throw Error('Only CREATE TABLE with explicit column definitions is supported');
  const entries=split(c.group());const table={name:name.name,key:name.key,parts:name.parts,columns:[],primaryKey:[],unique:[],foreignKeys:[],indexes:[]};
  if(c.p<stmt.length){const suffix=stmt.slice(c.p).map(t=>t.value).join(' ').toUpperCase();if(!/^(WITHOUT ROWID|STRICT|WITHOUT ROWID , STRICT|STRICT , WITHOUT ROWID)$/.test(suffix))throw Error('Unsupported table suffix: '+suffix);}
  if(!entries.length||entries.some(e=>!e.length))throw Error('Empty table entry');
  for(const entry of entries){
   const e=new Cursor(entry);if(e.eat('CONSTRAINT'))e.id();
   if(e.eat('PRIMARY')){e.need('KEY');if(table.primaryKey.length)throw Error('Multiple primary keys');table.primaryKey=e.ids();if(e.p<entry.length)notes.push('Primary key suffix not analyzed in '+name.name);continue;}
   if(e.eat('UNIQUE')){table.unique.push(e.ids());if(e.p<entry.length)notes.push('Unique suffix not analyzed in '+name.name);continue;}
   if(e.eat('FOREIGN')){e.need('KEY');const cols=e.ids();e.need('REFERENCES');table.foreignKeys.push(reference(e,cols));if(e.p<entry.length)notes.push('FK action/deferrability suffix not analyzed in '+name.name);continue;}
   if(e.eat('CHECK')){e.group();if(e.p!==entry.length)throw Error('Unexpected CHECK suffix');notes.push('CHECK expression retained only as syntax in '+name.name);continue;}
   const col=e.id(),typeStart=e.p;let depth=0;
   while(e.p<entry.length){const t=e.peek();if(!depth&&constraintWords.has(upper(t)))break;if(is(t,'('))depth++;if(is(t,')'))depth--;e.p++;}
   const type=entry.slice(typeStart,e.p).map(t=>t.kind==='id'?'"'+t.value.replace(/"/g,'""')+'"':t.value).map((v,i)=>entry[typeStart+i].kind==='id'?v:v.toUpperCase()).join(' ').replace(/\s*([(),\[\]])\s*/g,'$1').trim();
   if(!type&&dialect==='postgres')throw Error('Missing type for '+col.name);
   const column={name:col.name,key:col.key,type:type||'(unspecified)',notNull:false,primaryKey:false,unique:false};
   if(table.columns.some(x=>x.key===col.key))throw Error('Duplicate column: '+col.name);
   table.columns.push(column);
   while(e.p<entry.length){
    if(e.eat('CONSTRAINT')){e.id();continue;}
    if(e.eat('PRIMARY')){e.need('KEY');if(table.primaryKey.length)throw Error('Multiple primary keys');table.primaryKey=[col.key];column.primaryKey=true;if(e.eat('ASC')||e.eat('DESC')){}e.eat('AUTOINCREMENT');continue;}
    if(e.eat('NOT')){e.need('NULL');column.notNull=true;continue;}
    if(e.eat('NULL'))continue;
    if(e.eat('UNIQUE')){column.unique=true;table.unique.push([col.key]);continue;}
    if(e.eat('REFERENCES')){table.foreignKeys.push(reference(e,[col.key]));referenceSuffix(e);continue;}
    if(e.eat('CHECK')){e.group();notes.push('CHECK expression not evaluated: '+name.name+'.'+col.name);continue;}
    if(e.eat('COLLATE')){e.id();continue;}
    if(e.eat('DEFAULT')){
     const start=e.p;
     if(is(e.peek(),'('))e.group();else{
      if(e.eat('+')||e.eat('-')){}
      if(!e.peek())throw Error('Missing DEFAULT value');
      e.p++;
      // Function defaults and cast types; literals are never interpreted.
      if(is(e.peek(),'('))e.group();
      while(e.eat(':')){e.need(':');e.id();if(is(e.peek(),'('))e.group();}
     }
     if(e.p===start)throw Error('Missing DEFAULT expression');continue;
    }
    if(e.eat('GENERATED')){e.eat('ALWAYS');e.need('AS');e.group();e.eat('STORED')||e.eat('VIRTUAL');notes.push('Generated expression not evaluated: '+name.name+'.'+col.name);continue;}
    throw Error('Unsupported column clause near '+(e.peek()?.value||'end'));
   }
  }
  if(new Set(table.primaryKey).size!==table.primaryKey.length)throw Error('Duplicate primary key column');
  for(const k of table.primaryKey){const col=table.columns.find(x=>x.key===k);if(!col)throw Error('Primary key references missing column');col.primaryKey=true;if(dialect==='postgres')col.notNull=true;}
  for(const cols of [...table.unique,...table.foreignKeys.map(f=>f.columns)]){
   if(new Set(cols).size!==cols.length||cols.some(k=>!table.columns.some(c=>c.key===k)))throw Error('Invalid constraint column list');
  }
  if(tables.some(t=>t.key===table.key))throw Error('Duplicate table: '+table.name);
  tables.push(table);if(tables.length>150)throw Error('Table limit: 150');
 }
 if(!tables.length)throw Error('No CREATE TABLE statements');
 function resolve(parts,owner){return (parts.length===1&&owner.parts.length===2?tables.find(t=>JSON.stringify(t.parts)===JSON.stringify([owner.parts[0],parts[0]])):null)||tables.find(t=>JSON.stringify(t.parts)===JSON.stringify(parts));}
 for(const idx of indexes){const table=resolve(idx.tableParts,{parts:[]});if(!table){notes.push('Index target not found: '+idx.name);continue;}idx.tableKey=table.key;if(idx.columns.some(k=>!table.columns.some(c=>c.key===k))){idx.usable=false;notes.push('Index references absent column: '+idx.name);}table.indexes.push(idx);}
 for(const t of tables)for(const fk of t.foreignKeys){const target=resolve(fk.tableParts,t);if(target){fk.tableKey=target.key;fk.table=target.name;fk.refColumns=fk.refColumns||target.primaryKey.slice();}}
 return {dialect,tables,notes};
}
function lint(schema){
 const out=schema.notes.map(message=>({severity:'info',code:'SUBSET_NOTE',message}));
 const add=(code,message)=>out.push({severity:'warning',code,message});
 for(const t of schema.tables){
  if(!t.primaryKey.length)add('MISSING_PK',t.name+' has no primary key');
  if(schema.dialect==='sqlite'&&t.primaryKey.some(k=>!t.columns.find(c=>c.key===k).notNull))add('SQLITE_PK_NULLABILITY',t.name+': PK does not imply NOT NULL for all SQLite table forms; check INTEGER PRIMARY KEY / WITHOUT ROWID semantics');
  const coverage=[t.primaryKey,...t.unique,...t.indexes.filter(i=>i.usable).map(i=>i.columns)];
  for(const fk of t.foreignKeys){
   if(!coverage.some(cols=>fk.columns.every((k,i)=>cols[i]===k)))add('UNINDEXED_FK',t.name+'('+fk.columns.join(', ')+') lacks a full leading-column index');
   const ref=schema.tables.find(x=>x.key===fk.tableKey);
   if(!ref)add('MISSING_TARGET',t.name+' references absent table '+fk.table);
   else if(!fk.refColumns?.length||fk.refColumns.some(k=>!ref.columns.some(c=>c.key===k)))add('MISSING_TARGET_COLUMN',t.name+' has unresolved referenced columns in '+ref.name);
   else if(fk.refColumns.length!==fk.columns.length)add('FK_ARITY',t.name+' foreign-key arity differs from target primary key');
   else if(![ref.primaryKey,...ref.unique,...ref.indexes.filter(i=>i.unique&&i.usable).map(i=>i.columns)].some(cols=>cols.length===fk.refColumns.length&&cols.every((k,i)=>k===fk.refColumns[i])))add('NON_UNIQUE_TARGET',t.name+' references columns without a matching PK/UNIQUE key');
  }
 }return out;
}
function typeInfo(s){
 const n=s.toUpperCase().replace(/\s+/g,' ').trim();
 // PostgreSQL does not enforce declared array dimensions/bounds. Compare element
 // capacity for array-to-array changes, while keeping scalar/array changes distinct.
 const element=n.replace(/(?:\[\d*\])+$/,'');
 if(element!==n)return {...typeInfo(element),array:true};
 const m=n.match(/^(?:CHARACTER VARYING|VARCHAR|CHARACTER|CHAR|NCHAR|NVARCHAR)\((\d+)\)$/);
 if(m)return {family:'text',cap:Number(m[1])};
 if(['NUMERIC','DECIMAL'].includes(n))return {family:'decimal',whole:Infinity,scale:Infinity};
 if(['REAL','FLOAT4','DOUBLE PRECISION','FLOAT8'].includes(n))return {family:'float',cap:['REAL','FLOAT4'].includes(n)?32:64};
 if(['TEXT','VARCHAR','CHARACTER VARYING'].includes(n))return {family:'text',cap:Infinity};
 if(['SMALLINT','INT2','INTEGER','INT','INT4','BIGINT','INT8','SMALLSERIAL','SERIAL','BIGSERIAL'].includes(n))return {family:'integer',cap:/SMALL|INT2/.test(n)?16:/BIG|INT8/.test(n)?64:32};
 const d=n.match(/^(?:DECIMAL|NUMERIC)\((\d+)(?:,(\d+))?\)$/);if(d)return {family:'decimal',whole:Number(d[1])-Number(d[2]||0),scale:Number(d[2]||0)};
 return {family:n,cap:Infinity};
}
function diff(a,b){
 if(a.dialect!==b.dialect)throw Error('Diff requires the same dialect');
 const out=[],add=(severity,code,message)=>out.push({severity,code,message});
 for(const t of a.tables){const next=b.tables.find(x=>x.key===t.key);if(!next){add('danger','DROP_TABLE','Drop table '+t.name);continue;}
  for(const c of t.columns){const n=next.columns.find(x=>x.key===c.key);
   if(!n){add('danger','DROP_COLUMN','Drop '+t.name+'.'+c.name);continue;}
   if(c.type!==n.type){const x=typeInfo(c.type),y=typeInfo(n.type);
    const narrowing=a.dialect==='postgres'&&x.family===y.family&&!!x.array===!!y.array&&(x.family==='decimal'?(y.whole<x.whole||y.scale<x.scale):y.cap<x.cap);
    add(narrowing?'danger':'warning',narrowing?'TYPE_NARROWING':'TYPE_CHANGE',t.name+'.'+c.name+': '+c.type+' → '+n.type+(a.dialect==='sqlite'?' (SQLite affinity/STRICT semantics require review)':''));
   }
   if(!c.notNull&&n.notNull)add('warning','ADD_NOT_NULL',t.name+'.'+c.name+' adds NOT NULL; existing rows need review');
   if(c.notNull&&!n.notNull)add('warning','DROP_NOT_NULL',t.name+'.'+c.name+' removes NOT NULL');
  }
  for(const c of next.columns)if(!t.columns.some(x=>x.key===c.key))add(c.notNull?'warning':'info','ADD_COLUMN','Add '+t.name+'.'+c.name+(c.notNull?' NOT NULL: review defaults/backfill':''));
  const signature=t=>JSON.stringify({pk:t.primaryKey,unique:t.unique,fk:t.foreignKeys.map(f=>[f.columns,f.tableKey,f.refColumns])});
  if(signature(t)!==signature(next))add('warning','KEY_CHANGE','PK/UNIQUE/FK definitions change in '+t.name);
 }
 for(const t of b.tables)if(!a.tables.some(x=>x.key===t.key))add('info','ADD_TABLE','Add table '+t.name);
 return out;
}
function markdown(s){
 const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\r\n]/g,' ');
 return '# Schema ('+s.dialect+')\n\n'+s.tables.map(t=>'## '+esc(t.name)+'\n\n| Column | Type | PK | NOT NULL | UNIQUE |\n| --- | --- | --- | --- | --- |\n'+t.columns.map(c=>'| '+[c.name,c.type,c.primaryKey?'yes':'',c.notNull?'yes':'',c.unique||t.unique.some(u=>u.length===1&&u[0]===c.key)?'yes':''].map(esc).join(' | ')+' |').join('\n')+'\n\n'+t.foreignKeys.map(f=>'FK ('+f.columns.map(esc).join(', ')+') → '+esc(f.table)+' ('+(f.refColumns||[]).map(esc).join(', ')+')').join('\n')).join('\n\n')+'\n';
}
const api={tokenize,parse,lint,diff,markdown,typeInfo};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SQLSchema=api;
})(globalThis);
