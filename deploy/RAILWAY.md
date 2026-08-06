# Deploy no Railway

Guia para publicar o **Assessoria Cobranças** no [Railway](https://railway.app). O frontend React é servido pelo backend Express na mesma URL — **use um único serviço de app**, não dois.

---

## CRÍTICO — um serviço só (não separe frontend)

O deploy correto usa **UM único serviço** com o `Dockerfile` na **raiz do repositório**. Esse container sobe a API **e** serve o React estático (`/app/frontend/dist`).

| Situação | O que você vê | Causa |
|----------|---------------|-------|
| **2 serviços** (App + Frontend) | Backend “ok”, frontend falha, healthcheck `/api/health` timeout | O serviço **Frontend** não tem API — o probe falha |
| **Root Directory = `frontend`** | Build Nixpacks ou estático sem `/api/health` | Railway ignora o monorepo e o Dockerfile da raiz |
| **1 serviço correto** | `/api/health` → 200, `/api/health/db` → 200, `/` → HTML | Dockerfile na raiz, `DATABASE_URL` conectado |

### Apagar serviço frontend separado (se existir)

1. Abra o projeto no [Railway](https://railway.app)
2. No **canvas**, clique no serviço que se chama **Frontend** (ou similar) — **não** clique no Postgres
3. Aba **Settings** → role até **Danger** (ou **Service Settings**)
4. **Delete Service** / **Remove Service** → confirme
5. Mantenha apenas: **1 serviço App** (Dockerfile) + **1 Postgres**

### Corrigir serviço com Root Directory = `frontend`

Se você **não** quer apagar e prefere reutilizar o serviço:

1. Clique no serviço → **Settings** → **Source**
2. **Root Directory** → apague `frontend` e deixe **vazio** (raiz do repo)
3. **Builder** → **Dockerfile**
4. **Dockerfile Path** → `Dockerfile`
5. **Build Command** → apague qualquer `npm run build -w frontend`
6. **Start Command** → **vazio** (usa `deploy/entrypoint.sh`)
7. **Variables** → `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`
8. **Networking** → **Generate Domain** neste serviço (não no que você apagou)
9. **Deploy Latest Commit** (`Cmd+K` → Deploy Latest Commit)

### Como saber se está certo

Nos **logs de deploy** do serviço App, após subir:

```
[startup] frontend dist=/app/frontend/dist exists=true index.html=true
[startup] PORT=... HOST=0.0.0.0 NODE_ENV=production ...
API rodando em http://0.0.0.0:...
```

Teste a URL pública:

- `https://SEU-DOMINIO.up.railway.app/api/health` → `{"status":"ok",...}`
- `https://SEU-DOMINIO.up.railway.app/api/health/db` → `{"status":"ok","db":"connected","schema":"ready",...}`
- `https://SEU-DOMINIO.up.railway.app/` → página HTML do React

Se `exists=false` nos logs, o build Docker não gerou o frontend — confira Root Directory vazio e redeploy.

---

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
5. Teste banco: `/api/health/db` → schema ready (se 503, veja [Erro de banco](#erro-de-banco--migrations-rotas-api--500))

### 5. Importar CSV (opcional)

Somente após `/api/health/db` retornar `schema: ready`.

**Via CLI:**

```bash
railway run node backend/dist/scripts/import-csv.js
```

**Via Shell** no serviço App:

```bash
node backend/dist/scripts/import-csv.js
```

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

### Health check falha (`/api/health` → service unavailable)

Sintoma nos logs de deploy:

```
Path: /api/health
Attempt #1-6 failed with service unavailable
```

**Causas comuns (e correções no repo):**

| Causa | Sintoma | Correção |
|-------|---------|----------|
| Migrations bloqueavam o listen | Build OK, health timeout | Migrations **síncronas** antes do app (`entrypoint.sh`, timeout 120s) |
| **PORT divergente** | Logs: entrypoint `3001`, Node `47291` | `export PORT` no entrypoint + fallback `8080` em produção (`index.ts`) |
| `node_modules` ausente no runner | Crash: `Cannot find package 'express'` | Dockerfile copia `node_modules` do builder (após `npm prune --omit=dev`) |
| CRLF no `entrypoint.sh` | `exec format error` ou shebang quebrado | `.gitattributes` força LF em `*.sh` |
| Start Command customizado | Ignora entrypoint ou roda comando errado | Deixe **vazio** no dashboard |

**Comportamento esperado após o fix:**

1. App aguarda Postgres e roda migrations **antes** de abrir a porta (até 120s)
2. `/api/health` **não depende** do banco; `/api/health/db` diagnostica conexão e schema
3. Logs: `=== Startup ===`, `MIGRATION_STATUS=...`, `[startup] Banco OK — schema pronto`

**Checklist se ainda falhar:**

| Verificação | Esperado |
|-------------|----------|
| Root Directory | *(vazio)* — raiz do monorepo |
| Builder | Dockerfile (não Nixpacks) |
| Start Command | *(vazio)* — usa `deploy/entrypoint.sh` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` no serviço App |
| **Não sobrescrever `PORT`** | Railway injeta automaticamente; valor manual pode quebrar o health check |
| Logs de startup | `[startup] PORT=` igual ao `PORT=` do entrypoint |
| Health manual | `curl https://SEU-DOMINIO.up.railway.app/api/health` → `{"status":"ok",...}` |

**Teste local simulando Railway:**

```bash
docker build -t assessoria-railway .

# Com PORT do Railway (health deve responder na mesma porta)
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  assessoria-railway
curl http://localhost:8080/api/health

# Sem PORT no env — app deve usar 8080 (fallback produção), não 47291
docker run --rm -p 8080:8080 -e NODE_ENV=production assessoria-railway
curl http://localhost:8080/api/health

# Com DATABASE_URL inválida — health ainda responde antes das migrations
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://u:p@invalid:5432/db \
  assessoria-railway
curl http://localhost:8080/api/health
```

### Erro de banco / migrations (rotas `/api/*` → 500)

Sintoma: `/api/health` → 200, mas `/api/dashboard`, `/api/clientes`, etc. → 500.

**Diagnóstico rápido:**

```bash
curl https://SEU-DOMINIO.up.railway.app/api/health/db
```

| Resposta | Significado | Ação |
|----------|-------------|------|
| `db: disconnected` | App não conecta ao Postgres | Conectar plugin Postgres e definir `DATABASE_URL` |
| `schema: missing` | Conectou, mas tabelas não existem | Rodar migration manualmente (abaixo) |
| `status: ok` | Banco OK | Se ainda houver 500, veja logs do App |

**Causas comuns:**

| Causa | Sintoma nos logs |
|-------|------------------|
| **`DATABASE_URL` ausente** no serviço App | `DATABASE_URL unset`, `MIGRATION_STATUS=skipped` |
| **Postgres não conectado** ao App | `[db] ... connection refused` ou SSL error |
| **Migrations falharam** (SSL, timeout) | `MIGRATION_STATUS=failed`, `[migrate] conexão tentativa N/30` |
| **SSL obrigatório** (Railway Postgres) | `no pg_hba.conf entry` — corrigido automaticamente para hosts `*.railway.*` |

### Conectar Postgres ao serviço App (obrigatório)

1. No canvas do projeto → **+ New** → **Database** → **PostgreSQL** (se ainda não existir)
2. Clique no serviço **App** (não no Postgres) → aba **Variables**
3. **+ New Variable** → **Add Reference**:
   - Serviço: **Postgres**
   - Variável: `DATABASE_URL`
4. Ou cole manualmente: valor de **Postgres → Variables → DATABASE_URL**
5. **Redeploy** o serviço App após salvar

Formato esperado (host interno Railway):

```
postgresql://postgres:****@postgres.railway.internal:5432/railway
```

> Use `${{Postgres.DATABASE_URL}}` ou **Variable Reference** — não use `localhost`.

### Rodar migrations manualmente

Após conectar o Postgres, se `/api/health/db` mostrar `schema: missing`:

**Via CLI (recomendado):**

```bash
# Instale: npm i -g @railway/cli && railway login
railway link          # selecione o projeto
railway run node backend/dist/scripts/migrate.js
```

**Via Shell no dashboard:**

1. Serviço App → aba **Shell** (ou one-off command)
2. Execute:

```bash
node backend/dist/scripts/migrate.js
```

Logs esperados:

```
[migrate] DATABASE_URL=set host=postgres.railway.internal
[migrate] Conexão OK (tentativa 1/30)
[migrate] Migration concluída — schema verificado.
```

### Importar CSV (opcional, após migration)

```bash
railway run node backend/dist/scripts/import-csv.js
```

Ou no Shell do App:

```bash
node backend/dist/scripts/import-csv.js
```

O arquivo `data/historico-solicitacoes.csv` já está na imagem Docker.

### Comportamento do startup (após fix)

1. `entrypoint.sh` roda **migrations de forma síncrona** (até 120s) **antes** de subir a API
2. `/api/health` — não depende do banco (healthcheck Railway)
3. `/api/health/db` — diagnóstico de conexão + schema
4. Logs: `MIGRATION_STATUS=ok|failed|skipped` e `[startup] Banco OK — schema pronto`

**Checklist:**

| Verificação | Esperado |
|-------------|----------|
| Plugin Postgres | Existe no canvas |
| `DATABASE_URL` no App | Referência ao Postgres (não vazio) |
| Logs de startup | `MIGRATION_STATUS=ok` |
| `/api/health/db` | `{"status":"ok","db":"connected","schema":"ready",...}` |
| `/api/clientes` | `[]` ou lista (não 500) |

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
