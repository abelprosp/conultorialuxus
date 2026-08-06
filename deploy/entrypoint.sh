#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"

MAX_RETRIES=30
RETRY_DELAY=2

echo "=== Startup ==="
echo "PORT=${PORT}"
echo "DATABASE_URL=$([ -n "${DATABASE_URL:-}" ] && echo set || echo unset)"
echo "NODE_ENV=${NODE_ENV}"

run_migrate_with_retry() {
  echo "Executando migrations em background (retry até o Postgres ficar pronto)..."
  attempt=1
  while [ "$attempt" -le "$MAX_RETRIES" ]; do
    if node backend/dist/scripts/migrate.js; then
      echo "Migrations concluídas."
      return 0
    fi
    echo "Migration tentativa ${attempt}/${MAX_RETRIES} falhou, aguardando ${RETRY_DELAY}s..."
    sleep "$RETRY_DELAY"
    attempt=$((attempt + 1))
  done

  echo "AVISO: Migrations falharam após ${MAX_RETRIES} tentativas — app continua (/api/health não depende do DB)"
  return 0
}

if [ -n "${DATABASE_URL:-}" ]; then
  run_migrate_with_retry &
else
  echo "AVISO: DATABASE_URL não definida — pulando migrations"
fi

echo "Iniciando aplicação em 0.0.0.0:${PORT}..."
exec node backend/dist/index.js
