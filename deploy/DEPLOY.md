# Deploy na VPS — consultoria.redobrai.online

Guia para subir o sistema **Assessoria Cobranças** em Ubuntu/Debian com Docker.

**Repositório:** https://github.com/abelprosp/conultorialuxus.git  
**Domínio:** `consultoria.redobrai.online`

---

## Mapa de portas

| Serviço | Ambiente | Porta host | Porta interna | Arquivo / variável |
|---------|----------|------------|---------------|---------------------|
| API (backend) | dev | **47291** | — | `backend/.env` → `PORT` |
| Frontend (Vite) | dev | **51837** | — | `frontend/vite.config.ts` |
| PostgreSQL | dev | **55432** | 5432 | `docker-compose.yml` |
| App (produção) | prod | **38472** | 3001 | `.env` → `APP_PORT` |
| Nginx (reverse proxy) | prod | 80, 443 | — | proxy → `127.0.0.1:38472` |
| Caddy (HTTPS container) | prod | 80, 443 | 80, 443 | `deploy/docker-compose.caddy.yml` |

> A app Docker **nunca** usa a porta 80 do host. Com **nginx no host** (Opção B, recomendada nesta VPS), a app fica em `localhost:38472` e o nginx termina HTTPS nas portas 80/443.

---

## Pré-requisitos na VPS

- Ubuntu 22.04+ ou Debian 12+
- Docker Engine + Docker Compose v2 (`docker compose version`)
- Git
- Portas **80** e **443** liberadas no firewall
- Registro DNS apontando para o IP da VPS

### Instalar Docker (se necessário)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker   # ou logout/login
```

### Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> Não é necessário abrir a porta **38472** publicamente — o nginx faz proxy localmente.

---

## Passo 1 — DNS

No painel DNS de `redobrai.online`, crie um registro **A**:

| Tipo | Nome/Host | Valor | TTL |
|------|-----------|-------|-----|
| A | `consultoria` | `IP-DA-VPS` | 300 |

Verifique a propagação:

```bash
dig +short consultoria.redobrai.online
# deve retornar o IP da VPS
```

---

## Passo 2 — Clonar o projeto

```bash
sudo mkdir -p /opt/conultorialuxus
sudo chown "$USER":"$USER" /opt/conultorialuxus
git clone https://github.com/abelprosp/conultorialuxus.git /opt/conultorialuxus
cd /opt/conultorialuxus
```

---

## Passo 3 — Configurar `.env` de produção

```bash
cd /opt/conultorialuxus
cp .env.production.example .env
nano .env
```

Defina uma senha forte em `POSTGRES_PASSWORD`:

```env
POSTGRES_USER=assessoria
POSTGRES_PASSWORD=SuaSenhaForte123!
APP_PORT=38472
```

Variáveis usadas pelo `docker-compose.prod.yml`:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `POSTGRES_PASSWORD` | Sim | Senha do PostgreSQL |
| `POSTGRES_USER` | Não | Padrão: `assessoria` |
| `APP_PORT` | Não | Padrão: `38472` (host → container `3001`) |

A `DATABASE_URL` é montada automaticamente pelo Compose — não precisa estar no `.env`.

---

## Passo 4 — Subir a aplicação (Opção B: nginx no host)

Use esta opção quando a VPS **já tem nginx** na porta 80 (caso deste deploy).

### 4a. Build e start com script

```bash
cd /opt/conultorialuxus
./deploy/deploy.sh
```

Equivalente manual:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

O entrypoint do container executa **migrations automaticamente** antes de iniciar a API.

### 4b. Verificar localmente (antes do nginx)

```bash
curl -s http://127.0.0.1:38472/api/health
curl -s http://127.0.0.1:38472/api/health/db
```

Respostas esperadas:

- `/api/health` → `{"status":"ok","service":"assessoria-cobrancas"}`
- `/api/health/db` → `{"status":"ok","db":"connected","schema":"ready",...}`

### 4c. Configurar nginx como reverse proxy

```bash
cd /opt/conultorialuxus
./deploy/deploy.sh --setup-nginx
```

Ou manualmente:

```bash
sudo cp deploy/nginx-consultoria.conf /etc/nginx/sites-available/consultoria.redobrai.online
sudo ln -sf /etc/nginx/sites-available/consultoria.redobrai.online /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Arquivo de referência: `deploy/nginx-consultoria.conf` (proxy → `127.0.0.1:38472`).

### 4d. HTTPS com Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d consultoria.redobrai.online
```

Teste final:

```bash
curl -s https://consultoria.redobrai.online/api/health
curl -s https://consultoria.redobrai.online/api/health/db
```

Acesse no navegador: **https://consultoria.redobrai.online**

---

## Passo 5 — Importar CSV histórico (opcional)

O arquivo padrão é `data/historico-solicitacoes.csv` (montado no container em `/app/data`).

```bash
cd /opt/conultorialuxus
./deploy/deploy.sh --import-csv
```

Equivalente:

```bash
docker compose -f docker-compose.prod.yml exec app node backend/dist/scripts/import-csv.js
```

---

## Comandos úteis de manutenção

| Ação | Comando |
|------|---------|
| Ver status | `docker compose -f docker-compose.prod.yml ps` |
| Logs da app | `docker compose -f docker-compose.prod.yml logs -f app` |
| Logs do Postgres | `docker compose -f docker-compose.prod.yml logs -f postgres` |
| Reiniciar app | `docker compose -f docker-compose.prod.yml restart app` |
| Parar tudo | `docker compose -f docker-compose.prod.yml down` ou `./deploy/deploy.sh --down` |
| Atualizar após `git pull` | `git pull && ./deploy/deploy.sh` |
| Backup do banco | `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U assessoria assessoria_cobrancas > backup-$(date +%F).sql` |
| Restaurar backup | `cat backup.sql \| docker compose -f docker-compose.prod.yml exec -T postgres psql -U assessoria assessoria_cobrancas` |
| Migrations manuais | `docker compose -f docker-compose.prod.yml exec app node backend/dist/scripts/migrate.js` |

---

## Alternativa A — Caddy em container (HTTPS automático)

Use **somente se a porta 80 do host estiver livre** (sem nginx/apache).

```bash
cd /opt/conultorialuxus
./deploy/deploy.sh --caddy
```

Equivalente:

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
curl -s https://consultoria.redobrai.online/api/health
```

Com overlay Caddy, a app **não** publica porta no host — o Caddy faz proxy para `app:3001` na rede Docker.

---

## Alternativa B — Só IP (teste, sem domínio)

```bash
cd /opt/conultorialuxus
# .env com APP_PORT=38472
docker compose -f docker-compose.prod.yml up -d --build
curl -s http://IP-DA-VPS:38472/api/health
```

---

## Solução de problemas

### Porta 80 já em uso (nginx)

Erro ao subir Caddy:

```
failed to bind host port 0.0.0.0:80/tcp: address already in use
```

**Solução:** use a Opção B (nginx no host), **não** o overlay Caddy.

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml down 2>/dev/null || true
./deploy/deploy.sh
./deploy/deploy.sh --setup-nginx
sudo certbot --nginx -d consultoria.redobrai.online
```

Descobrir o que usa a porta 80:

```bash
sudo ss -tlnp | grep ':80 '
```

### App não sobe

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 app
```

### Banco não conecta

- Confira `POSTGRES_PASSWORD` no `.env`
- Teste: `curl -s http://127.0.0.1:38472/api/health/db`

### Migrations falharam

```bash
docker compose -f docker-compose.prod.yml exec app node backend/dist/scripts/migrate.js
```

### Página em branco

Confirme que o build incluiu o frontend:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs app | grep frontend
```

### Erro `!reset` no compose

Atualize Docker Compose para v2.24+:

```bash
docker compose version
```

---

## Resumo rápido (Opção B — nginx)

```bash
# Na VPS
git clone https://github.com/abelprosp/conultorialuxus.git /opt/conultorialuxus
cd /opt/conultorialuxus
cp .env.production.example .env && nano .env   # POSTGRES_PASSWORD
./deploy/deploy.sh
./deploy/deploy.sh --setup-nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d consultoria.redobrai.online
curl -s https://consultoria.redobrai.online/api/health
./deploy/deploy.sh --import-csv   # opcional
```
