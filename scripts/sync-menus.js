/* ============================================================================
   Cocina SAET · Sincronización automática de MENÚS desde el sitio web
   ----------------------------------------------------------------------------
   Lee las páginas públicas de Residencia SAET y actualiza Firebase Realtime
   Database con los menús de los JUEVES (los días que cocina el equipo):
     • ONCES     → cocina/doc/onceDays   (menús, descongelar, cantidades)
     • ALMUERZOS → cocina/doc/thursdays  (plato, ensalada, insumos)
   La app lee Firebase en vivo → se actualiza sola, sin intervención manual.

   Se ejecuta solo (GitHub Actions, ver .github/workflows/sync-menus.yml).
   Seguridad: cada sección se valida por separado; si el parseo no pasa los
   chequeos de sanidad, NO se escribe esa parte (un cambio en la web nunca
   borra los datos buenos). Probar sin escribir: DRY_RUN=1 node scripts/sync-menus.js
============================================================================ */

const ONCE_URL = 'https://sites.google.com/view/residencia-saet/cocina/once-cena/men%C3%BA-onces';
const ALM_URL  = 'https://sites.google.com/view/residencia-saet/cocina/almuerzo/men%C3%BA-almuerzo';
const DB = 'https://cocina-saet-default-rtdb.firebaseio.com';

const MON = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function clean(s){return String(s||'').replace(/\s+/g,' ').replace(/\s+([.,;:])/g,'$1').replace(/^[\s|.\-]+/,'').replace(/[\s.]+$/,'').trim();}

function htmlToText(html){
  html = html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  return html.replace(/<[^>]+>/g,' ')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
    .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
    .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
    .replace(/\s+/g,' ');
}

// localiza los encabezados de día ("Jueves, 4 de junio de 2026") y devuelve sus posiciones
function dayHeads(t){
  const re = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+2026/gi;
  let m, heads = [];
  while(m = re.exec(t)) heads.push({i:m.index, end:re.lastIndex, wd:m[1].toLowerCase(), day:+m[2], mon:m[3].toLowerCase()});
  return heads;
}
function byDate(a,b){
  const pa=a.label.match(/(\d+) de (\w+)/), pb=b.label.match(/(\d+) de (\w+)/);
  return (MON.indexOf(pa[2])*100+ +pa[1]) - (MON.indexOf(pb[2])*100+ +pb[1]);
}

/* ---------------- ONCES ---------------- */
function parseOnce(html){
  const t = htmlToText(html);
  const heads = dayHeads(t);
  const out = [];
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    if(!/^juev/.test(h.wd)) continue;
    const body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    let menus = [];
    const mr = /Men[uú]\s*(\d+)\s*:\s*([^]*?)(?=Men[uú]\s*\d+\s*:|Descongelar|Cantidades|$)/gi;
    let mm;
    while(mm = mr.exec(body)){const txt = clean(mm[2]).replace(/\.$/,''); if(txt) menus.push('Menú '+mm[1]+': '+txt);}
    if(!menus.length){
      const mz = body.match(/Men[uú]\s*:?\s*([^]*?)(?=Descongelar|Cantidades|$)/i);
      if(mz){clean(mz[1]).replace(/\.$/,'').split('/').map(s=>s.trim()).filter(Boolean).forEach(s=>menus.push(s));}
    }
    let extra = '';
    const ex = body.match(/Descongelar([^]*?)(?=Cantidades|$)/i);
    if(ex) extra = 'Descongelar ' + clean(ex[1]).replace(/\.$/,'');
    let cant = '';
    const cz = body.match(/Cantidades\s*:?\s*([^]*)$/i);
    if(cz) cant = clean(cz[1]);
    const idx = MON.indexOf(h.mon);
    out.push({label:'Jueves '+h.day+' de '+h.mon+' de 2026', dt:h.day+' '+SHORT[idx], wd:'jueves', menus, extra, cant});
  }
  out.sort(byDate);
  return out;
}
function saneOnce(list){
  return Array.isArray(list) && list.length >= 2 && list.every(o => o.label && o.dt && Array.isArray(o.menus) && o.menus.length >= 1);
}

/* ---------------- ALMUERZOS ---------------- */
function parseAlm(html){
  const t = htmlToText(html);
  const heads = dayHeads(t);
  const out = [];
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    if(!/^juev/.test(h.wd)) continue;
    const body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    let dish='', ens='', cant='';
    if(/Men[uú]\s+principal\s*:/i.test(body)){
      // formato A: Menú principal / Ensaladas / Insumo principal / Insumo ensaladas
      const d  = body.match(/Men[uú]\s+principal\s*:\s*([^]*?)\.\s*Ensaladas\s*:/i);
      const e  = body.match(/Ensaladas\s*:\s*([^]*?)\.\s*Insumo\s+principal\s*:/i);
      const ip = body.match(/Insumo\s+principal\s*:\s*([^]*?)\.\s*Insumo\s+ensaladas\s*:/i);
      const ie = body.match(/Insumo\s+ensaladas\s*:\s*([^]*?)(?:\.|$)/i);
      dish = clean(d && d[1]); ens = clean(e && e[1]);
      const almC = clean(ip && ip[1]), ensC = clean(ie && ie[1]);
      cant = almC + (ensC ? '. Ensaladas: ' + ensC : '');
    } else if(/\bEns\.?\s/i.test(body)){
      // formato B: <plato>. Ens. <ensalada> <cantidades… Ensaladas: …>
      const d = body.match(/^([^]*?)\.\s*Ens\.?\s+/i);
      dish = clean(d && d[1]).replace(/\.\s+/g,' · ');
      const after = body.slice(d ? d[0].length : 0);
      const sp = after.match(/^([^]*?)\s+(\d[^]*)$/);
      if(sp){ ens = clean(sp[1]); cant = clean(sp[2]); }
      else { ens = clean(after); cant = ''; }
    }
    out.push({label:'Jueves '+h.day+' de '+h.mon+' de 2026', dish, ens, cant});
  }
  out.sort(byDate);
  return out;
}
function saneAlm(list){
  return Array.isArray(list) && list.length >= 8 && list.every(o => o.label && o.dish && o.cant);
}

/* ---------------- CALENDARIO COMPLETO (todos los días) ---------------- */
function parseDays(html){
  const t = htmlToText(html);
  const heads = dayHeads(t);
  const out = [];
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    const body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    let dish='', ens='', cong='', cant='';
    if(/Men[uú]\s+principal\s*:/i.test(body)){
      // formato A: [cong] Menú principal: dish. Ensaladas: ens. Insumo principal: … Insumo ensaladas: …
      const cm = body.match(/^[\s|]*([^]*?)\s*Men[uú]\s+principal\s*:/i);
      if(cm) cong = clean(cm[1]);
      const d = body.match(/Men[uú]\s+principal\s*:\s*([^]*?)\.\s*Ensaladas\s*:/i);
      const e = body.match(/Ensaladas\s*:\s*([^]*?)\.\s*Insumo\s+principal\s*:/i);
      dish = clean(d && d[1]); ens = clean(e && e[1]);
      const ip = body.match(/Insumo\s+principal\s*:\s*([^]*?)\.\s*Insumo\s+ensaladas\s*:/i);
      const ie = body.match(/Insumo\s+ensaladas\s*:\s*([^]*?)(?:\.|$)/i);
      const almC = clean(ip && ip[1]), ensC = clean(ie && ie[1]);
      cant = almC + (ensC ? '. Ensaladas: ' + ensC : '');
    } else if(/\bEns\.?\s/i.test(body)){
      // formato B: dish. Ens. ens cant…
      const d = body.match(/^([^]*?)\.\s*Ens\.?\s+/i);
      dish = clean(d && d[1]).replace(/\.\s+/g,' · ');
      const after = body.slice(d ? d[0].length : 0);
      const sp = after.match(/^([^]*?)\s+(\d[^]*)$/);
      if(sp){ ens = clean(sp[1]); cant = clean(sp[2]); }
      else { ens = clean(after); cant = ''; }
    }
    if(!dish) continue;
    out.push({wd:h.wd, dt:h.day+' '+SHORT[MON.indexOf(h.mon)], dish, ens, cong, cant});
  }
  const key=dt=>{const m=String(dt).match(/(\d+)\s+(\w+)/);return m?(SHORT.indexOf(m[2].slice(0,3))*100+(+m[1])):999;};
  out.sort((a,b)=>key(a.dt)-key(b.dt));
  return out;
}
function saneDays(list){
  return Array.isArray(list) && list.length >= 20 && list.every(d => d.dt && d.dish);
}

/* ---------------- TURNOS (quiénes trabajan cada día) ----------------
   La web publica una página de turnos por ciclo EER (turnos-eer-37, -38, …).
   Cada día: "Lunes 22 de junio : Nombre1, Nombre2, … Nombre5" (sin año).
   Probamos varios ciclos; los que no existen (404) se ignoran. Se fusiona
   todo en un mapa { 'dt' -> [nombres] } y luego se adjunta a cada día. */
const TURNOS_URL = n => `https://sites.google.com/view/residencia-saet/cocina/almuerzo/turnos-eer-${n}`;
const TURNOS_EERS = [37, 38, 39, 40, 41, 42];
const TURNOS_STOP = /\b(Semana\b|SAET|Google Sites|Report abuse|Page details|Page updated|REVISI[ÓO]N)/i;
function parseTurnos(html){
  const t = htmlToText(html);
  const re = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*:/gi;
  let m, heads = [];
  while(m = re.exec(t)) heads.push({i:m.index, end:re.lastIndex, day:+m[2], mon:m[3].toLowerCase()});
  const map = {};
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    let body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    body = body.split(TURNOS_STOP)[0];
    const names = body.split(',').map(clean)
      .filter(s => s && s.length >= 3 && /[a-záéíóúñ]/i.test(s) && !/^\d/.test(s))
      .slice(0, 5);
    if(names.length){ map[h.day + ' ' + SHORT[MON.indexOf(h.mon)]] = names; }
  }
  return map;
}
async function buildTurnos(){
  const all = {};
  for(const n of TURNOS_EERS){
    try{
      const res = await fetch(TURNOS_URL(n), {headers:{'User-Agent':'Mozilla/5.0 (compatible; CocinaSAET-sync/1.0)'}});
      if(!res.ok) continue;                       // 404 → ese ciclo aún no existe
      const part = parseTurnos(await res.text());
      Object.assign(all, part);
      console.log(`  turnos EER ${n}: ${Object.keys(part).length} días`);
    }catch(e){ /* ignora errores de un ciclo puntual */ }
  }
  return all;
}

/* ---------------- TURNOS INTERESCUELA (durante la pausa entre clases) ----------------
   Página aparte (turnos-interescuela). Formato: "Miércoles 01/07 👨‍🍳 Nombre 👩‍🍳 Nombre…".
   Los nombres van separados por emojis de cocinero; las fechas son DD/MM. */
const INTER_URL = 'https://sites.google.com/view/residencia-saet/cocina/almuerzo/turnos-interescuela';
function parseInter(html){
  const t = htmlToText(html);
  const re = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\s*\/\s*(\d{1,2})/gi;
  let m, heads = [];
  while(m = re.exec(t)) heads.push({i:m.index, end:re.lastIndex, wd:m[1].toLowerCase(), day:+m[2], mon:+m[3]});
  const out = [];
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    let body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    body = body.split(/SEMANA|LLEGADA|ESTUDIANTES|🗓|➖/i)[0];          // corta divisores y "llegada estudiantes"
    const names = (body.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)+/g) || [])
      .map(clean).filter(s => s.length >= 4 && s !== s.toUpperCase());   // nombres (2+ palabras, no TODO MAYÚSCULAS)
    if(names.length) out.push({dt:h.day+' '+SHORT[h.mon-1], wd:h.wd, team:names});
  }
  return out;
}
function saneInter(list){ return Array.isArray(list) && list.length >= 1 && list.every(d => d.dt && Array.isArray(d.team) && d.team.length); }

/* ---------------- escritura ---------------- */
async function fetchText(url){
  const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (compatible; CocinaSAET-sync/1.0)'}});
  if(!res.ok) throw new Error('HTTP '+res.status+' al leer '+url);
  return res.text();
}
async function syncSection(name, path, data){
  let current = null;
  try{ const c = await fetch(DB+path); if(c.ok) current = await c.json(); }catch(e){}
  if(current && JSON.stringify(current) === JSON.stringify(data)){
    console.log(`✓ ${name}: la nube ya está al día.`);
    return;
  }
  if(process.env.DRY_RUN){
    console.log(`— DRY RUN — ${name}: escribiría ${data.length} registros.`);
    return;
  }
  const put = await fetch(DB+path, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  if(!put.ok){ const b = await put.text().catch(()=> ''); throw new Error(`Firebase rechazó ${name}: HTTP ${put.status} ${b}`); }
  console.log(`✅ ${name}: ${data.length} registros actualizados en la nube.`);
}

async function main(){
  let failed = false;

  // ONCES
  try{
    console.log('▶ Onces…');
    const once = parseOnce(await fetchText(ONCE_URL));
    console.log(`  ${once.length} jueves: ${once.map(o=>o.dt).join(', ')}`);
    // No-fatal: tener pocas onces es normal cerca de un receso. No escribimos (se
    // conservan las onces previas) pero NO hacemos fallar todo el run por esto.
    if(!saneOnce(once)){ console.error('✋ Onces: pocas/sin onces válidas (normal cerca de un receso), NO escribo — datos a salvo.'); }
    else await syncSection('Onces', '/cocina/doc/onceDays.json', once);
  }catch(e){ console.error('❌ Onces:', e.message); failed = true; }

  // ALMUERZOS (jueves con cantidades) + CALENDARIO COMPLETO (todos los días)
  try{
    console.log('▶ Almuerzos…');
    const almHtml = await fetchText(ALM_URL);
    const alm = parseAlm(almHtml);
    console.log(`  ${alm.length} jueves: ${alm.map(o=>o.label.replace('Jueves ','').replace(' de 2026','')).join(' · ')}`);
    if(!saneAlm(alm)){ console.error('✋ Almuerzos: parseo inválido, NO escribo (datos a salvo).'); failed = true; }
    else await syncSection('Almuerzos', '/cocina/doc/thursdays.json', alm);

    const days = parseDays(almHtml);
    console.log(`  Calendario: ${days.length} días (${days[0]&&days[0].dt} → ${days.length&&days[days.length-1].dt})`);
    // equipos por día: adjuntar quiénes trabajan (los días que el sitio ya publicó turnos)
    try{
      console.log('▶ Turnos por día…');
      const turnos = await buildTurnos();
      let conTurno = 0;
      days.forEach(d => { const team = turnos[d.dt]; if(team && team.length){ d.team = team; conTurno++; } });
      console.log(`  ${conTurno}/${days.length} días del calendario tienen equipo asignado.`);
    }catch(e){ console.error('  (turnos no disponibles:', e.message, ') — sigo sin equipos.'); }
    if(!saneDays(days)){ console.error('✋ Calendario: parseo inválido, NO escribo (datos a salvo).'); failed = true; }
    else await syncSection('Calendario', '/cocina/doc/days.json', days);
  }catch(e){ console.error('❌ Almuerzos/Calendario:', e.message); failed = true; }

  // TURNOS INTERESCUELA (durante la pausa entre clases) — supplementario: si falla NO marca el run como fallido
  try{
    console.log('▶ Turnos interescuela…');
    const inter = parseInter(await fetchText(INTER_URL));
    console.log(`  ${inter.length} días: ${inter.map(d=>d.dt).join(', ')}`);
    if(!saneInter(inter)) console.error('✋ Interescuela: sin datos válidos, NO escribo (datos a salvo).');
    else await syncSection('Interescuela', '/cocina/doc/interTurnos.json', inter);
  }catch(e){ console.error('❌ Interescuela:', e.message); }

  if(failed) process.exit(1);
  console.log('🌿 Sincronización completa.');
}

main().catch(e=>{ console.error('❌ Error general:', e.message); process.exit(1); });
