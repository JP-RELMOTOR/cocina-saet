const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function splitItems('),html.indexOf('/* checks PERSISTENTES'));
const splitItems=vm.runInNewContext(source+';splitItems;');
test('el checklist conserva cantidades decimales y millares',()=>{
  const items=Array.from(splitItems('3,5 kg de vacuno. 4,5 kg de pechuga de pollo. 1.750 g de arroz, 1,260 g de atún.'));
  assert.deepEqual(items,['3,5 kg de vacuno','4,5 kg de pechuga de pollo','1.750 g de arroz','1,260 g de atún']);
});
test('el checklist mantiene las opciones entre paréntesis y separa ingredientes',()=>{
  assert.deepEqual(Array.from(splitItems('50 pescados (reineta, merluza), 20 huevos. 10 kg de papas.')),['50 pescados (reineta, merluza)','20 huevos','10 kg de papas']);
});
