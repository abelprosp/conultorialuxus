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
| **Watch Paths** | *(recomendado)* **vazio** — deploy em todo push; ou veja [Watch Paths](#watch-paths-deploy-nao-disparou) |

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

### Watch Paths — deploy não disparou

Mensagem típica nos logs do GitHub / Railway:

> No changes to watched files. If this change should have triggered a deploy, adjust the watch paths in your service settings.

**Por que acontece:** o serviço tem **Watch Paths** restritos (ex.: só `backend/**` ou `frontend/**`, comum em monorepos detectados automaticamente). O commit alterou arquivos na **raiz** ou em `deploy/` (`Dockerfile`, `railway.toml`, `nixpacks.toml`, `deploy/RAILWAY.md`) que **não batem** com esses padrões — o Railway recebe o push, mas **pula** o deploy.

**Opção A — mais simples (1 serviço só): limpar Watch Paths**

1. Abra o projeto no [Railway](https://railway.app)
2. Clique no **serviço App** (não no Postgres)
3. Aba **Settings**
4. Seção **Source** (ou **Deploy**)
5. Campo **Watch Paths** → apague **todas** as linhas (deixe vazio)
6. Salve (Railway salva automaticamente ao sair do campo)

Com Watch Paths vazio, **qualquer push** na branch conectada dispara deploy.

**Opção B — manter filtros: alinhar com o repositório**

No dashboard, em **Watch Paths**, use um padrão por linha (estilo `.gitignore`, sempre a partir da **raiz do repo**):

```gitignore
/backend/**
/frontend/**
/deploy/**
/data/**
/Dockerfile
/railway.toml
/nixpacks.toml
/package.json
/package-lock.json
```

O `railway.toml` na raiz já define `watchPatterns` equivalentes — em cada deploy, a config do arquivo **sobrescreve** o dashboard ([docs](https://docs.railway.com/config-as-code/reference#watch-patterns)). Depois do primeiro deploy com esse commit, os padrões passam a vir do repo.

**Redeploy manual agora (commit já no GitHub, deploy pulado)**

1. No canvas do projeto, clique no **serviço App**
2. Pressione **`Cmd + K`** (Mac) ou **`Ctrl + K`** (Windows/Linux)
3. Digite **Deploy Latest Commit** e confirme

Isso faz build do **último commit** da branch conectada (ex.: `main`), ignorando Watch Paths.

Alternativas:

- Aba **Deployments** → três pontos (**⋯**) em um deploy anterior → **Redeploy** — repete o **mesmo** commit daquele deploy (útil para reiniciar, não para pegar commit novo)
- CLI: `railway redeploy --service NOME_DO_SERVICO` (reinicia o último deploy) ou `railway up` (envia código local)

Para ver deploys pulados: **Deployments** → **Show Skipped**.

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
| `railway.toml` | Builder Dockerfile, health check e `watchPatterns` |
| `Dockerfile` | Build monorepo (backend + frontend) e runtime |
| `nixpacks.toml` | Fallback se Nixpacks for usado na raiz |
| `deploy/entrypoint.sh` | Migrations + start da API |
