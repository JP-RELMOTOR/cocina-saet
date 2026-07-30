const test = require('node:test');
const assert = require('node:assert/strict');
const { dayHeads, parseOnce, parseAlm, parseDays, parseInter } = require('../scripts/sync-menus.js');

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

test('extrae turnos interescuela', () => {
  const rows = parseInter('Miércoles 07/01 Juan Pérez María Soto SEMANA');
  assert.deepEqual(rows, [{ dt: '7 ene', wd: 'miércoles', team: ['Juan Pérez María Soto'] }]);
});
