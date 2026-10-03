-- ============================================================
-- AutoAct | Modulul 4 | gdpr-purge.sql
-- Curățare GDPR automată: rulează zilnic (nod Schedule n8n
-- → nod PostgreSQL „Execute Query”), la 04:00 Europe/Bucharest.
--
-- Politică de retenție:
--   * fișiere scanate (poze CI/CIV/talon): 72 h dacă plata nu a venit
--   * fișierele tranzacțiilor LIVRATE:     48 h de la livrare
--   * după epurare rămân DOAR: id_tranzactie, suma_ron, data_vanzarii
--
-- Totul e idempotent: poate fi rerulat oricând fără efecte duble.
-- Fișierele fizice de pe disc se șterg cu module-4/gdpr-purge.code-node.js
-- (rulat după acest query, pe baza listingului din fiz_de_sters).
-- ============================================================

BEGIN;

-- ---------- (Opțional, prima rulare) Schema minimă ----------
CREATE TABLE IF NOT EXISTS tranzactii (
  id_tranzactie             TEXT PRIMARY KEY,
  stare                     TEXT NOT NULL DEFAULT 'webhook_primit',
  creat_la                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platit_la                 TIMESTAMPTZ,
  livrat_la                 TIMESTAMPTZ,
  epirat_la                 TIMESTAMPTZ,
  -- Păstrate pentru contabilitate (nu sunt PII sensibile):
  suma_ron                  NUMERIC(10, 2),
  data_vanzarii             DATE,
  -- Date personale sensibile (se epurează):
  cnp_vanzator              TEXT,
  cnp_cumparator            TEXT,
  nume_vanzator             TEXT,
  nume_cumparator           TEXT,
  serie_numar_ci_vanzator   TEXT,
  serie_numar_ci_cumparator TEXT,
  adresa_vanzator           TEXT,
  adresa_cumparator         TEXT,
  telefon_vanzator          TEXT,
  telefon_cumparator        TEXT,
  email_vanzator            TEXT,
  email_cumparator          TEXT
);

CREATE TABLE IF NOT EXISTS tranzactii_fisiere (
  id_fisier     BIGSERIAL PRIMARY KEY,
  tranzactie_id TEXT NOT NULL REFERENCES tranzactii(id_tranzactie) ON DELETE CASCADE,
  cale_fisier   TEXT NOT NULL,           -- ex: /home/node/local/tr_ab12.../ci_fata.jpg
  tip_fisier    TEXT NOT NULL,           -- ci_fata | ci_verso | civ_fata | civ_verso | talon
  creat_la      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gdpr_purge_log (
  id_rulare          BIGSERIAL PRIMARY KEY,
  rulat_la           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fisiere_sterse     INTEGER NOT NULL,
  tranzactii_epurate INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tranzactii_stare_livrat_la ON tranzactii (stare, livrat_la);
CREATE INDEX IF NOT EXISTS idx_tranzactii_fisiere_creat_la ON tranzactii_fisiere (creat_la);

-- ---------- Epurarea propriu-zisă (o singură instrucțiune, numărări reale) ----------
WITH candidati AS (
  SELECT id_tranzactie FROM tranzactii
  WHERE stare = 'livrat' AND livrat_la < NOW() - INTERVAL '48 hours'
),
fiz_de_sters AS (
  DELETE FROM tranzactii_fisiere f
  USING candidati c
  WHERE f.tranzactie_id = c.id_tranzactie
     OR (f.creat_la < NOW() - INTERVAL '72 hours'
         AND f.tranzactie_id IN (
           SELECT id_tranzactie FROM tranzactii
           WHERE stare IN ('webhook_primit', 'ocr_gata', 'cerere_corectii_client')
         ))
  RETURNING f.tranzactie_id, f.cale_fisier
),
anonimizate AS (
  UPDATE tranzactii t SET
    cnp_vanzator              = '[GDPR_PURGED]',
    cnp_cumparator            = '[GDPR_PURGED]',
    nume_vanzator             = '[GDPR_PURGED]',
    nume_cumparator           = '[GDPR_PURGED]',
    serie_numar_ci_vanzator   = '[GDPR_PURGED]',
    serie_numar_ci_cumparator = '[GDPR_PURGED]',
    adresa_vanzator           = '[GDPR_PURGED]',
    adresa_cumparator         = '[GDPR_PURGED]',
    telefon_vanzator          = '[GDPR_PURGED]',
    telefon_cumparator        = '[GDPR_PURGED]',
    email_vanzator            = '[GDPR_PURGED]',
    email_cumparator          = '[GDPR_PURGED]',
    stare                     = 'epirat_gdpr',
    epirat_la                 = NOW()
  WHERE t.id_tranzactie IN (SELECT id_tranzactie FROM candidati)
  RETURNING t.id_tranzactie
),
logare AS (
  INSERT INTO gdpr_purge_log (fisiere_sterse, tranzactii_epurate)
  SELECT (SELECT COUNT(*) FROM fiz_de_sters), (SELECT COUNT(*) FROM anonimizate)
  RETURNING id_rulare, fisiere_sterse, tranzactii_epurate
)
SELECT 'fisiere_sterse' AS metric, COUNT(*) AS valoare FROM fiz_de_sters
UNION ALL
SELECT 'tranzactii_epurate', COUNT(*) FROM anonimizate
UNION ALL
SELECT 'log_id', (SELECT id_rulare FROM logare);

COMMIT;

-- Ieșirea query-ului (3 rânduri metrică/valoare) poate fi trimisă în n8n
-- către founder@autoact.eu ca e-mail de audit zilnic — nu e alertă de
-- intervenție, doar dovada că job-ul a rulat.

-- Listingul fișierelor fizice de șters de pe disc (pentru pasul Code):
--   SELECT DISTINCT cale_fisier FROM tranzactii_fisiere WHERE false;  (exemplu)
--   În practică: nodul Code primește „fiz_de_sters” prin output-ul query-ului
--   de mai jos rulat separat, imediat după COMMIT:
--   SELECT tranzactie_id, cale_fisier FROM tranzactii_fisiere WHERE creat_la < NOW() - INTERVAL '72 hours';
--   (rândurile deja șterse nu mai există; varianta code-node listeză directorul /home/node/local/)
