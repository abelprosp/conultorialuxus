#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"

MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-120}"

echo "=== Startup ==="
echo "PORT=${PORT}"
echo "DATABASE_URL=$([ -n "${DATABASE_URL:-}" ] && echo set || echo unset)"
echo "NODE_ENV=${NODE_ENV}"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Executando migrations de forma síncrona (timeout ${MIGRATE_TIMEOUT}s, aguarda Postgres)..."
  if timeout "$MIGRATE_TIMEOUT" node backend/dist/scripts/migrate.js; then
    export MIGRATION_STATUS=ok
    echo "Migrations concluídas com sucesso."
  else
    export MIGRATION_STATUS=failed
    echo "ERRO: Migrations falharam ou atingiram timeout — app sobe mesmo assim."
    echo "       Verifique DATABASE_URL, SSL e logs acima. Use GET /api/health/db para diagnóstico."
  fi
else
  export MIGRATION_STATUS=skipped
  echo "AVISO: DATABASE_URL não definida — pulando migrations (rotas /api/* retornarão 500)."
fi

echo "MIGRATION_STATUS=${MIGRATION_STATUS}"

echo "Iniciando aplicação em 0.0.0.0:${PORT}..."
exec node backend/dist/index.js
