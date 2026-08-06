#!/usr/bin/env bash
# Corrige conexão Postgres em projeto Railway EXISTENTE (sem recriar)
# Uso: PG_SERVICE=Postgres npm run railway:fix-db

set -euo pipefail

PG_SERVICE="${PG_SERVICE:-Postgres}"

echo "🔧 Reconfigurando variáveis Postgres → serviço App atual..."
echo "   Serviço Postgres no canvas: $PG_SERVICE"
echo ""

command -v railway >/dev/null || { echo "Instale: npm i -g @railway/cli"; exit 1; }

echo "Selecione o serviço BACKEND (não Postgres):"
railway service

railway variables --set "NODE_ENV=production" --skip-deploys
railway variables --set "DATABASE_URL=\${{${PG_SERVICE}.DATABASE_URL}}" --skip-deploys
railway variables --set "PGHOST=\${{${PG_SERVICE}.PGHOST}}" --skip-deploys
railway variables --set "PGUSER=\${{${PG_SERVICE}.PGUSER}}" --skip-deploys
railway variables --set "PGPASSWORD=\${{${PG_SERVICE}.PGPASSWORD}}" --skip-deploys
railway variables --set "PGDATABASE=\${{${PG_SERVICE}.PGDATABASE}}" --skip-deploys
railway variables --set "PGPORT=\${{${PG_SERVICE}.PGPORT}}" --skip-deploys

echo ""
echo "✅ Variáveis atualizadas. Redeploy:"
echo "   railway up --detach"
echo ""
echo "Depois teste:"
echo "   railway run node backend/dist/scripts/migrate.js"
echo "   curl \$(railway domain)/api/health/db"
