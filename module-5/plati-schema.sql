-- ============================================================
-- AutoAct | Modulul 5 | plati-schema.sql
-- Se rulează O SINGURĂ DATĂ (idempotent — poate fi rerulat fără efecte):
--   sudo docker compose exec -T postgres psql -U autoact -d autoact < module-5/plati-schema.sql
--
-- 1. plati_procesate — garantează idempotența webhook-ului Stripe:
--    retransmisiile (același order_id) NU generează pachete livrate de două ori.
-- 2. tranzactii + localitate_cumparator / judet_cumparator — coloane
--    necesare generării documentelor și livrării (adresa clientului),
--    adăugate additive la tabela minimă din Modulul 4.
-- ============================================================

CREATE TABLE IF NOT EXISTS plati_procesate (
  order_id       TEXT PRIMARY KEY,              -- = Stripe client_reference_id = id_tranzactie (tr_xxxxxxxxxxxxxxxx)
  id_tranzactie  TEXT,
  suma           NUMERIC(10, 2),
  moneda         TEXT DEFAULT 'RON',
  status         TEXT,
  procesat_la    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tranzactii ADD COLUMN IF NOT EXISTS localitate_cumparator TEXT;
ALTER TABLE tranzactii ADD COLUMN IF NOT EXISTS judet_cumparator TEXT;
-- Profilul complet (Profilul Unic de Tranzacție, module-1/profil-tranzactie.schema.json)
-- stocat la momentul validării; nodul „Placeholder-e Docs" îl consumă pentru
-- cele 37 de înlocuiri din cele 3 șabloane Google Docs.
ALTER TABLE tranzactii ADD COLUMN IF NOT EXISTS profil_json JSONB;
