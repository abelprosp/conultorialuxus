FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

# Build por diretório (não usa npm workspaces — evita falha se o contexto de deploy não incluir o package.json raiz)
RUN cd backend && npm run build && cd ../frontend && npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN npm ci -w backend --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/migrations ./backend/migrations
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY data ./data
COPY deploy/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

# Railway injeta PORT em runtime (ex.: 8080) — não fixar aqui
EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
