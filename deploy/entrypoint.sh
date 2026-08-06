#!/bin/sh

MAX_RETRIES=30
RETRY_DELAY=2

run_migrate_with_retry() {
  if [ -z "$DATABASE_URL" ]; then
    echo "AVISO: DATABASE_URL não definida — pulando migrations"
    return 0
  fi

  echo "Executando migrations (com retry até o Postgres ficar pronto)..."
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

  echo "AVISO: Migrations falharam após ${MAX_RETRIES} tentativas — iniciando app mesmo assim (/api/health não depende do DB)"
  return 0
}

run_migrate_with_retry

echo "Iniciando aplicação em 0.0.0.0:${PORT:-3001}..."
exec node backend/dist/index.js
