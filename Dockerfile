FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

RUN cd backend && npm run build && cd ../frontend && npm run build

# Remove devDependencies — node_modules pronto para produção
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia node_modules do builder (garante express/pg/cors no runtime)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/backend/package.json ./backend/package.json

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/migrations ./backend/migrations
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY data ./data
COPY deploy/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
