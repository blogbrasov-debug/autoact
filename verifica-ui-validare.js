/**
 * AutoAct | Test cruce UI ↔ n8n
 * Verifică că validare.js (folosit de UI) și cnp-validator.code-node.js
 * (nodul 5 al workflow-ului) dau aceleași rezultate pe Test Data Kit
 * + cazuri negative. Rulare: node verifica-ui-validare.js
 */
'use strict';
const { valideazaCNP } = require('./site/validare.js');
const { valideazaCNP: valideazaCNPn8n } = require('./module-2/cnp-validator.code-node.js');

let fail = 0;
const assert = (cond, msg) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg);
  if (!cond) fail++;
};

const kit = JSON.parse(require('fs').readFileSync('./module-1/test-data-kit.json', 'utf8')).intrari;

for (const intrare of kit) {
  const a = valideazaCNP(intrare.cnp);
  const b = valideazaCNPn8n(intrare.cnp);
  assert(a.isValid === true && b.isValid === true, 'kit #' + intrare.id_test + ' (' + intrare.cnp + ') valid în ambele implementări');
  assert(JSON.stringify(a) === JSON.stringify(b), 'kit #' + intrare.id_test + ' output identic UI ↔ n8n');
}

// cazuri negative — același rezultat în ambele implementări
const negative = ['', '123', '17503144112310', '9750314411231', '1750314411230', '1650229410909'];
for (const cnp of negative) {
  const a = valideazaCNP(cnp);
  const b = valideazaCNPn8n(cnp);
  assert(a.isValid === false && b.isValid === false, 'negativ "' + cnp + '" respins de ambele');
  assert(JSON.stringify(a) === JSON.stringify(b), 'negativ "' + cnp + '" output identic');
}

// validatorii de UI există și funcționează
const V = require('./site/validare.js');
assert(V.valideazaVIN('VF1RFA00567890123') === true, 'VIN valid acceptat');
assert(V.valideazaVIN('VF1RFA00I67890123') === false, 'VIN cu I respins');
assert(V.valideazaPlacuta('B-123-ABC') === true, 'Plăcuță validă acceptată');
assert(V.valideazaPlacuta('B123ABC') === false, 'Plăcuță fără liniuțe respinsă');
assert(V.valideazaSerieCI('RX') === true, 'Serie CI validă');
assert(V.valideazaSerieCI('rx') === false, 'Serie CI minuscule respinsă');
assert(V.valideazaNumarCI('123456') === true, 'Număr CI valid');
assert(V.valideazaNumarCI('12345') === false, 'Număr CI 5 cifre respins');

console.log(fail === 0 ? '\nCOMPATIBILITATE UI ↔ n8n CONFIRMATĂ ✔' : '\n' + fail + ' EȘUURI ✘');
process.exit(fail === 0 ? 0 : 1);
