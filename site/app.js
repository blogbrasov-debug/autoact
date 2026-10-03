/* ============================================================
 * AutoAct | site | app.js
 * Flux: chestionar (5 pași) → POST către webhook-ul n8n →
 * ecranul Zero-Refund (taburi + câmpuri galbene editabile +
 * acord legal → buton de plată).
 * ============================================================ */
'use strict';

(function () {
  /* config.js e sursa reală a prețului; fallback-ul e doar pentru cazul
   * în care config.js nu se încarcă (nu mai e o a doua cifră de întreținut). */
  const cfg = window.AUTOACT_CONFIG || { WEBHOOK_URL: '', PRET_RON: Number(document.documentElement.dataset.pret) };
  /* Prețul are o singură față: 49 lei, TVA inclus — suma contractată și
   * suma încasată sunt identice, deci nu există conversie de valută. */
  const PRET_AFISAT = Number(cfg.PRET_RON) + ' lei';
  const V = window.AUTOACT_VALIDARE;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ======================= CHESTIONAR ======================= */
  const staret = { pas: 0, fisiere: {} };
  const TOTAL_PASI = 4; // 0..3

  $('#inp-data').value = new Date().toISOString().slice(0, 10);
  $('#hero-pret').textContent = PRET_AFISAT;
  $('#btn-plata').textContent = 'PLĂTEȘTE ' + PRET_AFISAT;

  function valideazaPas(n) {
    const err = $('#eroare-upload');
    err.hidden = true;
    if (n === 0) {
      if (!($('#doc-ci').checked && $('#doc-civ').checked && $('#doc-talon').checked)) {
        return 'Bifează toate cele trei tipuri de documente.';
      }
    }
    if (n === 1) {
      const lipsa = ['ci_fata', 'ci_verso', 'civ_fata', 'civ_verso', 'talon']
        .filter((c) => !staret.fisiere[c]);
      if (lipsa.length) return 'Încarcă încă: ' + lipsa.join(', ');
    }
    if (n === 2) {
      const p = Number($('#inp-pret').value);
      if (!p || p < 1) return 'Introdu prețul de vânzare (minim 1 RON).';
    }
    if (n === 3) {
      if (!$('#inp-data').value) return 'Introdu data tranzacției.';
      if (!$('#inp-oras').value.trim()) return 'Introdu orașul încheierii contractului.';
    }
    return null;
  }

  function goToPas(n) {
    staret.pas = n;
    $$('.pas').forEach((el) => { el.hidden = Number(el.dataset.pas) !== n; });
    $('#btn-back').hidden = n === 0;
    $('#btn-next').textContent = n === TOTAL_PASI ? 'Verifică datele →' : 'Continuă →';
    $('#progres-bara').style.width = ((n + 1) / (TOTAL_PASI + 1)) * 100 + '%';
  }

  $('#btn-next').addEventListener('click', async () => {
    const eroare = valideazaPas(staret.pas);
    if (eroare) {
      if (staret.pas === 1) { $('#eroare-upload').textContent = eroare; $('#eroare-upload').hidden = false; }
      else alert(eroare);
      return;
    }
    if (staret.pas < TOTAL_PASI) { goToPas(staret.pas + 1); return; }
    await trimiteSpreValidare();
  });
  $('#btn-back').addEventListener('click', () => goToPas(Math.max(0, staret.pas - 1)));

  $$('.upload-tile input[type="file"]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const camp = inp.dataset.camp;
      if (inp.files && inp.files[0]) {
        staret.fisiere[camp] = inp.files[0];
        const tile = inp.closest('.upload-tile');
        tile.classList.add('incărcat');
        tile.querySelector('.upload-stare').textContent = '✓ ' + inp.files[0].name.slice(0, 14);
      }
    });
  });

  $('#btn-demo').addEventListener('click', () => {
    randeazaPreview(window.AUTOACT_DEMO, true);
  });

  async function trimiteSpreValidare() {
    if (!cfg.WEBHOOK_URL) {
      randeazaPreview(window.AUTOACT_DEMO, true);
      return;
    }
    const btn = $('#btn-next');
    btn.disabled = true; btn.textContent = 'Se procesează…';
    try {
      const fd = new FormData();
      for (const [camp, fis] of Object.entries(staret.fisiere)) fd.append(camp, fis);
      fd.append('pret', $('#inp-pret').value);
      fd.append('data', $('#inp-data').value);
      fd.append('oras', $('#inp-oras').value.trim());
      fd.append('scutire', $('#inp-scutire').checked ? '1' : '0');
      const r = await fetch(cfg.WEBHOOK_URL, { method: 'POST', body: fd });
      const json = await r.json();
      randeazaPreview(json, false);
    } catch (e) {
      alert('Nu am putut procesa documentele: ' + e.message + '\nVerifică conexiunea și reîncearcă.');
    } finally {
      btn.disabled = false; btn.textContent = 'Verifică datele →';
    }
  }

  /* ======================= ZERO-REFUND ======================= */
  const VALIDATORI = {
    cnp: (v) => V.valideazaCNP(v).isValid,
    vin: (v) => V.valideazaVIN(v),
    placuta: (v) => V.valideazaPlacuta(v),
    serie_ci: (v) => V.valideazaSerieCI(v),
    numar_ci: (v) => V.valideazaNumarCI(v),
    numar_pozitiv: (v) => v !== '' && Number(v) >= 0,
    data: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    nenul: (v) => String(v).trim().length > 0,
    niciunul: () => true
  };

  const GRUPURI = [
    { cheie: 'vanzator', prefix: 'date_vanzator.', titlu: 'Vânzător' },
    { cheie: 'cumparator', prefix: 'date_cumparator.', titlu: 'Cumpărător' },
    { cheie: 'vehicul', prefix: 'date_vehicul.', titlu: 'Vehicul' },
    { cheie: 'tranzactie', prefix: 'date_tranzactie.', titlu: 'Tranzacție' }
  ];

  let stare = {};      // "cale.camp" → { val, validator, nesigur, manual, disabled, eroare }
  let tabActiv = 'vanzator';
  let esteDemo = false;
  let raspunsCurent = null;

  function obtineCale(obj, cale) {
    return cale.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function construiesteStare(r) {
    const s = {};
    const nesigare = new Set(r.campuri_nesigure || []);
    // Fallback Client pune datele sub cheia „date"; validatorul (nodul 5) le întoarce la rădăcină — acceptăm ambele
    const date = r.date || r;
    const persoane = [['date_vanzator', 'vanzator'], ['date_cumparator', 'cumparator']];
    const campuriPersoana = [
      ['nume_complet', 'text', 'Nume complet'], ['cnp', 'text', 'CNP'],
      ['serie_ci', 'text', 'Serie CI'], ['numar_ci', 'text', 'Număr CI'],
      ['adresa', 'text', 'Adresă'], ['localitate', 'text', 'Localitate'], ['judet', 'text', 'Județ']
    ];
    for (const [grup] of persoane) {
      for (const [camp, tip, eticheta] of campuriPersoana) {
        const cale = grup + '.' + camp;
        s[cale] = {
          val: String(obtineCale(date, cale) ?? ''),
          tip, eticheta,
          validator: camp === 'cnp' ? 'cnp' : camp === 'serie_ci' ? 'serie_ci' : camp === 'numar_ci' ? 'numar_ci' : 'nenul',
          nesigur: nesigare.has(cale),
          disabled: camp === 'cnp' && r.cnp_valid_tot === true
        };
      }
    }
    const vehicul = [
      ['marca', 'Marca', 'nenul'], ['model', 'Model', 'nenul'],
      ['vin', 'VIN', 'vin'], ['numar_inmatriculare', 'Plăcuță', 'placuta'],
      ['an_fabricatie', 'An fabricație', 'numar_pozitiv'], ['cilindree_cm', 'Cilindree (cm³)', 'numar_pozitiv'],
      ['putere_kw', 'Putere (kW)', 'numar_pozitiv'], ['masa_maxima_kg', 'Masa max (kg)', 'numar_pozitiv'],
      ['odometru_km', 'Odometru (km)', 'numar_pozitiv'], ['tip_combustibil', 'Combustibil', 'nenul']
    ];
    for (const [camp, eticheta, validator] of vehicul) {
      const cale = 'date_vehicul.' + camp;
      s[cale] = {
        val: String(obtineCale(date, cale) ?? ''), tip: 'text', eticheta, validator,
        nesigur: nesigare.has(cale), disabled: false
      };
    }
    s['date_tranzactie.suma_ron'] = {
      val: String(obtineCale(date, 'date_tranzactie.suma_ron') ?? $('#inp-pret').value ?? ''),
      tip: 'number', eticheta: 'Preț de vânzare (RON)', validator: 'numar_pozitiv', nesigur: false, disabled: false
    };
    s['date_tranzactie.data_vanzarii'] = {
      val: String(obtineCale(date, 'date_tranzactie.data_vanzarii') ?? $('#inp-data').value ?? ''),
      tip: 'date', eticheta: 'Data tranzacției', validator: 'data', nesigur: false, disabled: false
    };
    s['date_tranzactie.localitate_incheiere'] = {
      val: String(obtineCale(date, 'date_tranzactie.localitate_incheiere') ?? $('#inp-oras').value ?? ''),
      tip: 'text', eticheta: 'Oraș încheiere', validator: 'nenul', nesigur: false, disabled: false
    };
    s['date_tranzactie.scutire_taxa_sub_24_luni'] = {
      val: String(obtineCale(date, 'date_tranzactie.scutire_taxa_sub_24_luni') ?? ($('#inp-scutire').checked ? 'true' : 'false')),
      tip: 'checkbox', eticheta: 'Sub 24 luni (scutire taxă)', validator: 'niciunul', nesigur: false, disabled: false
    };
    return s;
  }

  function randeazaPreview(r, demo) {
    esteDemo = demo;
    raspunsCurent = r;
    stare = construiesteStare(r);
    $('#ecran-chestionar').hidden = true;
    $('#ecran-preview').hidden = false;
    $('#scor-val').textContent = String(r.scor_calitate ?? '—');
    const badge = $('.badge-scor');
    badge.classList.toggle('ok', (r.scor_calitate ?? 0) >= 95);
    badge.classList.toggle('rau', (r.scor_calitate ?? 0) < 80);
    const mesaj = $('#mesaj-client');
    if (r.mesaj_client) { mesaj.textContent = r.mesaj_client; mesaj.hidden = false; }
    else mesaj.hidden = true;
    tabActiv = 'vanzator';
    $$('.tab').forEach((t) => t.classList.toggle('tab-activ', t.dataset.tab === 'vanzator'));
    randeazaTab();
  }

  function randeazaTab() {
    const grup = GRUPURI.find((g) => g.cheie === tabActiv);
    const container = $('#tab-continut');
    container.innerHTML = '';
    for (const [cale, meta] of Object.entries(stare)) {
      if (!cale.startsWith(grup.prefix)) continue;
      const rand = document.createElement('div');
      const invalid = !VALIDATORI[meta.validator](meta.val);
      rand.className = 'rand-camp' + (invalid ? ' invalid' : meta.nesigur ? ' nesigur' : '');

      const et = document.createElement('div');
      et.className = 'eticheta'; et.textContent = meta.eticheta;
      rand.appendChild(et);

      const wrap = document.createElement('div');
      wrap.className = 'valoare-wrap';

      if (meta.tip === 'checkbox') {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = meta.val === 'true';
        cb.addEventListener('change', () => { meta.val = cb.checked ? 'true' : 'false'; actualizeazaTot(); });
        wrap.appendChild(cb);
      } else {
        const inp = document.createElement('input');
        inp.type = meta.tip;
        inp.className = 'valoare';
        inp.value = meta.val;
        inp.disabled = meta.disabled;
        if (['cnp', 'vin', 'serie_ci', 'placuta'].includes(meta.validator) || meta.validator === 'numar_ci') {
          inp.autocapitalize = 'characters';
          inp.addEventListener('input', () => {
            meta.val = inp.value.toUpperCase();
            inp.value = meta.val;
            actualizeazaRand(rand, cale, meta);
          });
        } else {
          inp.addEventListener('input', () => {
            meta.val = inp.value;
            actualizeazaRand(rand, cale, meta);
          });
        }
        wrap.appendChild(inp);
      }

      const badge = document.createElement('span');
      badge.className = 'badge';
      rand.appendChild(wrap);
      rand.appendChild(badge);
      actualizeazaBadge(rand, cale, meta);
      container.appendChild(rand);

      if (cale.endsWith('.cnp')) {
        const erori = raspunsCurent.cnp_erori || [];
        const eroareMea = erori.length ? erori.join(' ') : '';
        if (eroareMea) {
          const p = document.createElement('div');
          p.className = 'eroare-camp';
          p.textContent = eroareMea;
          container.appendChild(p);
        }
      }
    }
    actualizeazaTot();
  }

  function actualizeazaBadge(rand, cale, meta) {
    const badge = rand.querySelector('.badge');
    const invalid = !VALIDATORI[meta.validator](meta.val);
    badge.classList.remove('badge-verde', 'badge-galben', 'badge-rosu');
    if (invalid) { badge.classList.add('badge-rosu'); badge.textContent = '✗ invalid'; }
    else if (meta.nesigur) { badge.classList.add('badge-galben'); badge.textContent = '⚠ verifică'; }
    else if (meta.disabled) { badge.classList.add('badge-verde'); badge.textContent = '✓ validat'; }
    else { badge.classList.add('badge-verde'); badge.textContent = '✓ OCR'; }
  }

  function actualizeazaRand(rand, cale, meta) {
    const invalid = !VALIDATORI[meta.validator](meta.val);
    if (invalid) rand.classList.add('invalid'); else rand.classList.remove('invalid');
    if (meta.nesigur && !invalid) {
      // prima editare a unui câmp galben îl trece în verificat (clientul și-a asumat corectura)
      meta.nesigur = false;
      rand.classList.remove('nesigur');
    }
    actualizeazaBadge(rand, cale, meta);
    actualizeazaTot();
  }

  function conteaza() {
    let galbene = 0, rosii = 0;
    const perGrup = {};
    for (const [cale, meta] of Object.entries(stare)) {
      const grup = GRUPURI.find((g) => cale.startsWith(g.prefix));
      const invalid = !VALIDATORI[meta.validator](meta.val);
      perGrup[grup.cheie] = perGrup[grup.cheie] || { g: 0, r: 0 };
      if (invalid) { rosii++; perGrup[grup.cheie].r++; }
      else if (meta.nesigur) { galbene++; perGrup[grup.cheie].g++; }
    }
    return { galbene, rosii, perGrup };
  }

  function actualizeazaTot() {
    const { galbene, rosii, perGrup } = conteaza();
    $$('.tab').forEach((t) => {
      const c = perGrup[t.dataset.tab] || { g: 0, r: 0 };
      t.innerHTML = (GRUPURI.find((g) => g.cheie === t.dataset.tab).titlu) +
        (c.g + c.r ? ' <span class="bulina">' + (c.r ? '✗' + c.r + ' ' : '') + (c.g ? '⚠' + c.g : '') + '</span>' : '');
    });
    const rez = $('#rezumat-campuri');
    rez.innerHTML =
      (galbene ? '<span class="rez-galben">⚠ ' + galbene + ' câmpuri de verificat (galben)</span> · ' : '') +
      (rosii ? '<span class="rez-rosu">✗ ' + rosii + ' câmpuri invalide (roșu)</span> · ' : '') +
      '<span class="rez-verde">✓ ' + (Object.keys(stare).length - galbene - rosii) + ' câmpuri OK</span>';
    const acord = $('#acord-client').checked;
    $('#btn-plata').disabled = !(acord && galbene === 0 && rosii === 0);
  }

  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    tabActiv = t.dataset.tab;
    $$('.tab').forEach((x) => x.classList.toggle('tab-activ', x === t));
    randeazaTab();
  }));

  $('#acord-client').addEventListener('change', actualizeazaTot);

  $('#btn-plata').addEventListener('click', async () => {
    if (esteDemo) { alert('DEMO: aici s-ar deschide pagina de plată Stripe pentru ' + PRET_AFISAT + ' (TVA inclus).'); return; }
    const payload = {
      id_tranzactie: raspunsCurent.id_tranzactie || null,
      acord_client: true,
      date_corectate: Object.fromEntries(Object.entries(stare).map(([c, m]) => [c, m.val])),
      suma: cfg.PRET_RON,
      moneda: 'RON'
    };
    const btn = $('#btn-plata');
    btn.disabled = true; btn.textContent = 'Se inițiază plata…';
    try {
      const r = await fetch(cfg.WEBHOOK_URL.replace('/test-ui', '/plata'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (j.url_plata) window.location.href = j.url_plata;
      else alert('Răspuns neașteptat de la server: ' + JSON.stringify(j));
    } catch (e) {
      alert('Eroare la inițierea plății: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'PLĂTEȘTE ' + PRET_AFISAT;
    }
  });

  goToPas(0);
})();
