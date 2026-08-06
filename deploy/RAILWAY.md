# Deploy no Railway

Guia para publicar o **Assessoria Cobranças** no [Railway](https://railway.app). O frontend React é servido pelo backend Express na mesma URL — **use um único serviço de app**, não dois.

## Por que deu erro `No workspaces found: --workspace=frontend`?

Esse erro aparece quando o Railway **não está na raiz do monorepo**:

| Causa comum | O que acontece |
|-------------|----------------|
| **Root Directory = `frontend`** | Só sobe a pasta `frontend/`; o `package.json` raiz com `"workspaces"` não existe no deploy |
| **Build command manual** tipo `npm run build -w frontend` | O npm procura workspaces no `package.json` atual e não encontra |
| **Nixpacks em vez do Dockerfile** | Auto-detecção errada em monorepo |
| **Repositório incompleto** | Falta `package.json` / `package-lock.json` na raiz |

O projeto **precisa** da raiz do repositório (`backend/`, `frontend/`, `data/`, `deploy/`, `Dockerfile`, `package.json`).

---

## Arquitetura no Railway

```
┌─────────────────────┐     ┌──────────────────────┐
│  Serviço: App       │     │  Plugin PostgreSQL   │
│  (Dockerfile)       │────▶│  (Railway Postgres)  │
│  API + frontend     │     │                      │
└─────────────────────┘     └──────────────────────┘
         │
         └── URL pública (ex.: *.up.railway.app)
```

- **1 serviço App** — build via `Dockerfile` (API + frontend estático)
- **1 PostgreSQL** — plugin ou serviço Postgres do Railway
- **Não** crie um serviço separado só para `frontend/` (a API usa `/api` no mesmo domínio)

---

## Passo a passo

### 1. Criar projeto e conectar o repositório

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Selecione o repositório **consultoria** (monorepo completo)

### 2. Adicionar PostgreSQL

1. No projeto → **+ New** → **Database** → **PostgreSQL**
2. No serviço Postgres → **Variables** → copie `DATABASE_URL` (ou use **Connect** → **Variable Reference** no serviço App)

### 3. Configurar o serviço App

Abra o serviço da aplicação → **Settings**:

| Campo | Valor |
|-------|-------|
| **Root Directory** | *(vazio)* ou `/` — **nunca** `frontend` |
| **Builder** | **Dockerfile** (o `railway.toml` na raiz já força isso) |
| **Dockerfile Path** | `Dockerfile` |
| **Build Command** | *(vazio — deixe o Dockerfile fazer o build)* |
| **Start Command** | *(vazio — usa `deploy/entrypoint.sh` do Dockerfile)* |
| **Watch Paths** | *(opcional)* deixe padrão |

**Variables** (serviço App):

| Variável | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | Railway define automaticamente (`${{PORT}}`); o app lê `process.env.PORT` |
| `DATABASE_URL` | Referência ao Postgres: `${{Postgres.DATABASE_URL}}` ou cole a URL |

> Não defina `POSTGRES_PASSWORD` no App se usar o plugin Postgres — só `DATABASE_URL`.

### 4. Deploy

1. **Deploy** (push na branch conectada ou **Redeploy**)
2. Aguarde o build Docker (backend + frontend)
3. **Settings** → **Networking** → **Generate Domain**
4. Teste: `https://SEU-DOMINIO.up.railway.app/api/health` → `{"status":"ok",...}`

### 5. Importar CSV (opcional)

No serviço App → **Shell** ou one-off:

```bash
node backend/dist/scripts/import-csv.js
```

O arquivo `data/historico-solicitacoes.csv` já está na imagem Docker.

---

## Checklist rápido (dashboard)

```
Root Directory:     (vazio)
Builder:            Dockerfile
Dockerfile Path:    Dockerfile
Build Command:      (apagar se existir npm run build -w frontend)
Start Command:      (vazio)
Health Check Path:  /api/health   (opcional; railway.toml já define)
```

---

## Domínio customizado

1. App → **Settings** → **Networking** → **Custom Domain**
2. Crie CNAME apontando para o domínio Railway
3. HTTPS é automático

---

## Solução de problemas

### `No workspaces found: --workspace=frontend`

- Root Directory **não** pode ser `frontend`
- Remova **Build Command** customizado com `-w frontend`
- Confirme que `railway.toml` está na raiz do repo
- Faça **Redeploy** após corrigir

### Build OK, página em branco

- Confirme `NODE_ENV=production` (o backend só serve o frontend em produção)
- Veja logs: migrations e `API rodando em...`

### Erro de banco / migrations

- `DATABASE_URL` deve apontar para o Postgres do Railway (host interno, não `localhost`)
- Logs do App na primeira subida: `Executando migrations...`

### Quero só o frontend estático?

Não é suportado sem mudar código: o React chama `/api` no **mesmo domínio**. Separar frontend exigiria CORS, URL da API e outro host para o backend.

---

## Desenvolvimento local (equivalente ao Railway)

```bash
# Build como no Docker
npm ci
cd backend && npm run build && cd ../frontend && npm run build

# Ou imagem completa
docker build -t assessoria-railway .
docker run --rm -p 3001:3001 -e NODE_ENV=production -e DATABASE_URL=... assessoria-railway
```

---

## Arquivos de deploy Railway

| Arquivo | Função |
|---------|--------|
| `railway.toml` | Força builder Dockerfile e health check |
| `Dockerfile` | Build monorepo (backend + frontend) e runtime |
| `nixpacks.toml` | Fallback se Nixpacks for usado na raiz |
| `deploy/entrypoint.sh` | Migrations + start da API |
