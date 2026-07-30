FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

RUN npm run build -w backend && npm run build -w frontend

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

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
