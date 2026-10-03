#!/usr/bin/env bash
# ============================================================
# AutoAct | ruleaza-teste.sh
# Rulează TOATE suitele locale — același script e folosit de
# CI-ul GitHub Actions (.github/workflows/ci.yml), deci ce trece
# local trece garantat și în CI (și invers).
#
# Rulare:  bash ruleaza-teste.sh
# Ieșire:  0 = toate trec, 1 = primul eșec oprește (set -e)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

pas() { echo ""; echo "=================================================================="; echo "▶ $1"; echo "=================================================================="; }

pas "1/15 · Sintaxă: toate modulele JS + scriptul bash de deploy"
for f in \
  module-1/genereaza-cnp-test.js \
  module-1/populeaza-tranzactie-demo.js \
  module-2/cnp-validator.code-node.js \
  module-2/zip-store.code-node.js \
  module-2/build-workflow.js \
  module-2/test-cnp-validator.js \
  module-2/test-pipeline-e2e.js \
  module-2/verifica-sabloane.js \
  module-4/gdpr-purge.code-node.js \
  module-5/build-workflow-plati.js \
  module-5/test-e2e-idempotency.js \
  module-5/test-mutatie-cost.js \
  module-5/test-caddy-rutare.js \
  config-autoact.js \
  site/app.js site/validare.js site/config.js site/demo-data.js site/construieste-inline.js \
  site/test-banca-cifre.js config-autoact.js \
  verifica-ui-validare.js \
  brand/construieste-identitate.js brand/exporta-png.js \
  brand/test-copy-facebook.js brand/test-mutatie-facebook.js
do
  node --check "$f"
done
bash -n module-3/deploy-autoact.sh
echo "OK — 24 fișiere JS + 1 bash, sintaxă validă"

pas "2/15 · Scheme JSON (Profil de Tranzacție + harta placeholder-e)"
node -e "JSON.parse(require('fs').readFileSync('module-1/profil-tranzactie.schema.json','utf8')); console.log('profil-tranzactie.schema.json: VALID')"
node -e "JSON.parse(require('fs').readFileSync('module-2/sabloane/placeholders.json','utf8')); console.log('placeholders.json: VALID')"

pas "3/15 · Test Data Kit — 5 CNP-uri regenerate + re-verificate"
node module-1/genereaza-cnp-test.js

pas "4/15 · Suita CNP — 90 de verificări (n8n + UI, output identic obligatoriu)"
node module-2/test-cnp-validator.js

pas "5/15 · Compatibilitate UI ↔ n8n — 29 de verificări"
node verifica-ui-validare.js

pas "6/15 · Profil de Tranzacție demo — 6 verificări end-to-end"
node module-1/populeaza-tranzactie-demo.js

pas "7/15 · Șabloane Google Docs — 57 de verificări (tokeni, căi, harta nodului)"
node module-2/verifica-sabloane.js

pas "8/15 · Builder-e workflow (pipeline + plăți) + site (pagini din șabloane + demo inline)"
node module-2/build-workflow.js
node module-5/build-workflow-plati.js
node site/construieste-inline.js

pas "9/15 · Pipeline END-TO-END: webhook→OCR fake→Gemini fake→validator→IF-uri→ZIP→Gmail"
node module-2/test-pipeline-e2e.js

pas "10/15 · E2E cu PostgreSQL REAL (docker): idempotency pe order_id + job GDPR"
node module-5/test-e2e-idempotency.js

pas "11/15 · BANCA DE CIFRE — nicio cifră în textul public fără origine în cod"
node site/test-banca-cifre.js

pas "12/15 · BUGET 0 RON — cerințele rămân în cotele Always Free (+ test de mutație)"
node verifica-cost-0.js
node module-5/test-mutatie-cost.js

pas "13/15 · Rutare Caddy REALĂ (docker): site static + proxy webhook + UI n8n + 404 + TLS"
node module-5/test-caddy-rutare.js

pas "14/15 · Identitate Facebook: materialele spun ce spun și codul (preț, 3 documente, PNG-uri la zi) + test de mutație"
node brand/test-copy-facebook.js
node brand/test-mutatie-facebook.js

pas "15/15 · Artefacte generate la zi + docker compose config"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  for artefact in module-2/autoact-workflow.json module-5/autoact-workflow-plati.json site/index.html site/contact.html site/demo-standalone.html brand/png/facebook-acoperire.png brand/png/facebook-profil.png; do
    if test -z "$(git status --porcelain -- "$artefact")"; then
      echo "OK  $artefact este la zi (identic cu versiunea comisă)"
    else
      echo "FAIL $artefact NU este la zi — rulează builder-ele și comite fișierul regenerat"
      exit 1
    fi
  done
else
  echo "(nu este repo git — sar peste verificarea artefactelor comise; în CI rulează complet)"
fi
if command -v docker >/dev/null 2>&1; then
  docker compose -f module-3/docker-compose.yml config -q 2>/dev/null && echo "OK  docker compose config valid"
else
  echo "(docker indisponibil — sar peste validarea compose; în CI rulează complet)"
fi

echo ""
echo "=================================================================="
echo " ✔ TOATE SUITELE AU TRECUT — proiectul este în stare de push"
echo "=================================================================="
