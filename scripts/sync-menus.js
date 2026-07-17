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

/* ---------------- ONCES v2: Excel incrustado desde Google Drive ----------------
   Desde EER 38 el sitio ya no publica las onces como texto: incrusta un archivo
   de Drive (iframe) que en realidad es un .xlsx con columnas FECHA|MENU|CANTIDADES
   (fechas como seriales de Excel). Leemos el ZIP del xlsx con zlib de Node, sin
   dependencias. Si la página volviera al formato texto, parseOnce sigue de respaldo. */
const zlib = require('zlib');
function unzipEntries(buf){
  // localiza el End Of Central Directory y recorre el directorio central
  let eocd = -1;
  for(let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--){
    if(buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error('ZIP sin EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = {};
  for(let n = 0; n < count; n++){
    if(buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    // header local: salta nombre+extra propios (pueden diferir del central)
    const lNameLen = buf.readUInt16LE(lho + 26), lExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}
function xmlDecode(s){return String(s||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#10;|&#13;/g,'\n').replace(/&amp;/g,'&');}
function xlsxRows(buf){
  const files = unzipEntries(buf);
  const shared = [];
  const ssXml = files['xl/sharedStrings.xml'] && files['xl/sharedStrings.xml'].toString('utf8');
  if(ssXml){ let m, re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    while(m = re.exec(ssXml)) shared.push(xmlDecode((m[1].match(/<t\b[^>]*>[\s\S]*?<\/t>/g)||[]).join(''))); }
  const shXml = (files['xl/worksheets/sheet1.xml'] || Buffer.from('')).toString('utf8');
  const rows = [];
  let rm, rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  while(rm = rowRe.exec(shXml)){
    const cells = [];
    let cm, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    while(cm = cellRe.exec(rm[1])){
      const attrs = cm[1] || '', inner = cm[2] || '';
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [,''])[1];
      const isShared = /t="s"/.test(attrs);
      cells.push(isShared ? (shared[+v] || '') : xmlDecode(v));
    }
    rows.push(cells);
  }
  return rows;
}
function excelDate(serial){ return new Date(Date.UTC(1899, 11, 30) + Math.round(+serial) * 86400000); }
const WD_ES2 = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function parseOnceXlsx(buf){
  const rows = xlsxRows(buf);
  const out = [];
  for(const cells of rows){
    const di = cells.findIndex(v => /^4\d{4}(?:\.0+)?$/.test(String(v).trim()));
    if(di < 0) continue;
    const d = excelDate(cells[di]);
    if(isNaN(d) || d.getUTCFullYear() < 2025) continue;
    const rest = cells.slice(di + 1).filter(v => String(v).trim());
    const menuTxt = rest[0] || '', cantTxt = rest[1] || '';
    if(!menuTxt) continue;
    // menús: segmentos "Menú N: …"; lo demás con Descongelar/Remojar/Preparar → extra
    const segs = menuTxt.split(/(?=men[uú]\s*\d)/i).map(clean).filter(Boolean);
    const menus = [], extras = [];
    for(let s of segs){
      const em = s.match(/\b(Descongelar|Remojar|Preparar)\b[\s\S]*$/i);
      if(em){ extras.push(clean(em[0]).replace(/\.+$/,'')); s = clean(s.slice(0, em.index)); }
      if(/^men[uú]\s*\d/i.test(s)) menus.push(s.replace(/^men[uú]\s*(\d)\s*:?\s*/i,'Menú $1: ').replace(/\.+$/,''));
      else if(s && !menus.length) extras.push(s);   // texto suelto antes del primer menú
    }
    if(!menus.length && clean(menuTxt)) menus.push(clean(menuTxt).slice(0, 160));
    const wd = WD_ES2[d.getUTCDay()];
    if(wd !== 'jueves') continue;                    // la app usa las onces de los JUEVES
    const day = d.getUTCDate(), mon = d.getUTCMonth();
    out.push({ label: 'Jueves ' + day + ' de ' + MON[mon] + ' de ' + d.getUTCFullYear(),
      dt: day + ' ' + SHORT[mon], wd: 'jueves', menus, extra: extras.join(' · '), cant: clean(cantTxt) });
  }
  out.sort(byDate);
  return out;
}
async function fetchOnceData(){
  const html = await fetchText(ONCE_URL);
  const m = html.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if(m){
    console.log('  (formato Excel de Drive, id ' + m[1].slice(0,8) + '…)');
    const res = await fetch('https://drive.google.com/uc?export=download&id=' + m[1],
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CocinaSAET-sync/1.0)' } });
    if(!res.ok) throw new Error('HTTP ' + res.status + ' al bajar el Excel de onces');
    const buf = Buffer.from(await res.arrayBuffer());
    if(buf.slice(0, 2).toString() === 'PK') return parseOnceXlsx(buf);
    console.error('  (el archivo de Drive no es xlsx; intento formato texto)');
  }
  return parseOnce(html);   // respaldo: formato texto antiguo
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

/* ---------------- VIGILANTE DE CAMBIOS DEL SITIO ----------------
   Google Sites embebe la fecha de última modificación de cada página como
   timestamp epoch-ms dentro del HTML (el aviso "Última actualización: hace N días").
   Comparamos contra lo guardado en Firebase (cocina/doc/pageMods): si una página
   cambió, escribimos site-changes.md y el workflow crea un issue (llega correo).
   La primera corrida solo guarda la línea base, sin avisar. */
const SITE_BASE = 'https://sites.google.com/view/residencia-saet/cocina';
const WATCH_PAGES = {
  'Menú almuerzos':      ALM_URL,
  'Menú onces':          ONCE_URL,
  'Turnos interescuela': INTER_URL,
  'Encargado de turno':  SITE_BASE + '/encargado-de-turno',
  'Pautas generales':    SITE_BASE + '/pautas-generales',
  'Pautas clave':        SITE_BASE + '/pautas-clave',
  'Montaje':             SITE_BASE + '/montaje',
  'Desayuno':            SITE_BASE + '/desayuno',
};
function pageLastMod(html){
  const cut = Date.now() - 5*60*1000;   // descarta timestamps del render actual
  const ts = [...html.matchAll(/1[6-8]\d{11}/g)].map(m => +m[0]).filter(t => t < cut);
  return ts.length ? Math.max(...ts) : 0;
}
async function watchPages(){
  let stored = {};
  try{ const r = await fetch(DB + '/cocina/doc/pageMods.json'); if(r.ok) stored = (await r.json()) || {}; }catch(e){}
  const baseline = !Object.keys(stored).length;
  const nowMods = {}, changes = [];
  for(const [name, url] of Object.entries(WATCH_PAGES)){
    try{
      const mod = pageLastMod(await fetchText(url));
      if(!mod) continue;
      nowMods[name] = mod;
      if(!baseline && stored[name] && mod > stored[name]) changes.push({name, url, mod});
    }catch(e){ /* página caída hoy: se reintenta mañana */ }
  }
  const fmt = ms => new Date(ms).toLocaleString('es-CL', {timeZone:'America/Santiago', dateStyle:'full', timeStyle:'short'});
  if(changes.length){
    console.log(`  📰 ${changes.length} página(s) cambiaron:`);
    changes.forEach(c => console.log(`    • ${c.name} — ${fmt(c.mod)}`));
    const body = ['El sitio oficial de la Residencia SAET actualizó estas páginas:', '']
      .concat(changes.map(c => `- **${c.name}** — ${fmt(c.mod)}\n  ${c.url}`))
      .concat(['', 'Revisa si hay instrucciones nuevas que convenga reflejar en la app. Los menús/turnos se sincronizan solos; esto aplica a pautas, instrucciones y montaje.'])
      .join('\n');
    if(!process.env.DRY_RUN) require('fs').writeFileSync('site-changes.md', body);
  }else{
    console.log(baseline ? '  (primera corrida: guardo línea base, sin avisar)' : '  ✓ sin cambios en las páginas vigiladas.');
  }
  if(!process.env.DRY_RUN && Object.keys(nowMods).length){
    const put = await fetch(DB + '/cocina/doc/pageMods.json', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({}, stored, nowMods))});
    if(!put.ok) console.error('  (no pude guardar pageMods: HTTP ' + put.status + ')');
  }
}

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

  // VIGILANTE: ¿alguna página del sitio cambió desde la última corrida?
  try{
    console.log('▶ Vigilante de cambios del sitio…');
    await watchPages();
  }catch(e){ console.error('  (vigilante falló:', e.message, ') — no es fatal.'); }

  if(failed) process.exit(1);
  console.log('🌿 Sincronización completa.');
}

main().catch(e=>{ console.error('❌ Error general:', e.message); process.exit(1); });
