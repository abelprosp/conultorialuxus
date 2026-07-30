# Assessoria — Controle de Cobranças

Sistema web para gerenciar o fluxo de cobrança/emissão de NF e boleto dos clientes Assessoria, substituindo a planilha Excel compartilhada.

## Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Banco:** PostgreSQL 16 (Docker)
- **Importação:** CSV da planilha histórica

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm

## Configuração rápida

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente do backend (necessário antes de migrate/import)
cp backend/.env.example backend/.env

# 3. Subir PostgreSQL
npm run db:up

# 4. Aguardar o banco iniciar (~5s) e rodar migration + importação
npm run db:migrate
npm run db:import

# 5. Iniciar API + frontend
npm run dev
```

Acesse:
- **Frontend:** http://localhost:51837
- **API:** http://localhost:47291/api/health

## Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia backend (47291) e frontend (51837) |
| `npm run db:up` | Sobe PostgreSQL via Docker |
| `npm run db:down` | Para o container PostgreSQL |
| `npm run db:migrate` | Cria/atualiza schema do banco |
| `npm run db:import` | Importa CSV para o banco |
| `npm run setup` | Instala deps + sobe DB + migrate + import |

## Importar CSV

O arquivo padrão é `data/historico-solicitacoes.csv`. Para importar outro arquivo:

```bash
CSV_PATH=/caminho/para/arquivo.csv npm run db:import -w backend
```

Para reimportar do zero, limpe as tabelas ou recrie o volume Docker:

```bash
docker compose down -v
npm run db:up && sleep 5 && npm run db:migrate && npm run db:import
```

## Estrutura do projeto

```
consultoria/
├── docker-compose.yml      # PostgreSQL
├── data/                   # CSV de importação
├── backend/
│   ├── migrations/         # Schema SQL
│   └── src/
│       ├── routes/         # API REST
│       ├── scripts/        # migrate + import-csv
│       └── utils/          # parsers de data/valor/CNPJ
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Solicitações, Clientes
        └── components/
```

## API

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/dashboard` | Estatísticas gerais |
| `GET /api/clientes` | Lista clientes com config |
| `GET /api/clientes/:id` | Detalhe + histórico |
| `GET /api/solicitacoes` | Lista paginada com filtros |
| `GET /api/solicitacoes/filtros` | Opções de filtro |
| `PATCH /api/solicitacoes/:id/status` | Atualiza status workflow |

### Filtros de solicitações

`busca`, `tipo_produto`, `categoria_motivo`, `status`, `solicitante`, `empresa_emissora`, `cliente_novo`, `vencimento_de`, `vencimento_ate`, `page`, `limit`

## Mapeamento da planilha Excel

| Coluna CSV | Campo no sistema |
|------------|------------------|
| Carimbo de data/hora | `carimbo_data_hora` |
| Razão Social Cliente | `clientes.razao_social` |
| CNPJ do Cliente | `clientes.cnpj` |
| Valor do boleto: | `valor_boleto` |
| Data de Vencimento | `data_vencimento` |
| Tipo de produto: | `tipos_produto` |
| Motivo: | `motivo_original` + categoria |
| QUEM SOLICITOU | `solicitantes` |
| Cliente novo? | `cliente_novo` |
| Obsevações | `observacoes` |
| Emissão por qual CNPJ? | `empresas_emissoras` |
| Endereço de e-mail | `email_contato` |

## Status do workflow

O campo **Motivo** da planilha é categorizado automaticamente:

- Emissão NF + boleto → `pendente`
- Emissão apenas NF → `pendente`
- Emissão apenas boleto → `pendente`
- Cancelamento → `cancelado`
- Alteração de vencimento → `alterado`
- Correção/ajuste → `correcao`

Na interface, o status pode ser atualizado manualmente para `em_processamento`, `emitido`, etc.

## Credenciais PostgreSQL (Docker)

- Host: `localhost:55432`
- Database: `assessoria_cobrancas`
- User: `assessoria`
- Password: `assessoria`

## Observações

- Valores e datas com formatos inconsistentes no CSV (ex: `R$ 572,70`, `797.16`, `11-dez.`) são normalizados na importação, preservando o valor original quando necessário.
- Clientes são identificados preferencialmente por CNPJ; nomes duplicados com CNPJs diferentes geram registros separados.
- A configuração do cliente (`clientes_config`) é atualizada a cada importação com os dados mais recentes.
# conultorialuxus
