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
