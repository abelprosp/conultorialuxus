# Deploy na VPS

Guia para subir o sistema Assessoria Cobranças em um servidor Linux (Ubuntu/Debian) com Docker.

**Domínio de produção:** `consultoria.redobrai.online`

## Mapa de portas

| Serviço | Ambiente | Porta host | Porta interna | Arquivo / variável |
|---------|----------|------------|---------------|---------------------|
| API (backend) | dev | **47291** | — | `backend/.env` → `PORT` |
| Frontend (Vite) | dev | **51837** | — | `frontend/vite.config.ts` |
| PostgreSQL | dev | **55432** | 5432 | `docker-compose.yml` |
| App (produção) | prod | **38472** | 3001 | `.env` → `APP_PORT` |
| Caddy (HTTPS) | prod | 80, 443 | 80, 443 | `deploy/docker-compose.caddy.yml` |
| Nginx (reverse proxy) | prod | 80, 443 | — | proxy → `127.0.0.1:38472` |

> **Caddy e nginx** permanecem nas portas **80/443** do host (obrigatório para Let's Encrypt). A app Docker **nunca** usa a porta 80 — fica em **38472** no host ou só na rede interna Docker (com overlay Caddy).

---

```bash
cd /opt/assessoria
cp .env.production.example .env && nano .env   # POSTGRES_PASSWORD obrigatório
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
curl -s https://consultoria.redobrai.online/api/health
# CSV (opcional):
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml exec app node backend/dist/scripts/import-csv.js
```

Sem domínio (só IP): use `docker compose -f docker-compose.prod.yml up -d --build` com `APP_PORT=38472` no `.env`.

---

- Ubuntu 22.04+ ou Debian 12+
- Docker e Docker Compose v2.24+ (necessário para overlay do Caddy)
- Portas 80 e 443 liberadas no firewall
- Registro DNS apontando para o IP da VPS (ver abaixo)

### Instalar Docker (se ainda não tiver)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# faça logout/login ou: newgrp docker
```

---

## Passo 1 — DNS (consultoria.redobrai.online)

No painel DNS do domínio `redobrai.online`, crie um registro **A**:

| Tipo | Nome/Host | Valor | TTL |
|------|-----------|-------|-----|
| A | `consultoria` | `IP-DA-VPS` | 300 (ou padrão) |

Aguarde a propagação (minutos a algumas horas). Teste:

```bash
dig +short consultoria.redobrai.online
# deve retornar o IP da VPS
```

---

## Passo 2 — Enviar o projeto para a VPS

**Opção A — Git (recomendado)**

```bash
# Na VPS
git clone <url-do-seu-repositorio> /opt/assessoria
cd /opt/assessoria
```

**Opção B — SCP do seu Mac**

```bash
# No seu Mac (na pasta pai do projeto)
rsync -avz --exclude node_modules --exclude .git \
  consultoria/ usuario@IP-DA-VPS:/opt/assessoria/
```

---

## Passo 3 — Configurar variáveis de ambiente

```bash
cd /opt/assessoria
cp .env.production.example .env
nano .env
```

Defina uma senha forte em `POSTGRES_PASSWORD`. Para deploy com Caddy (HTTPS), **não** use a porta 80 na app — ela ficará só na rede interna do Docker:

```env
POSTGRES_USER=assessoria
POSTGRES_PASSWORD=SuaSenhaForte123!
APP_PORT=38472
```

> `APP_PORT=38472` é usado apenas se você expuser a app diretamente (sem overlay Caddy). Com `deploy/docker-compose.caddy.yml`, a app não publica porta no host; o Caddy faz o proxy para `app:3001`.

---

## Passo 4 — Subir com HTTPS (Caddy + Docker)

```bash
cd /opt/assessoria
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Aguarde o build (primeira vez leva alguns minutos). Verifique:

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml ps
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs -f caddy
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs -f app
```

Acesse: **https://consultoria.redobrai.online**

Teste a API: **https://consultoria.redobrai.online/api/health**

O Caddy obtém e renova o certificado Let's Encrypt automaticamente na primeira requisição HTTPS bem-sucedida (DNS deve estar propagado).

### Arquivos Caddy

- `deploy/Caddyfile` — domínio `consultoria.redobrai.online` → `app:3001`
- `deploy/docker-compose.caddy.yml` — serviço Caddy nas portas 80/443; app só na rede Docker

---

## Passo 4 (alternativo B) — Nginx no host + Docker (sem container Caddy)

Use quando a VPS **já tem nginx** na porta 80 (evita conflito com `deploy/docker-compose.caddy.yml`).

```bash
cd /opt/assessoria
# .env: APP_PORT=38472
docker compose -f docker-compose.prod.yml up -d --build
sudo cp deploy/nginx-consultoria.conf /etc/nginx/sites-available/consultoria.redobrai.online
sudo ln -sf /etc/nginx/sites-available/consultoria.redobrai.online /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d consultoria.redobrai.online
```

Detalhes e troubleshooting: seção **Porta 80 já em uso** abaixo.

---

## Passo 4 (alternativo C) — Subir sem domínio (só IP)

Para testes rápidos sem HTTPS:

```bash
cd /opt/assessoria
# no .env: APP_PORT=38472
docker compose -f docker-compose.prod.yml up -d --build
```

Acesse: `http://IP-DA-VPS:38472`

---

## Passo 5 — Importar o CSV histórico (opcional)

Se quiser carregar os dados da planilha na VPS:

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml exec app node backend/dist/scripts/import-csv.js
```

(Omita `-f deploy/docker-compose.caddy.yml` se estiver no modo sem Caddy.)

O arquivo deve estar em `data/historico-solicitacoes.csv` (já incluído no projeto).

---

## Passo 6 — Caddy no host (alternativa)

Se preferir Caddy instalado no sistema em vez do container:

```bash
sudo apt install -y caddy
sudo cp /opt/assessoria/deploy/Caddyfile /etc/caddy/Caddyfile
# Edite para usar localhost:38472 em vez de app:3001:
sudo sed -i 's/app:3001/localhost:38472/' /etc/caddy/Caddyfile
```

No `.env`: `APP_PORT=38472`

```bash
cd /opt/assessoria
docker compose -f docker-compose.prod.yml up -d --build
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

---

## Comandos úteis

| Ação | Comando |
|------|---------|
| Ver logs (app) | `docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs -f app` |
| Ver logs (Caddy) | `docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs -f caddy` |
| Parar | `docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml down` |
| Atualizar após git pull | `docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build` |
| Backup do banco | `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U assessoria assessoria_cobrancas > backup.sql` |
| Restaurar backup | `cat backup.sql \| docker compose -f docker-compose.prod.yml exec -T postgres psql -U assessoria assessoria_cobrancas` |

---

## Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Solução de problemas

**App não sobe:** `docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs app`

**Caddy não emite certificado:** confira DNS (`dig consultoria.redobrai.online`), portas 80/443 abertas e logs do Caddy

**Banco não conecta:** confira se `POSTGRES_PASSWORD` no `.env` está definida

**Página em branco:** confira se o build incluiu o frontend (`docker compose ... up --build`)

**Erro `!reset` no compose:** atualize Docker Compose para v2.24+ (`docker compose version`)

### Porta 80 já em uso

Erro típico ao subir com overlay Caddy:

```
Error response from daemon: failed to bind host port 0.0.0.0:80/tcp: address already in use
```

Isso significa que **outro processo no host** (geralmente **nginx** ou **apache**) já escuta na porta 80. O container Caddy não consegue publicar `80:80`.

#### 1. Descobrir o que está usando a porta 80

```bash
sudo ss -tlnp | grep ':80 '
# ou
sudo lsof -i :80
```

Exemplos de saída:

| Processo | Ação recomendada |
|----------|------------------|
| `nginx` | Opção B (nginx como proxy) — mais comum em VPS |
| `apache2` / `httpd` | Opção B adaptada para Apache, ou Opção A |
| `caddy` (host) | Opção A — pare o Caddy do sistema e use o container |
| outro container Docker | `docker ps` e pare o container conflitante |

---

#### Opção A — Parar o serviço conflitante e usar o Caddy em container (recomendado se a VPS não precisa de nginx)

```bash
cd ~/conultorialuxus   # ajuste o caminho se necessário

# Pare qualquer tentativa anterior
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml down

# Pare nginx/apache/caddy do host (use o que apareceu no ss/lsof)
sudo systemctl stop nginx
sudo systemctl disable nginx
# sudo systemctl stop apache2 && sudo systemctl disable apache2
# sudo systemctl stop caddy && sudo systemctl disable caddy

# Confirme que a porta 80 está livre
sudo ss -tlnp | grep ':80 ' || echo "Porta 80 livre"

# Suba com Caddy
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build

# Teste
curl -s https://consultoria.redobrai.online/api/health
```

> Com overlay Caddy, **não** publique a app na porta 80 do host. No `.env`, use `APP_PORT=38472` (ou omita — o overlay Caddy reseta as portas da app).

---

#### Opção B — Manter nginx no host como reverse proxy (recomendado em VPS que já usa nginx)

Use esta opção quando nginx (ou outro proxy) já gerencia outros sites na mesma VPS. A app Docker fica em `localhost:38472`; o nginx termina HTTPS na porta 80/443.

```bash
cd ~/conultorialuxus   # ajuste o caminho se necessário

# Pare o overlay Caddy (se tentou antes)
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml down 2>/dev/null || true

# .env: app exposta só em 38472 no host
grep -q '^APP_PORT=' .env && sed -i 's/^APP_PORT=.*/APP_PORT=38472/' .env || echo 'APP_PORT=38472' >> .env
grep -q '^POSTGRES_PASSWORD=' .env || { echo 'Defina POSTGRES_PASSWORD no .env'; exit 1; }

# Suba SEM overlay Caddy
docker compose -f docker-compose.prod.yml up -d --build

# Confirme que a app responde localmente
curl -s http://127.0.0.1:38472/api/health

# Instale o site nginx
sudo cp deploy/nginx-consultoria.conf /etc/nginx/sites-available/consultoria.redobrai.online
sudo ln -sf /etc/nginx/sites-available/consultoria.redobrai.online /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS com Let's Encrypt (certbot adiciona SSL ao bloco nginx)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d consultoria.redobrai.online

# Teste final
curl -s https://consultoria.redobrai.online/api/health
```

Arquivo de referência: `deploy/nginx-consultoria.conf` (proxy `consultoria.redobrai.online` → `127.0.0.1:38472`).

Para **Apache** em vez de nginx, crie um VirtualHost equivalente apontando `ProxyPass / http://127.0.0.1:38472/` e use `certbot --apache`.

---

#### Opção C — Caddy/nginx em portas alternativas (não recomendado para produção)

Só use para teste rápido. Let's Encrypt exige portas 80/443 no domínio público; HTTPS automático não funcionará sem ajustes avançados de DNS.

Exemplo (Caddy em 41807/52913 — **sem HTTPS válido para visitantes**):

```yaml
# deploy/docker-compose.caddy-alt-ports.yml (não incluído — apenas referência)
ports:
  - "41807:80"
  - "52913:443"
```

Prefira sempre Opção A ou B para `https://consultoria.redobrai.online` funcionar corretamente.
