const test=require('node:test');
const assert=require('node:assert/strict');
const team=require('../team');
const old='Jueves 15 de octubre de 2026', today='Jueves 22 de octubre de 2026', future='Jueves 29 de octubre de 2026';
const parse=label=>new Date(2026,9,Number(label.split(' ')[1]));
function legacy(){return {
  cooks:[
    {id:'c1',name:'Juan Pablo',color:'#2563eb',sub:false},
    {id:'c2',name:'Mijal',color:'#db2777',sub:false},
    {id:'c3',name:'Gabriel',color:'#c2410c',sub:false},
    {id:'c4',name:'Vanesa',color:'#7c3aed',sub:false},
    {id:'c5',name:'Melissa',color:'#0891b2',sub:false},
    {id:'c6',name:'Evelyn Latín',color:'#ca8a04',sub:true},
    {id:'connie',name:'Connie Fridman',color:'#123456',sub:true},
  ],
  tasks:[{id:'t1',who:['c3','c4','c5'],done:true}],
  assign:{[old]:{t1:['c3','c4','c5']},[today]:{t1:['c3','c4','c5']},[future]:{t1:['connie','c4']}},
  crewOverride:{[old]:['Gabriel','Vanesa','Melissa'],[today]:['Gabriel Díaz','Vanessa Díaz','Melissa Gómez','Connie']},
  encargado:{[old]:'Gabriel',[today]:'Vanessa Díaz',[future]:'Connie'},
  days:[{dt:'22 oct',team:['Gabriel Díaz','Vanessa Díaz']}],
};}
test('migra el pool, conserva identidades y no reasigna tareas de quienes salen',()=>{
  const s=legacy();assert.equal(team.migrate(s,parse),true);
  assert.deepEqual(s.cooks.map(c=>c.name),['Juan Pablo','Mijal','Melisa','Evelyn Latín','Constanza Fridman']);
  assert.ok(s.cooks.every(c=>!c.sub));
  assert.equal(s.cooks.find(c=>c.name==='Constanza Fridman').id,'connie');
  assert.equal(s.cooks.find(c=>c.name==='Evelyn Latín').color,'#ca8a04');
  assert.deepEqual(s.assign[today].t1,['c5']);
  assert.deepEqual(s.assign[future].t1,['connie']);
  assert.deepEqual(s.tasks[0].who,['c5']);assert.equal(s.tasks[0].done,true);
  assert.deepEqual(s.crewOverride[today],['Melisa','Constanza Fridman']);
  assert.equal(s.encargado[today],undefined);assert.equal(s.encargado[future],'Constanza Fridman');
});
test('conserva el historial y la fuente oficial',()=>{
  const s=legacy(),before=structuredClone(s);team.migrate(s,parse);
  assert.deepEqual(s.assign[old],before.assign[old]);
  assert.deepEqual(s.crewOverride[old],before.crewOverride[old]);
  assert.equal(s.encargado[old],'Gabriel');
  assert.deepEqual(s.days,before.days);
  assert.deepEqual(s.retiredCooks.map(c=>c.id),['c3','c4']);
});
test('la migración es idempotente y sobrevive la recarga de un documento remoto antiguo',()=>{
  const s=legacy();team.migrate(s,parse);const before=JSON.stringify(s);
  assert.equal(team.migrate(s,parse),false);assert.equal(JSON.stringify(s),before);
  Object.assign(s,legacy(),{teamVersion:0});team.migrate(s,parse);
  assert.equal(s.cooks.length,5);assert.equal(s.retiredCooks.length,2);
});
test('unifica Connie y Constanza sin duplicar tarjetas ni perder asignaciones',()=>{
  const s=legacy();s.cooks.push({id:'dup',name:'Constanza Fridman',color:'#654321',sub:false});
  s.assign[today].t2=['connie','dup'];team.migrate(s,parse);
  assert.equal(s.cooks.filter(c=>c.name==='Constanza Fridman').length,1);
  assert.deepEqual(s.assign[today].t2,['connie']);
  assert.ok(s.retiredCooks.some(c=>c.id==='dup'));
});
test('agrega a Constanza sin reutilizar el id de otra persona',()=>{
  const s=legacy();s.cooks=s.cooks.filter(c=>c.id!=='connie');
  s.cooks.push({id:'c7',name:'Otra persona',sub:true});team.migrate(s,parse);
  assert.equal(s.cooks.find(c=>c.name==='Constanza Fridman').id,'c7_fixed');
  assert.equal(new Set(s.cooks.map(c=>c.id)).size,s.cooks.length);
});
test('no confunde nombres parecidos y respeta la fecha de inicio',()=>{
  assert.equal(team.retired('Gabriela Díaz'),false);assert.equal(team.retired('Gabriel Pérez'),false);
  assert.equal(team.retired('Vanessa Díaz'),true);
  assert.equal(team.current(old,parse),false);assert.equal(team.current(today,parse),true);
  assert.equal(team.current(future,parse),true);
});
