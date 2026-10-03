/* ============================================================
 * AutoAct | module-5 | test-e2e-idempotency.js
 * SCENARIUL 5 al suitei E2E — idempotency pe order_id contra unui
 * PostgreSQL REAL (container docker efemer, postgres:16-alpine —
 * aceeași imagine ca în producție, Modulul 3).
 *
 * Ce este REAL:
 *   ✔ query-ul CTE extras direct din autoact-workflow-plati.json
 *     (nodul „Idempotenta (Postgres)"), doar cu env substituite;
 *   ✔ PG real: constraint, index, ON CONFLICT, tranzacții — nimic mock-uit;
 *   ✔ schema aplicată chiar din module-5/plati-schema.sql.
 *
 * Ce verifică:
 *   1. prima plată → duplicat = 0 (fluxul continuă spre facturare);
 *   2. aceeași plată, repetată → duplicat = 1 (fluxul se oprește);
 *   3. exact 1 rând în plati_procesate, exact 1 rând returned mereu
 *      (IF-ul din workflow nu rămâne niciodată fără input);
 *   4. rezultat IDENTIC la 10 re-rulări (stabilitate);
 *   5. tranzacții diferite NU se blochează reciproc (izolare pe order_id).
 *
 * Prerechizită: Docker pornit local. Fără Docker, testul sare cu skip.
 * Rulare:  node module-5/test-e2e-idempotency.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
/* Prețul vine din SURSĂ (site/config.js) — altfel testul ar trece și
 * după o schimbare de preț, desincronizat de workflow-ul de plăți. */
const { PRET_RON } = require('../config-autoact.js');
const SUMA_DB = PRET_RON.toFixed(2);

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (detaliu && !cond ? '  [' + detaliu + ']' : ''));
  if (!cond) esecuri++;
};

/* ---------- 1. Docker disponibil? (altfel: skip curat) ---------- */
let dockerOk = true;
try { execSync('docker info', { stdio: 'pipe' }); } catch (e) { dockerOk = false; }
if (!dockerOk) {
  console.log('SKIP  Docker indisponibil — scenariul 5 (idempotency PG) rulează doar cu Docker pornit.');
  console.log('      CI-ul (ubuntu-latest) are Docker preinstalat, deci acolo rulează garantat.');
  process.exit(0);
}

/* ---------- 2. Query-ul REAL din workflow (nodul „Idempotenta (Postgres)") ---------- */
const WF = JSON.parse(fs.readFileSync(path.join(__dirname, 'autoact-workflow-plati.json'), 'utf8'));
const nodIdem = WF.nodes.find((n) => n.name === 'Idempotenta (Postgres)');
if (!nodIdem) { console.error('FAIL  nodul Idempotenta (Postgres) nu există în workflow'); process.exit(1); }
const QUERY_TEMPLATE = nodIdem.parameters.query;
const m = QUERY_TEMPLATE.match(/^(.*)\bWHERE\b/s) || [QUERY_TEMPLATE, QUERY_TEMPLATE];
const QUERIES_HEAD = m[1]; // porțiunea comună: CTE-urile + SELECT
function queryPentru(order) {
  const valori = [
    ['{{ $json.order_id }}', order.order_id],
    ['{{ $json.suma }}', String(order.suma)],
    ['{{ $json.moneda }}', order.moneda],
    ['{{ $json.status }}', order.status]
  ];
  let q = QUERY_TEMPLATE;
  for (const [ph, val] of valori) {
    q = q.split(ph).join(val);
  }
  return q;
}
check(QUERY_TEMPLATE.includes('ON CONFLICT (order_id) DO NOTHING RETURNING'), 'query-ul din workflow conține clauza ON CONFLICT DO NOTHING RETURNING');
check(QUERY_TEMPLATE.includes("UNION ALL"), 'query-ul din workflow conține fallback-ul UNION ALL (mereu exact 1 rând)');

/* ---------- 3. Container PG efemer ---------- */
const CONTAINER = 'autoact-test-idem';
/* Fără mapare de port: testul intră în PG prin `docker exec`, deci nu
 * ocupă niciun port de pe gazdă (pe Windows multe porturi sunt rezervate). */
/* Curățare toleranță: comanda e validă POSIX, dar `2>/dev/null` nu
 * există în cmd.exe — pe Windows redirectăm stdio și ignorăm codul. */
const stergeContainer = () => {
  try { execSync('docker rm -f ' + CONTAINER, { stdio: 'pipe' }); } catch (_) {}
};
const paralelCmd = (args, input) => new Promise((resolve) => {
  const p = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  if (input !== undefined) p.stdin.write(input);
  p.stdin.end();
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});

(async () => {
  stergeContainer();
  console.log('Pornește PostgreSQL efemer (' + CONTAINER + ')…');
  execSync(`docker run -d --name ${CONTAINER} -e POSTGRES_USER=autoact -e POSTGRES_PASSWORD=test -e POSTGRES_DB=autoact postgres:16-alpine`, { stdio: 'pipe' });

  // Așteaptă pornirea completă. La prima pornire initdb pornește un server
  // TEMPORAR, apoi îl oprește și îl repornește — deci un simplu „accepting
  // connections” poate apărea înainte ca serverul să fie folosibil. Deci
  // semnalul de pornire e un query REAL, nu pg_isready.
  let gata = false;
  for (let i = 0; i < 60 && !gata; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const q = await paralelCmd(['exec', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-At', '-c', 'SELECT 1']);
    if (q.code === 0 && q.out.trim() === '1') gata = true;
  }
  // pg_isready e verificat ABIA DUPĂ ce serverul e demonstrat funcțional,
  // ca să nu prindem serverul temporar din initdb.
  const rIsReady = gata ? await paralelCmd(['exec', CONTAINER, 'pg_isready', '-U', 'autoact', '-d', 'autoact']) : { out: '' };
  check(gata, 'PostgreSQL e pornit și execută query-uri (nu doar „accepting connections”)');
  check(gata && rIsReady.out.includes('accepting connections'), 'pg_isready confirmă serverul gata pe serverul pornit', rIsReady.out.trim());
  if (!gata) throw new Error('PG nu a pornit în 30 s');

  // Schema: ordinea reală de deploy. plati-schema.sql ALTERează tabela
  // `tranzactii`, care e creată de schema minimală din Modulul 4
  // (gdpr-purge.sql) — deci se aplică MODULUL 4 primul.
  const aplica = async (sql) => paralelCmd(['exec', '-i', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-v', 'ON_ERROR_STOP=1'], sql);
  const baza = fs.readFileSync(path.join(__dirname, '..', 'module-4', 'gdpr-purge.sql'), 'utf8');
  const rBaza = await aplica(baza);
  check(rBaza.code === 0, 'schema de bază aplicată (module-4/gdpr-purge.sql: tabela tranzactii)', rBaza.err.slice(0, 160));
  const schema = fs.readFileSync(path.join(__dirname, 'plati-schema.sql'), 'utf8');
  const rSchema = await aplica(schema);
  check(rSchema.code === 0, 'schema de plăți aplicată (module-5/plati-schema.sql: ALTER-uri additive)', rSchema.err.slice(0, 160));
  const rSchema2 = await aplica(schema);
  check(rSchema2.code === 0, 'plati-schema.sql este idempotentă (al doilea rulaj fără efecte)', rSchema2.err.slice(0, 160));

  const psql = async (sql) => {
    const r = await paralelCmd(['exec', '-i', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-At', '-F', '|'], sql);
    if (r.code !== 0) throw new Error('psql: ' + r.err.slice(0, 200));
    return r.out.trim();
  };

  try {
    /* ---------- Scenariul 5a: prima plată → duplicat = 0 ---------- */
    const comanda = { order_id: 'tr_ab12cd34ef56ab12', suma: PRET_RON, moneda: 'RON', status: 'confirmed' };
    const out1 = await psql(queryPentru(comanda));
    const camp1 = Object.fromEntries(out1.split('|').map((x, i) => [['order_id', 'status', 'suma', 'duplicat'][i], x]));
    check(camp1.duplicat === '0', 'prima plată → duplicat = 0 (fluxul continuă spre facturare)', out1);
    check(camp1.order_id === comanda.order_id && camp1.status === 'confirmed' && camp1.suma === SUMA_DB, 'rândul returnat conține order_id/status/suma', out1);

    /* ---------- 5b: ACEEAȘI plată, repetată → duplicat = 1 ---------- */
    const out2 = await psql(queryPentru(comanda));
    const camp2 = Object.fromEntries(out2.split('|').map((x, i) => [['order_id', 'status', 'suma', 'duplicat'][i], x]));
    check(camp2.duplicat === '1', 'aceeași plată repetată → duplicat = 1 (fluxul se oprește)', out2);
    const count = await psql('SELECT COUNT(*) FROM plati_procesate WHERE order_id = \'' + comanda.order_id + '\';');
    check(count === '1', 'exact 1 rând în plati_procesate după 2 apeluri (zero facturi duplicate)', count);

    /* ---------- 5c: stabilitate — 10 re-rulări, mereu exact 1 rând ----------
     * Contractul real al query-ului (ramura de fallback selectează
     * explicit NULL pentru status/sumă): 4 câmpuri = order_id|status|suma|duplicat.
     *   duplicat=0 → statusul și suma reale (rândul nou inserat)
     *   duplicat=1 → order_id + duplicat=1 (restul NULL — IF-ul se oprește aici) */
    const linieValida = (o) => {
      const c = o.split('|');
      if (c.length !== 4 || c[0] !== 'tr_ab12cd34ef56ab12') return false;
      if (c[3] === '0') return c[1] === 'confirmed' && c[2] === SUMA_DB;
      if (c[3] === '1') return c[1] === '' && c[2] === '';
      return false;
    };
    let stabilitateOk = true, ultimul = '';
    for (let i = 0; i < 10; i++) {
      const o = await psql(queryPentru(comanda));
      if (!linieValida(o)) { stabilitateOk = false; ultimul = o; }
    }
    const countFinal = await psql('SELECT COUNT(*) FROM plati_procesate;');
    check(stabilitateOk, '10 re-rulări → răspuns de fiecare dată un rând valid (IF-ul nu rămâne fără input)');
    check(countFinal === '1', 'după 12 apeluri totale există exact 1 rând în DB', countFinal);
    if (ultimul) console.log('       ultimul răspuns neașteptat: ' + ultimul);

    /* ---------- 5d: izolare — alt order_id NU e marcat duplicat ---------- */
    const alta = { order_id: 'tr_ff11cd34ef56ffff', suma: PRET_RON, moneda: 'RON', status: 'confirmed' };
    const outAlta = await psql(queryPentru(alta));
    check(outAlta.endsWith('|0'), 'o tranzacție DIFERITĂ → duplicat = 0 (nu e blocată de prima)', outAlta);
    const totalRânduri = await psql('SELECT COUNT(*) FROM plati_procesate;');
    check(totalRânduri === '2', '2 tranzacții distincte → 2 rânduri', totalRânduri);
    const repeatAlta = await psql(queryPentru(alta));
    check(repeatAlta.endsWith('|1'), 'retransmisia celei de-a doua tranzacții → duplicat = 1', repeatAlta);

    /* ---------- 5e: on-fail (status respins) NU mai poate deveni confirmed ---------- */
    const respinsa = { order_id: 'tr_ab12cd34ef56ab12', suma: PRET_RON, moneda: 'RON', status: 'failed' };
    const outFail = await psql(queryPentru(respinsa));
    check(outFail.endsWith('|1'), 'status diferit pe același order_id → tot duplicat (nu se suprascrie istoricul)', outFail);

    /* ---------- Scenariul 6: job-ul GDPR executat REAL (efect, nu sintaxă) ----------
     * rulează exact fișierul module-4/gdpr-purge.sql pe date reale și
     * verifică efectul: PII epurată, fișiere șterse, contabilitate păstrată. */
    const seed = `
      INSERT INTO tranzactii (id_tranzactie, stare, livrat_la, suma_ron, data_vanzarii,
        cnp_vanzator, nume_vanzator, adresa_vanzator, email_vanzator)
      VALUES ('tr_gdpr_vechi', 'livrat', NOW() - INTERVAL '72 hours', 9500, '2026-01-15',
        '1750314411231', 'Popescu Test', 'Str. Exemplu 1', 'vechi@example.com');
      INSERT INTO tranzactii (id_tranzactie, stare, livrat_la, suma_ron, data_vanzarii,
        cnp_vanzator, nume_vanzator, email_vanzator)
      VALUES ('tr_gdpr_recent', 'livrat', NOW() - INTERVAL '2 hours', 7000, '2026-02-20',
        '6010902122043', 'Ionescu Test', 'recent@example.com');
      INSERT INTO tranzactii (id_tranzactie, stare, suma_ron)
      VALUES ('tr_gdpr_abandonat', 'ocr_gata', 3000);
      INSERT INTO tranzactii_fisiere (tranzactie_id, cale_fisier, tip_fisier, creat_la)
      VALUES ('tr_gdpr_vechi', '/home/node/local/tr_gdpr_vechi/ci_fata.jpg', 'ci_fata', NOW() - INTERVAL '72 hours'),
             ('tr_gdpr_vechi', '/home/node/local/tr_gdpr_vechi/civ_verso.jpg', 'civ_verso', NOW() - INTERVAL '72 hours'),
             ('tr_gdpr_abandonat', '/home/node/local/tr_gdpr_abandonat/talon.jpg', 'talon', NOW() - INTERVAL '80 hours'),
             ('tr_gdpr_recent', '/home/node/local/tr_gdpr_recent/ci_fata.jpg', 'ci_fata', NOW() - INTERVAL '2 hours');
    `;
    const rSeed = await paralelCmd(['exec', '-i', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-v', 'ON_ERROR_STOP=1'], seed);
    check(rSeed.code === 0, 'GDPR: date de test inserate (livrat vechi, livrat recent, coș abandonat)', rSeed.err.slice(0, 160));

    const rPurge = await paralelCmd(['exec', '-i', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-v', 'ON_ERROR_STOP=1'], baza);
    check(rPurge.code === 0, 'GDPR: gdpr-purge.sql rulează fără eroare pe date reale', rPurge.err.slice(0, 200));

    const vechi = await psql("SELECT cnp_vanzator || '|' || nume_vanzator || '|' || adresa_vanzator || '|' || email_vanzator || '|' || stare || '|' || suma_ron FROM tranzactii WHERE id_tranzactie = 'tr_gdpr_vechi';");
    check(vechi === "[GDPR_PURGED]|[GDPR_PURGED]|[GDPR_PURGED]|[GDPR_PURGED]|epirat_gdpr|9500.00", 'GDPR: tranzacția veche e epurată complet, stare=epirat_gdpr, suma păstrată pentru contabilitate', vechi);

    const recent = await psql("SELECT cnp_vanzator || '|' || stare || '|' || suma_ron FROM tranzactii WHERE id_tranzactie = 'tr_gdpr_recent';");
    check(recent === '6010902122043|livrat|7000.00', 'GDPR: tranzacția livrată de acum 2h NU e atinsă ( prag 48h respectat)', recent);

    const fisiereRamase = await psql("SELECT COUNT(*) FROM tranzactii_fisiere WHERE tranzactie_id = 'tr_gdpr_vechi';");
    check(fisiereRamase === '0', 'GDPR: fișierele tranzacției epurate sunt ȘTERSE de pe disc-log', fisiereRamase);
    const abandonat = await psql("SELECT COUNT(*) FROM tranzactii_fisiere WHERE tranzactie_id = 'tr_gdpr_abandonat';");
    check(abandonat === '0', 'GDPR: fișierele coșului abandonat (>72h) sunt șterse', abandonat);
    const recentRamase = await psql("SELECT COUNT(*) FROM tranzactii_fisiere WHERE tranzactie_id = 'tr_gdpr_recent';");
    check(recentRamase === '1', 'GDPR: fișierele tranzacției recente rămân', recentRamase);
    const abandonatPii = await psql("SELECT stare || '|' || suma_ron FROM tranzactii WHERE id_tranzactie = 'tr_gdpr_abandonat';");
    check(abandonatPii === 'ocr_gata|3000.00', 'GDPR: tranzacția abandonată nu e anonimizată (doar fișierele se curăță)', abandonatPii);

    const log = await psql('SELECT id_rulare IS NOT NULL || \'|\' || fisiere_sterse || \'|\' || tranzactii_epurate FROM gdpr_purge_log ORDER BY id_rulare DESC LIMIT 1;');
    check(log === 'true|3|1', 'GDPR: logul de audit scrie id_rulare + numere reale (3 fișiere, 1 tranzacție)', log);

    const rPurge2 = await paralelCmd(['exec', '-i', CONTAINER, 'psql', '-U', 'autoact', '-d', 'autoact', '-v', 'ON_ERROR_STOP=1'], baza);
    const log2 = await psql('SELECT tranzactii_epurate FROM gdpr_purge_log ORDER BY id_rulare DESC LIMIT 1;');
    check(rPurge2.code === 0 && log2 === '0', 'GDPR: al doilea rulaj nu mai epurează nimic (idempotent, fără daune colaterale)', log2 + ' / ' + rPurge2.err.slice(0, 120));
  } finally {
    stergeContainer();
    console.log('containerul de test a fost distrus (cleanup).');
  }

  console.log('\n============================================================');
  console.log('TOTAL: ' + total + ' verificări idempotency · ' + esecuri + ' eșuate');
  console.log(esecuri === 0 ? 'IDEMPOTENCY PG: TOATE TESTELE TREC ✔' : 'IDEMPOTENCY PG: EȘUAT ✘');
  console.log('============================================================');
  process.exit(esecuri === 0 ? 0 : 1);
})().catch((e) => {
  console.error('EROARE IDEMPOTENCY:', e.message);
  stergeContainer();
  process.exit(1);
});
