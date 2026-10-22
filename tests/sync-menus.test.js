const test = require('node:test');
const assert = require('node:assert/strict');
const { dayHeads, parseOnce, parseAlm, parseDays, parseInter, saneAlm, saneInter, lunchMenuLinks, fetchLunchData } = require('../scripts/sync-menus.js');

test('detecta encabezados de cualquier año', () => {
  const heads = dayHeads('Jueves, 8 de enero de 2027');
  assert.equal(heads.length, 1);
  assert.deepEqual({ day: heads[0].day, mon: heads[0].mon, year: heads[0].year }, { day: 8, mon: 'enero', year: 2027 });
});

test('extrae onces futuras sin fijar el año', () => {
  const rows = parseOnce('Jueves, 8 de enero de 2027 Menú 1: Sopa y pan. Descongelar pollo. Cantidades: 4 kg de pollo. Viernes, 9 de enero de 2027');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'Jueves 8 de enero de 2027');
  assert.deepEqual(rows[0].menus, ['Menú 1: Sopa y pan']);
  assert.equal(rows[0].extra, 'Descongelar pollo');
});

test('reconoce el formato "Menú: 1:" del sitio oficial', () => {
  const rows = parseOnce('jueves 30 de julio de 2026 Menú: 1: Empanada de pino (90 unidades). Menú 2: Alitas de pollo. (Descongelar pino de empanadas) Cantidades: 90 unidades. viernes 31 de julio de 2026');
  assert.deepEqual(rows[0].menus, ['Menú 1: Empanada de pino (90 unidades)', 'Menú 2: Alitas de pollo']);
  assert.match(rows[0].extra, /Descongelar pino de empanadas/);
});

test('extrae almuerzo y calendario futuros', () => {
  const html = 'Jueves, 8 de enero de 2027 Congregación Norte Menú principal: Guiso de lentejas. Ensaladas: Tomate. Insumo principal: 4 kg de lentejas. Insumo ensaladas: 3 kg de tomates. Viernes, 9 de enero de 2027 Congregación Sur Menú principal: Arroz. Ensaladas: Lechuga. Insumo principal: 3 kg de arroz. Insumo ensaladas: 2 lechugas.';
  const lunches = parseAlm(html);
  const days = parseDays(html);
  assert.equal(lunches[0].label, 'Jueves 8 de enero de 2027');
  assert.equal(lunches[0].dish, 'Guiso de lentejas');
  assert.equal(days.length, 2);
  assert.equal(days[1].dt, '9 ene');
});

test('acepta una ventana corta de almuerzos (el sitio publica pocas semanas)', () => {
  const html = 'Jueves, 8 de enero de 2027 Menú principal: Guiso de lentejas. Ensaladas: Tomate. Insumo principal: 4 kg de lentejas. Insumo ensaladas: 3 kg de tomates. Viernes, 9 de enero de 2027';
  const lunches = parseAlm(html);
  assert.equal(lunches.length, 1);
  assert.equal(saneAlm(lunches), true);
});

test('rechaza almuerzos sin plato ni insumos (formato cambiado)', () => {
  assert.equal(saneAlm([{ label: 'Jueves 8 de enero de 2027', dish: '', cant: '' }]), false);
  assert.equal(saneAlm([]), false);
});

test('extrae turnos interescuela', () => {
  const rows = parseInter('Miércoles 07/01 Juan Pérez María Soto SEMANA');
  assert.deepEqual(rows, [{ dt: '7 ene', wd: 'miércoles', team: ['Juan Pérez María Soto'] }]);
});

test('sigue el menú vigente de otra escuela en vez de la dirección retirada', async t => {
  const base = 'https://sites.google.com';
  const index = base + '/view/residencia-saet/cocina/almuerzo';
  const path = '/view/residencia-saet/cocina/almuerzo/menú-esce-21';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    if(url === index) return new Response(`<a href="${path}">Menú</a><a href="${path}">Repetido</a>`);
    if(url === encodeURI(base + path)) return new Response('Menú publicado');
    return new Response('', {status:404});
  });
  const result = await fetchLunchData();
  assert.equal(result.html, 'Menú publicado');
  assert.deepEqual(calls, [index, encodeURI(base + path)]);
});

test('descubre solo menús de almuerzo del sitio oficial', () => {
  const html = `<a href="/view/residencia-saet/cocina/almuerzo/men%C3%BA-esce-20">Actual</a>
    <a href="https://otro.example/view/residencia-saet/cocina/almuerzo/menú-esce-20">Ajeno</a>
    <a href="/view/residencia-saet/cocina/once-cena/menú-onces">Once</a>
    <a href="/view/residencia-saet/aseo/turnos/turnos-esce-20">Aseo</a>`;
  assert.deepEqual(lunchMenuLinks(html), ['https://sites.google.com/view/residencia-saet/cocina/almuerzo/men%C3%BA-esce-20']);
});

test('no elige arbitrariamente entre dos menús enlazados', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    '<a href="/view/residencia-saet/cocina/almuerzo/menú-esce-20">20</a><a href="/view/residencia-saet/cocina/almuerzo/menú-esce-21">21</a>'
  ));
  await assert.rejects(fetchLunchData(), /varios menús/);
});

test('lee ESCE 20 separando plato, ensaladas e ingredientes decimales', () => {
  const html = 'Jueves, 22 de octubre de 2026 Menú almuerzo: Carne al jugo con pastelera de choclo. Ens. Chilena / betarraga cocida Ingredientes: - 9,6 kg de vacuno, 1,6 kg zanahoria. - Ensaladas: 3,2 kg de tomates, 12 betarragas. SEMANA 1 Viernes, 23 de octubre de 2026';
  const [lunch] = parseAlm(html);
  assert.equal(lunch.dish, 'Carne al jugo con pastelera de choclo');
  assert.equal(lunch.ens, 'Chilena / betarraga cocida');
  assert.equal(lunch.cant, '9,6 kg de vacuno, 1,6 kg zanahoria. - Ensaladas: 3,2 kg de tomates, 12 betarragas');
  assert.equal(saneAlm([lunch]), true);
  const [day] = parseDays(html);
  assert.equal(day.dt, '22 oct');
  assert.equal(day.dish, lunch.dish);
  assert.equal(day.ens, lunch.ens);
  assert.equal(day.cant, lunch.cant);
});

test('no publica un menú ESCE incompleto como si estuviera validado', () => {
  const html = 'Jueves, 22 de octubre de 2026 Menú almuerzo: Carne al jugo. Ens. Chilena. 9,6 kg de carne.';
  assert.equal(saneAlm(parseAlm(html)), false);
  assert.deepEqual(parseDays(html), []);
});

test('lee fechas partidas por etiquetas de Google Sites y recupera todos los turnos', () => {
  const html = 'Martes <span>0</span><span>6</span> / 10 👩‍🍳 Benjamín Zamorano👩‍🍳 Paula Zamorano SEMANA Jueves 25 /<span>0</span> <span>9</span> 👨‍🍳 Erick Muñoz 👩‍🍳 Francisca Muñoz ➖';
  const rows = parseInter(html);
  assert.deepEqual(rows, [
    {dt:'6 oct', wd:'martes', team:['Benjamín Zamorano','Paula Zamorano']},
    {dt:'25 sep', wd:'jueves', team:['Erick Muñoz','Francisca Muñoz']}
  ]);
  assert.equal(saneInter(rows), true);
});

test('rechaza meses y días imposibles en turnos', () => {
  const html = 'Martes 06/00 👩‍🍳 Paula Zamorano Jueves 32/10 👩‍🍳 Francisca Muñoz Viernes 31/04 👩‍🍳 Marcela Figueroa';
  assert.deepEqual(parseInter(html), []);
  assert.equal(saneInter([{dt:'25 undefined', team:['Erick Muñoz']}]), false);
});

const {readFileSync}=require('node:fs');
const {onceDayHeads,saneOnce,assertCurrentOnce,syncSection,fetchOnceData}=require('../scripts/sync-menus');
const onceFixture=readFileSync(require('node:path').join(__dirname,'fixtures/onces-octubre-2026.txt'),'utf8');
test('lee las cinco onces reales sin año y conserva platos y cantidades',()=>{
  const rows=parseOnce(onceFixture);
  assert.deepEqual(rows.map(x=>x.label),['Jueves 22 de octubre de 2026','Jueves 29 de octubre de 2026','Jueves 5 de noviembre de 2026','Jueves 12 de noviembre de 2026','Jueves 19 de noviembre de 2026']);
  assert.deepEqual(rows[0].menus,['Menú 1: Shawarma de pollo y vacuno']);
  assert.match(rows[0].cant,/61 unidades/);assert.match(rows[0].cant,/4,5 kg de pechuga/);
  assert.deepEqual(rows[1].menus,['Empanada','Consomé']);
  assert.deepEqual(rows[2].menus,['Pizza','Menú 2: Consomé']);
  assert.match(rows[3].cant,/50 unidades/);
  assert.ok(rows.every(x=>x.cant&&!/SEMANA|REVISIÓN|Google Sites/.test(x.cant)));
  assert.equal(saneOnce(rows),true);assert.doesNotThrow(()=>assertCurrentOnce(rows,new Date('2026-10-22T12:00:00Z')));
});
test('lee las fechas separadas por etiquetas y no mezcla el día siguiente',()=>{
  const rows=parseOnce('<b>Jueves</b> <span>22 de octubre</span><p>Menú:</p><p>Menú 1: Shawarma</p><p>Cantidades: 61 panes.</p><b>Viernes 23 de octubre</b> Menú: Atún. SAET - REVISIÓN OCTUBRE 2026');
  assert.deepEqual(rows[0].menus,['Menú 1: Shawarma']);assert.equal(rows[0].cant,'61 panes');
});
test('acepta una sola once publicada válida',()=>{
  const rows=parseOnce('Jueves 22 de octubre de 2026 Menú: Pizza. Cantidades: 1 kg de queso.');
  assert.equal(saneOnce(rows),true);
});
test('resuelve el cambio de año con la revisión de la fuente',()=>{
  const heads=onceDayHeads('Jueves 31 de diciembre Menú: Pizza. Jueves 7 de enero Menú: Sopa. SAET - REVISIÓN DICIEMBRE 2026');
  assert.deepEqual(heads.map(h=>h.year),[2026,2027]);
});
test('rechaza fechas ambiguas o incompatibles y lecturas vacías sin borrar datos',()=>{
  assert.throws(()=>parseOnce('Jueves 22 de octubre Menú: Pizza'),/sin año/);
  assert.throws(()=>parseOnce('Jueves 23 de octubre Menú: Pizza SAET - REVISIÓN OCTUBRE 2026'),/incompatible/);
  assert.throws(()=>assertCurrentOnce([]),/vacía/);
  assert.equal(saneOnce([{label:'Jueves 31 de febrero de 2026',dt:'31 feb',menus:['Pizza']}]),false);
  const incomplete=parseOnce('Jueves 22 de octubre de 2026 Cantidades: 61 panes');
  assert.throws(()=>assertCurrentOnce(incomplete),/incompleta/);
});
test('no reporta éxito si la fuente solo tiene onces vencidas',()=>{
  assert.throws(()=>assertCurrentOnce(parseOnce(onceFixture),new Date('2026-11-20T12:00:00Z')),/vencidas/);
});
test('fetchOnceData detecta la página de texto actual sin depender del Excel anterior',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(onceFixture));
  const rows=await fetchOnceData();assert.equal(rows.length,5);assert.equal(rows[2].menus[0],'Pizza');
});
test('no reescribe datos iguales aunque Firebase reordene claves',async t=>{
  const data=[{label:'jueves',menus:['Pizza']}];const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options?.method||'GET');return Response.json([{menus:['Pizza'],label:'jueves'}]);});
  await syncSection('Onces','/test.json',data);assert.deepEqual(calls,['GET']);
});
test('verifica la escritura y detecta si Firebase no conserva lo enviado',async t=>{
  const data=[{label:'jueves',menus:['Pizza']}];let reads=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options?.method==='PUT')return Response.json(data);
    reads++;return Response.json(null);
  });
  await assert.rejects(syncSection('Onces','/test.json',data),/verificar/);assert.equal(reads,2);
});
