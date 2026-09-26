#!/usr/bin/env bash
# ============================================================
# AutoAct | Modulul 3 | deploy-autoact.sh
# Bootstrap one-shot: VM Ubuntu proaspătă (Oracle A1) → HTTPS funcțional.
#
# Folosire (de pe calculatorul LOCAL, din directorul module-3/):
#   chmod +x deploy-autoact.sh
#   ./deploy-autoact.sh ubuntu@IP_PUBLIC_AUTOACT autoact.ro
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
  echo "Folosire: $0 <user@host> <domeniu>   (ex: ./deploy-autoact.sh ubuntu@1.2.3.4 autoact.ro)"
  exit 1
fi

SSH_TARGET="$1"
DOMAIN="$2"
REMOTE_DIR="~/autoact"

echo "==> [1/5] Copiez fișierele de configurare pe server..."
ssh "$SSH_TARGET" "mkdir -p ${REMOTE_DIR}/caddy"
scp docker-compose.yml "${SSH_TARGET}:${REMOTE_DIR}/docker-compose.yml"
scp caddy/Caddyfile "${SSH_TARGET}:${REMOTE_DIR}/caddy/Caddyfile"

echo "==> [2/5] Generez .env cu secrete aleatorii pe server..."
ssh "$SSH_TARGET" "cd ${REMOTE_DIR} && \\
  if [ -f .env ]; then echo '.env există deja — nu îl suprascriu.'; else \\
    printf 'DOMAIN=%s\\n' '${DOMAIN}' > .env && \\
    printf 'POSTGRES_PASSWORD=%s\\n' \"\$(openssl rand -hex 24)\" >> .env && \\
    printf 'N8N_ENCRYPTION_KEY=%s\\n' \"\$(openssl rand -hex 24)\" >> .env && \\
    printf 'NETOPIA_RSA_PRIVATE_KEY=\\nNETOPIA_MPAY_SECRET=\\nSMARTBILL_VAT_CODE=\\nSMARTBILL_SERIE=AUTOACT\\nGOOGLE_DOCS_TEMPLATE_CONTRACT=\\nGOOGLE_DOCS_TEMPLATE_DRPCIV=\\nGOOGLE_DOCS_TEMPLATE_DECLARATII=\\n' >> .env && \
    chmod 600 .env; fi"

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
