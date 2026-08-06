#!/usr/bin/env bash
# Setup/deploy Assessoria no Railway — 1 serviço App (Dockerfile) + Postgres conectado
#
# Uso:
#   npm run railway:setup          # projeto novo ou reconfigurar
#   npm run railway:setup -- --deploy-only
#   PG_SERVICE=Postgres APP_SERVICE=backend npm run railway:setup
#
# Pré-requisitos: npm i -g @railway/cli && railway login

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_ONLY=false
SKIP_IMPORT=false
PG_SERVICE="${PG_SERVICE:-Postgres}"
APP_SERVICE="${APP_SERVICE:-}"

for arg in "$@"; do
  case "$arg" in
    --deploy-only) DEPLOY_ONLY=true ;;
    --skip-import) SKIP_IMPORT=true ;;
    -h|--help)
      echo "Uso: $0 [--deploy-only] [--skip-import]"
      echo "  --deploy-only   só configura vars e faz deploy (Postgres já existe)"
      echo "  --skip-import   não importa CSV após migrate"
      echo "Env: PG_SERVICE=Postgres  APP_SERVICE=backend"
      exit 0
      ;;
  esac
done

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

step() { echo ""; green "==> $*"; }

require_cli() {
  if ! command -v railway >/dev/null 2>&1; then
    red "Railway CLI não instalado."
    echo "  npm install -g @railway/cli"
    echo "  railway login"
    exit 1
  fi
  if ! railway whoami >/dev/null 2>&1; then
    yellow "Faça login no Railway..."
    railway login
  fi
  green "Railway CLI OK ($(railway whoami 2>/dev/null || echo 'logado'))"
}

link_project() {
  step "Projeto Railway"
  if [[ -f .railway/project.json ]]; then
    green "Projeto já linkado (.railway/project.json)"
    return
  fi
  yellow "Nenhum projeto linkado."
  echo "  1) Criar projeto novo"
  echo "  2) Linkar projeto existente"
  read -r -p "Escolha [1/2]: " choice
  case "$choice" in
    1) railway init ;;
    2) railway link ;;
    *) railway link ;;
  esac
}

add_postgres() {
  step "PostgreSQL"
  if [[ "$DEPLOY_ONLY" == true ]]; then
    yellow "Pulando criação do Postgres (--deploy-only)"
    return
  fi
  yellow "Adicionando banco PostgreSQL (ignore erro se já existir)..."
  railway add --database postgres 2>/dev/null || true
  green "Postgres disponível no canvas (serviço: $PG_SERVICE ou similar)"
}

select_app_service() {
  step "Serviço da aplicação"
  echo "IMPORTANTE: selecione o serviço da APP (Dockerfile), NÃO Postgres e NÃO frontend."
  echo ""
  yellow "Abra o seletor de serviços e escolha 'backend' ou o serviço que usa o Dockerfile da raiz:"
  railway service
  if [[ -n "$APP_SERVICE" ]]; then
    yellow "Tentando linkar serviço: $APP_SERVICE"
    railway link --service "$APP_SERVICE" 2>/dev/null || true
  fi
}

set_app_variables() {
  step "Variáveis de ambiente (backend ← Postgres)"

  # Referências Railway — DATABASE_URL + PG* (fallback no código)
  railway variables --set "NODE_ENV=production" --skip-deploys

  railway variables --set "DATABASE_URL=\${{${PG_SERVICE}.DATABASE_URL}}" --skip-deploys
  railway variables --set "PGHOST=\${{${PG_SERVICE}.PGHOST}}" --skip-deploys
  railway variables --set "PGUSER=\${{${PG_SERVICE}.PGUSER}}" --skip-deploys
  railway variables --set "PGPASSWORD=\${{${PG_SERVICE}.PGPASSWORD}}" --skip-deploys
  railway variables --set "PGDATABASE=\${{${PG_SERVICE}.PGDATABASE}}" --skip-deploys
  railway variables --set "PGPORT=\${{${PG_SERVICE}.PGPORT}}" --skip-deploys

  green "Variáveis configuradas:"
  echo "  DATABASE_URL=\${{${PG_SERVICE}.DATABASE_URL}}"
  echo "  PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT → referências ao Postgres"
  echo ""
  yellow "Se o serviço Postgres tiver outro nome no canvas, rode:"
  echo "  PG_SERVICE=NomeDoServico npm run railway:setup -- --deploy-only"
}

deploy_app() {
  step "Deploy (Dockerfile — API + React no mesmo serviço)"
  railway up --detach
  green "Deploy iniciado. Acompanhe no dashboard Railway."
}

wait_for_health() {
  step "Aguardando deploy"
  local domain
  domain="$(railway domain 2>/dev/null || true)"
  if [[ -z "$domain" ]]; then
    yellow "Domínio ainda não gerado. No dashboard: backend → Settings → Networking → Generate Domain"
    read -r -p "Pressione Enter após gerar o domínio..." _
    domain="$(railway domain 2>/dev/null || true)"
  fi
  if [[ -n "$domain" ]]; then
    green "URL: https://${domain}"
    yellow "Testando /api/health (até 3 min)..."
    local i url
    for i in $(seq 1 18); do
      url="https://${domain}/api/health"
      if curl -sf "$url" >/dev/null 2>&1; then
        green "Health OK: $url"
        return
      fi
      sleep 10
    done
    yellow "Health ainda não respondeu — verifique logs no Railway"
  fi
}

run_migrate_and_import() {
  step "Migration + importação CSV"
  yellow "Executando migrate via railway run (com variáveis do serviço)..."
  railway run node backend/dist/scripts/migrate.js || {
    red "Migrate falhou. Tente no Shell do Railway:"
    echo "  cd /app && node backend/dist/scripts/migrate.js"
    return 1
  }
  if [[ "$SKIP_IMPORT" == true ]]; then
    yellow "Import CSV pulado (--skip-import)"
    return 0
  fi
  read -r -p "Importar CSV histórico (~495 registros)? [s/N]: " do_import
  if [[ "$do_import" =~ ^[sS]$ ]]; then
    railway run node backend/dist/scripts/import-csv.js || {
      yellow "Import falhou — rode manualmente: railway run node backend/dist/scripts/import-csv.js"
    }
  fi
}

print_checklist() {
  step "Checklist final"
  cat <<EOF

Canvas Railway deve ter APENAS:
  [ backend ]  ← 1 serviço App (Dockerfile na raiz)
  [ Postgres ] ← banco

Se existir serviço "frontend" separado → APAGUE (Settings → Delete Service).

Dashboard backend → Settings → Source:
  Root Directory: (vazio)
  Builder: Dockerfile
  Build/Start Command: (vazios)

Testes:
  curl https://SEU-DOMINIO/api/health
  curl https://SEU-DOMINIO/api/health/db
  curl https://SEU-DOMINIO/api/clientes

EOF
}

main() {
  echo ""
  green "🚂 Railway Setup — Assessoria Cobranças"
  echo "   Monorepo: 1 serviço Docker (API + frontend) + Postgres"
  echo ""

  require_cli
  link_project
  add_postgres
  select_app_service
  set_app_variables
  deploy_app
  wait_for_health
  run_migrate_and_import || true
  print_checklist
  green "Concluído."
}

main
