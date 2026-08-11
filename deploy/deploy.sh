#!/usr/bin/env bash
# Deploy da Assessoria Cobranças na VPS.
#
# Uso:
#   ./deploy/deploy.sh              # Docker + APP_PORT=38472 (nginx no host — Opção B)
#   ./deploy/deploy.sh --caddy      # Docker + overlay Caddy (HTTPS no container)
#   ./deploy/deploy.sh --setup-nginx  # Instala site nginx + pede certificado SSL
#   ./deploy/deploy.sh --import-csv # Importa data/historico-solicitacoes.csv
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)
COMPOSE_CADDY=(docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml)
DOMAIN="consultoria.redobrai.online"
APP_PORT="${APP_PORT:-38472}"

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.production.example .env
    echo "Arquivo .env criado a partir de .env.production.example"
    echo "Edite .env e defina POSTGRES_PASSWORD antes de continuar."
    exit 1
  fi

  if ! grep -qE '^POSTGRES_PASSWORD=.+' .env || grep -q 'troque-por-uma-senha' .env; then
    echo "ERRO: defina POSTGRES_PASSWORD no .env (senha forte, diferente do exemplo)."
    exit 1
  fi
}

ensure_app_port() {
  if grep -qE '^APP_PORT=' .env; then
    sed -i "s/^APP_PORT=.*/APP_PORT=${APP_PORT}/" .env
  else
    echo "APP_PORT=${APP_PORT}" >> .env
  fi
}

wait_for_health() {
  local url="http://127.0.0.1:${APP_PORT}/api/health"
  echo "Aguardando app em ${url} ..."
  for i in $(seq 1 40); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "App OK: $(curl -s "$url")"
      return 0
    fi
    sleep 3
  done
  echo "ERRO: app não respondeu em ${url}"
  echo "Logs: docker compose -f docker-compose.prod.yml logs --tail=80 app"
  return 1
}

cmd_up_nginx() {
  ensure_env
  ensure_app_port
  echo "=== Subindo stack (nginx no host → localhost:${APP_PORT}) ==="
  "${COMPOSE[@]}" up -d --build
  wait_for_health
  echo ""
  echo "Próximo passo (se ainda não configurou nginx/SSL):"
  echo "  ./deploy/deploy.sh --setup-nginx"
}

cmd_up_caddy() {
  ensure_env
  echo "=== Subindo stack com Caddy (HTTPS no container) ==="
  "${COMPOSE_CADDY[@]}" up -d --build
  echo "Aguardando containers..."
  sleep 5
  "${COMPOSE_CADDY[@]}" ps
  echo ""
  echo "Teste: curl -s https://${DOMAIN}/api/health"
}

cmd_setup_nginx() {
  local site="/etc/nginx/sites-available/${DOMAIN}"
  echo "=== Configurando nginx para ${DOMAIN} → 127.0.0.1:${APP_PORT} ==="
  sudo cp deploy/nginx-consultoria.conf "$site"
  sudo ln -sf "$site" "/etc/nginx/sites-enabled/${DOMAIN}"
  sudo nginx -t
  sudo systemctl reload nginx
  echo "nginx recarregado."
  echo ""
  echo "Para HTTPS (Let's Encrypt):"
  echo "  sudo apt install -y certbot python3-certbot-nginx"
  echo "  sudo certbot --nginx -d ${DOMAIN}"
}

cmd_import_csv() {
  ensure_env
  echo "=== Importando CSV histórico ==="
  "${COMPOSE[@]}" exec app node backend/dist/scripts/import-csv.js
}

cmd_down() {
  "${COMPOSE[@]}" down
}

case "${1:-}" in
  --caddy)
    cmd_up_caddy
    ;;
  --setup-nginx)
    cmd_setup_nginx
    ;;
  --import-csv)
    cmd_import_csv
    ;;
  --down)
    cmd_down
    ;;
  -h|--help)
    sed -n '2,10p' "$0"
    ;;
  "")
    cmd_up_nginx
    ;;
  *)
    echo "Opção desconhecida: $1"
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
