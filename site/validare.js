/* ============================================================
 * AutoAct | site | validare.js
 * Validatori partajați pentru UI — SURSA DE ADEVĂR este
 * module-2/cnp-validator.code-node.js; scriptul
 * verifica-ui-validare.js (rădăcină) testează că ambele
 * implementări dau aceleași rezultate pe Test Data Kit.
 * ============================================================ */
'use strict';
(function () {
  function valideazaCNP(cnp) {
    const out = { cnp: String(cnp == null ? '' : cnp), isValid: false, erori: [], meta: null };
    if (!/^[0-9]{13}$/.test(out.cnp)) {
      out.erori.push('CNP invalid: trebuie să fie un string de exact 13 cifre.');
      return out;
    }
    const cifre = out.cnp.split('').map(Number);
    const S = cifre[0];
    const an = (S === 1 || S === 2 ? 1900 : S === 3 || S === 4 ? 1800 : 2000) + parseInt(out.cnp.slice(1, 3), 10);
    const luna = parseInt(out.cnp.slice(3, 5), 10);
    const zi = parseInt(out.cnp.slice(5, 7), 10);
    const judet = parseInt(out.cnp.slice(7, 9), 10);
    if (S < 1 || S > 6) out.erori.push('Prima cifră (S) este în afara intervalului 1–6.');
    const d = new Date(an, luna - 1, zi);
    const dataReal = d.getFullYear() === an && d.getMonth() === luna - 1 && d.getDate() === zi;
    if (!dataReal) out.erori.push('Data de naștere (AA/LL/ZZ) nu există în calendar.');
    if (judet < 1 || judet > 52) out.erori.push('Codul de județ (JJ) trebuie să fie 01–52.');
    if (out.erori.length > 0) return out;
    const CHEIE = '279146358279'.split('').map(Number);
    let suma = 0;
    for (let i = 0; i < 12; i++) suma += cifre[i] * CHEIE[i];
    const rest = suma % 11;
    const cifraControl = rest === 10 ? 1 : rest;
    if (cifraControl !== cifre[12]) {
      out.erori.push('Cifră de control incorectă (poziția 13). Așteptat: ' + cifraControl + '.');
      return out;
    }
    out.isValid = true;
    out.meta = {
      sex: S % 2 === 1 ? 'masculin' : 'feminin',
      an_nastere: an, luna_nastere: luna, zi_nastere: zi, judet_nastere: judet
    };
    return out;
  }

  function valideazaVIN(vin) {
    return typeof vin === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  }

  function valideazaPlacuta(p) {
    return typeof p === 'string' && /^[A-Z]{1,2}-[0-9]{2,3}-[A-Z]{3}$/.test(p);
  }

  function valideazaSerieCI(s) {
    return typeof s === 'string' && /^[A-Z]{2}$/.test(s);
  }

  function valideazaNumarCI(n) {
    return typeof n === 'string' && /^[0-9]{6}$/.test(n);
  }

  const AUTOACT_VALIDARE = { valideazaCNP, valideazaVIN, valideazaPlacuta, valideazaSerieCI, valideazaNumarCI };

  if (typeof module !== 'undefined' && module.exports) module.exports = AUTOACT_VALIDARE;
  else window.AUTOACT_VALIDARE = AUTOACT_VALIDARE;
})();
