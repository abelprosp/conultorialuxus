#!/bin/sh
set -e

echo "Executando migrations..."
node backend/dist/scripts/migrate.js

echo "Iniciando aplicação..."
exec node backend/dist/index.js
