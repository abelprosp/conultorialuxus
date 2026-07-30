# Deploy na VPS

Guia para subir o sistema Assessoria Cobranças em um servidor Linux (Ubuntu/Debian) com Docker.

**Domínio de produção:** `consultoria.redobrai.online`

## Início rápido (na VPS)

```bash
cd /opt/assessoria
cp .env.production.example .env && nano .env   # POSTGRES_PASSWORD obrigatório
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
curl -s https://consultoria.redobrai.online/api/health
# CSV (opcional):
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml exec app node backend/dist/scripts/import-csv.js
```

Sem domínio (só IP): use `docker compose -f docker-compose.prod.yml up -d --build` com `APP_PORT=80` no `.env`.

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
APP_PORT=8080
```

> `APP_PORT=8080` é usado apenas se você expuser a app diretamente (sem overlay Caddy). Com `deploy/docker-compose.caddy.yml`, a app não publica porta no host; o Caddy faz o proxy para `app:3001`.

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

## Passo 4 (alternativo) — Subir sem domínio (só IP)

Para testes rápidos sem HTTPS:

```bash
cd /opt/assessoria
# no .env: APP_PORT=80
docker compose -f docker-compose.prod.yml up -d --build
```

Acesse: `http://IP-DA-VPS`

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
# Edite para usar localhost:8080 em vez de app:3001:
sudo sed -i 's/app:3001/localhost:8080/' /etc/caddy/Caddyfile
```

No `.env`: `APP_PORT=8080`

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

**Porta 80 ocupada:** pare nginx/apache ou use apenas o overlay Caddy (`deploy/docker-compose.caddy.yml`)

**Erro `!reset` no compose:** atualize Docker Compose para v2.24+ (`docker compose version`)
