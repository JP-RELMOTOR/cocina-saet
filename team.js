/* Equipo vigente desde el 22 de octubre de 2026. Los turnos previos se conservan. */
const CocinaTeam = (() => {
  const defaults = [
    {id:'c1',name:'Juan Pablo',color:'#2563eb',sub:false},
    {id:'c2',name:'Mijal',color:'#db2777',sub:false},
    {id:'c6',name:'Evelyn Latín',color:'#a16207',sub:false},
    {id:'c5',name:'Melisa',color:'#0891b2',sub:false},
    {id:'c7',name:'Constanza Fridman',color:'#7c3aed',sub:false},
  ];
  const norm = value => String(value||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/([a-z])\1+/g,'$1').trim();
  const matches = (name, first, surname) => {
    const tokens=norm(name).split(/\s+/);
    return tokens[0]===norm(first) && (tokens.length===1 || tokens.includes(norm(surname)));
  };
  const retired = name => matches(name,'Gabriel','Díaz') || matches(name,'Vanessa','Díaz');
  const member = name => defaults.find(c => c.id==='c5' ? matches(name,'Melisa','Gómez')
    : c.id==='c6' ? matches(name,'Evelyn','Latín')
    : c.id==='c7' ? matches(name,'Constanza','Fridman') || matches(name,'Connie','Fridman')
      || /^cony f\.?$/.test(norm(name)) : false);
  const current = (label, parseDate) => {
    const date=parseDate(label);
    return !!date && date.getTime()>=new Date(2026,9,22).getTime();
  };
  function migrate(state, parseDate) {
    if(state.teamVersion>=2)return false;
    state.cooks=Array.isArray(state.cooks)?state.cooks:structuredClone(defaults);
    state.retiredCooks=state.retiredCooks||[];
    const removed=new Set();
    const aliases=new Map();
    const names=new Map();
    state.cooks=state.cooks.filter(c=>{
      if(!retired(c.name))return true;
      removed.add(c.id);
      if(!state.retiredCooks.some(x=>x.id===c.id))state.retiredCooks.push({...c});
      return false;
    });
    for(const target of defaults.filter(c=>['c5','c6','c7'].includes(c.id))){
      const found=state.cooks.filter(c=>member(c.name)?.id===target.id);
      let keeper=found[0];
      if(!keeper){
        const id=state.cooks.concat(state.retiredCooks).some(c=>c.id===target.id)?target.id+'_fixed':target.id;
        keeper={...target,id};state.cooks.push(keeper);
      }
      for(const c of found){names.set(c.name,target.name);aliases.set(c.id,keeper.id);}
      keeper.name=target.name;keeper.sub=false;
      state.cooks=state.cooks.filter(c=>!found.includes(c)||c===keeper);
    }
    const cleanIds=ids=>[...new Set((ids||[]).filter(id=>!removed.has(id)).map(id=>aliases.get(id)||id))];
    (state.tasks||[]).forEach(t=>{t.who=cleanIds(t.who);});
    for(const [label,tasks] of Object.entries(state.assign||{})){
      if(!current(label,parseDate))continue;
      for(const id of Object.keys(tasks))tasks[id]=cleanIds(tasks[id]);
    }
    for(const [label,crew] of Object.entries(state.crewOverride||{})){
      if(!current(label,parseDate)||!Array.isArray(crew))continue;
      // Mantener las excepciones de asistencia; el equipo fijo se usa si no hay excepción.
      state.crewOverride[label]=[...new Set(crew.filter(n=>!retired(n)).map(n=>names.get(n)||member(n)?.name||n))];
    }
    for(const [label,name] of Object.entries(state.encargado||{})){
      if(!current(label,parseDate))continue;
      if(retired(name))delete state.encargado[label];
      else state.encargado[label]=names.get(name)||member(name)?.name||name;
    }
    // Conservar el nombre de duplicados para resolver asignaciones históricas.
    for(const [oldId,newId] of aliases)if(oldId!==newId&&!state.retiredCooks.some(c=>c.id===oldId)){
      const c=state.cooks.find(c=>c.id===newId);state.retiredCooks.push({...c,id:oldId});
    }
    state.teamVersion=2;
    return true;
  }
  return {defaults,migrate,current,retired,member};
})();
if(typeof module!=='undefined')module.exports=CocinaTeam;
