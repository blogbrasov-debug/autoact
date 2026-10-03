#!/usr/bin/env bash
# ============================================================
# AutoAct | Modulul 3 | deploy-autoact.sh
# Bootstrap one-shot: VM Ubuntu proaspătă (Oracle A1) → HTTPS funcțional.
#
# Folosire (de pe calculatorul LOCAL, din directorul module-3/):
#   chmod +x deploy-autoact.sh
#   ./deploy-autoact.sh ubuntu@IP_PUBLIC_AUTOACT autoact.eu
#
# Ce face, în ordine:
#   1. copiază pe server: docker-compose.yml, caddy/Caddyfile;
#   2. generează .env cu POSTGRES_PASSWORD + N8N_ENCRYPTION_KEY aleatorii;
#   3. deschide firewall-ul OS (ports 80/443) pe Ubuntu;
#   4. instalează Docker Engine + plugin-ul docker compose;
#   5. pornește stack-ul și verifică sănătatea.
#
# Prerechizite: DNS-ul domeniului să pointeze deja spre IP-ul public.
# ============================================================
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Folosire: $0 <user@host> <domeniu>   (ex: ./deploy-autoact.sh ubuntu@1.2.3.4 autoact.eu)"
  exit 1
fi

SSH_TARGET="$1"

# NAP-ul (CIF, adresă, telefon) vine din SURSĂ: site/config.js →
# config-autoact.js. Nu îl scriem a cu gura, ca factura să nu iasă cu alt
# CIF decât cel afișat pe site.
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NAP_JSON="$(cd "$PROJECT_DIR" && node -p 'JSON.stringify(require("./config-autoact.js").NAP)')"
AUTOACT_CIF="$(printf '%s' "$NAP_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).CIF')"
AUTOACT_PLACEHOLDER="$(cd "$PROJECT_DIR" && node -p 'require("./config-autoact.js").PLACEHOLDER_NAP')"

# Blocaj real: dacă NAP-ul e încă placeholder, .env ar rămâne cu CIF-ul
# fictiv și nimeni nu l-ar mai remedia automat (deploy-ul nu suprascrie
# .env existent). Deci ne oprim înainte de a atinge serverul.
if [ "$AUTOACT_PLACEHOLDER" = "true" ] && [ "${ALLOW_PLACEHOLDER_NAP:-0}" != "1" ]; then
  cat >&2 <<EOF
EROARE: NAP-ul din site/config.js e încă PLACEHOLDER.

  CIF:     ${AUTOACT_CIF}
  Adresă:  $(printf '%s' "$NAP_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).ADRESA')

Dacă deploy-ul ar continua, serverul ar primi CIF-ul fictiv în .env, iar
facturile emise automat (SmartBill) ar fi neconforme.

Corectează blocul NAP din site/config.js și reia. Pentru un test de
infrastructură fără facturare reală, rulează cu ALLOW_PLACEHOLDER_NAP=1.
EOF
  exit 1
fi
echo "NAP folosit pentru facturare: CIF ${AUTOACT_CIF}$([ "$AUTOACT_PLACEHOLDER" = "true" ] && echo '  ⚠ PLACEHOLDER (permis explicit)')"
DOMAIN="$2"
REMOTE_DIR="~/autoact"

echo "==> [1/5] Copiez fișierele de configurare pe server..."
ssh "$SSH_TARGET" "mkdir -p ${REMOTE_DIR}/caddy ${REMOTE_DIR}/site"
scp docker-compose.yml "${SSH_TARGET}:${REMOTE_DIR}/docker-compose.yml"
scp caddy/Caddyfile "${SSH_TARGET}:${REMOTE_DIR}/caddy/Caddyfile"

# Site-ul generat trebuie SINCRONIZAT, nu doar creat. Docker creează
# automat un director gol dacă sursa de montare lipsește, deci fără
# acest pas containerul ar porni „cu succes" și Caddy ar răspunde 404
# pe toate paginile — o eroare de deploy invizibilă în loguri.
# Excludem fișierele de test și șabloanele: nu sunt servite, iar
# testul de bancă de cifre nu are ce căuta pe un server public.
scp -r ../site/. "${SSH_TARGET}:${REMOTE_DIR}/site/"
ssh "$SSH_TARGET" "rm -f ${REMOTE_DIR}/site/*.sablon.html ${REMOTE_DIR}/site/test-*.js ${REMOTE_DIR}/site/construieste-inline.js"

# Verificare explicită: mai puțin de 3 pagini înseamnă că sincronizarea
# a eșuat tăcut și site-ul nu va răspunde.
PAGINI_ONLINE=$(ssh "$SSH_TARGET" "ls ${REMOTE_DIR}/site/*.html 2>/dev/null | wc -l")
if [ "$PAGINI_ONLINE" -lt 3 ]; then
  echo "EROARE: pe server sunt doar ${PAGINI_ONLINE} pagini .html (asteptam minim 3)."
  echo "        Site-ul nu va raspunde. Ruleaza 'node site/construieste-inline.js' si reia."
  exit 1
fi
echo "    site sincronizat: ${PAGINI_ONLINE} pagini .html"

echo "==> [2/5] Generez .env cu secrete aleatorii pe server..."
# .env existent: nu îl suprascriu (secrete!), dar RECONCILIEZ CIF-ul —
# altfel un NAP corectat după primul deploy nu s-ar propaga la factură.
ssh "$SSH_TARGET" "cd ${REMOTE_DIR} && \\
  if [ -f .env ]; then
    echo '.env există deja — nu îl suprascriu.'
    if grep -q '^SMARTBILL_VAT_CODE=${AUTOACT_CIF}\$' .env; then
      echo '  CIF din .env e deja cel din config.js — nimic de făcut.'
    else
      echo \"  CIF din .env diferă de config.js — îl actualizez.\"
      sed -i 's|^SMARTBILL_VAT_CODE=.*|SMARTBILL_VAT_CODE=${AUTOACT_CIF}|' .env
    fi
  else
    printf 'DOMAIN=%s\\n' '${DOMAIN}' > .env && \\
    printf 'POSTGRES_PASSWORD=%s\\n' \"\$(openssl rand -hex 24)\" >> .env && \\
    printf 'N8N_ENCRYPTION_KEY=%s\\n' \"\$(openssl rand -hex 24)\" >> .env && \\
    printf 'NETOPIA_RSA_PRIVATE_KEY=\\nNETOPIA_MPAY_SECRET=\\nSMARTBILL_VAT_CODE=${AUTOACT_CIF}\\nSMARTBILL_SERIE=AUTOACT\\nGOOGLE_DOCS_TEMPLATE_CONTRACT=\\nGOOGLE_DOCS_TEMPLATE_DRPCIV=\\nGOOGLE_DOCS_TEMPLATE_DECLARATII=\\n' >> .env && \\
    chmod 600 .env
  fi"

echo "==> [3/5] Configurez firewall-ul OS (80/443)..."
ssh "$SSH_TARGET" "sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && yes | sudo ufw enable || true"

echo "==> [4/5] Instalez Docker Engine + Compose..."
ssh "$SSH_TARGET" "if command -v docker >/dev/null 2>&1; then echo 'Docker deja instalat.'; else \\
  curl -fsSL https://get.docker.com | sudo sh && \\
  sudo usermod -aG docker ubuntu && echo 'Docker instalat. (delogat/reatentat pentru grupul docker, dar sudo funcționează oricum)'; fi"

echo "==> [5/5] Pornez stack-ul și verific..."
ssh "$SSH_TARGET" "cd ${REMOTE_DIR} && sudo docker compose pull && sudo docker compose up -d"
sleep 15
ssh "$SSH_TARGET" "cd ${REMOTE_DIR} && sudo docker compose ps"

cat <<EOF

============================================================
 DEPLOY FINALIZAT
 URL n8n:      https://${DOMAIN}/
 Locație:      ${REMOTE_DIR} pe ${SSH_TARGET}
 Următorul pas (OBLIGATORIU): 
   - salvează local conținutul fișierului ${REMOTE_DIR}/.env
     (N8N_ENCRYPTION_KEY = cheia de decriptare a credentials-urilor!)
 Verificare:   ssh ${SSH_TARGET} 'cd ~/autoact && sudo docker compose logs -f n8n'
============================================================
EOF
