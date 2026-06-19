/* ============================================================================
   Cocina SAET · Sincronización automática de ONCES desde el sitio web
   ----------------------------------------------------------------------------
   Lee la página pública de onces de Residencia SAET, extrae los menús de los
   JUEVES (menús, descongelar, cantidades) y los escribe en Firebase Realtime
   Database (cocina/doc/onceDays). La app los lee en vivo → se actualiza sola.

   Se ejecuta solo (GitHub Actions, ver .github/workflows/sync-menus.yml).
   Seguridad: NO escribe si el parseo no pasa los chequeos de sanidad, así un
   cambio en la web nunca borra los datos buenos.
============================================================================ */

const ONCE_URL = 'https://sites.google.com/view/residencia-saet/cocina/once-cena/men%C3%BA-onces';
const DB = 'https://cocina-saet-default-rtdb.firebaseio.com';
const ONCE_PATH = '/cocina/doc/onceDays.json';

const MON = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function clean(s){return String(s||'').replace(/\s+/g,' ').replace(/\s+([.,;:])/g,'$1').trim();}

function htmlToText(html){
  html = html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  return html.replace(/<[^>]+>/g,' ')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
    .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
    .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
    .replace(/\s+/g,' ');
}

function parseOnce(html){
  const t = htmlToText(html);
  const dayHdr = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+2026/gi;
  let m, heads = [];
  while(m = dayHdr.exec(t)) heads.push({i:m.index, end:dayHdr.lastIndex, wd:m[1].toLowerCase(), day:+m[2], mon:m[3].toLowerCase()});
  const out = [];
  for(let k=0;k<heads.length;k++){
    const h = heads[k];
    if(!/^juev/.test(h.wd)) continue;
    const body = t.slice(h.end, k+1<heads.length ? heads[k+1].i : t.length);
    // menús numerados "Menú N: ..."
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
    if(ex) extra = 'Descongelar ' + clean(ex[1]).replace(/^\s+/,'').replace(/\.$/,'');
    let cant = '';
    const cz = body.match(/Cantidades\s*:?\s*([^]*)$/i);
    if(cz) cant = clean(cz[1]);
    const idx = MON.indexOf(h.mon);
    out.push({label:'Jueves '+h.day+' de '+h.mon+' de 2026', dt:h.day+' '+SHORT[idx], wd:'jueves', menus, extra, cant});
  }
  // ordenar por fecha
  out.sort((a,b)=>{
    const pa=a.label.match(/(\d+) de (\w+)/), pb=b.label.match(/(\d+) de (\w+)/);
    return (MON.indexOf(pa[2])*100+ +pa[1]) - (MON.indexOf(pb[2])*100+ +pb[1]);
  });
  return out;
}

function sane(list){
  if(!Array.isArray(list) || list.length < 2) return false;
  return list.every(o => o.label && o.dt && Array.isArray(o.menus) && o.menus.length >= 1);
}

async function main(){
  console.log('▶ Leyendo onces desde el sitio web…');
  const res = await fetch(ONCE_URL, {headers:{'User-Agent':'Mozilla/5.0 (compatible; CocinaSAET-sync/1.0)'}});
  if(!res.ok) throw new Error('No pude leer el sitio: HTTP '+res.status);
  const html = await res.text();
  const parsed = parseOnce(html);
  console.log(`  Encontré ${parsed.length} jueves: ${parsed.map(o=>o.dt).join(', ')}`);

  if(!sane(parsed)){
    console.error('✋ El parseo no pasó los chequeos de sanidad. NO escribo nada (datos a salvo).');
    process.exit(1);
  }

  // comparar con lo que ya está en la nube para no escribir de más
  let current = null;
  try{
    const c = await fetch(DB + ONCE_PATH);
    if(c.ok) current = await c.json();
  }catch(e){ /* si falla la lectura, igual intentamos escribir */ }

  if(current && JSON.stringify(current) === JSON.stringify(parsed)){
    console.log('✓ La nube ya está al día. Nada que actualizar.');
    return;
  }

  console.log('☁ Escribiendo onces actualizadas en Firebase…');
  const put = await fetch(DB + ONCE_PATH, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(parsed)
  });
  if(!put.ok){
    const body = await put.text().catch(()=> '');
    throw new Error('Firebase rechazó la escritura: HTTP '+put.status+' '+body);
  }
  console.log('✅ Listo. La app mostrará las onces nuevas automáticamente.');
}

main().catch(e=>{ console.error('❌ Error:', e.message); process.exit(1); });
