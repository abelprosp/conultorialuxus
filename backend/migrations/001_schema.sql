-- Schema para controle de cobranças Assessoria (baseado na planilha Excel)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos de produto (movel/assessoria, Aluguel, FIXO, gerenciamento)
CREATE TABLE IF NOT EXISTS tipos_produto (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  nome_normalizado VARCHAR(100) NOT NULL UNIQUE
);

-- Empresas emissoras (LUXUS TELEFONIA LTDA, CARDOSO E POLI, etc.)
CREATE TABLE IF NOT EXISTS empresas_emissoras (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL UNIQUE
);

-- Solicitantes (Jenifer, Bruna, Lisete, etc.)
CREATE TABLE IF NOT EXISTS solicitantes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE
);

-- Categorias de motivo/ação (workflow normalizado)
CREATE TABLE IF NOT EXISTS categorias_motivo (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  descricao VARCHAR(200) NOT NULL
);

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  razao_social VARCHAR(500) NOT NULL,
  cnpj VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes (cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
CREATE INDEX IF NOT EXISTS idx_clientes_razao ON clientes (razao_social);

-- Configuração de cobrança por cliente (derivada dos padrões mais recentes)
CREATE TABLE IF NOT EXISTS clientes_config (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo_produto_id INTEGER REFERENCES tipos_produto(id),
  empresa_emissora_id INTEGER REFERENCES empresas_emissoras(id),
  email_contato VARCHAR(200),
  observacoes_padrao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id)
);

-- Status do workflow de cobrança
CREATE TYPE status_cobranca AS ENUM (
  'pendente',
  'em_processamento',
  'emitido',
  'cancelado',
  'alterado',
  'correcao'
);

-- Solicitações de cobrança (histórico da planilha - uma linha por solicitação)
CREATE TABLE IF NOT EXISTS solicitacoes_cobranca (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  carimbo_data_hora TIMESTAMPTZ,
  carimbo_original VARCHAR(100),
  valor_boleto NUMERIC(14, 2),
  valor_boleto_original VARCHAR(50),
  data_vencimento DATE,
  data_vencimento_original VARCHAR(50),
  tipo_produto_id INTEGER REFERENCES tipos_produto(id),
  motivo_original TEXT NOT NULL,
  categoria_motivo_id INTEGER REFERENCES categorias_motivo(id),
  solicitante_id INTEGER REFERENCES solicitantes(id),
  cliente_novo BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  empresa_emissora_id INTEGER REFERENCES empresas_emissoras(id),
  email_contato VARCHAR(200),
  status status_cobranca NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_cliente ON solicitacoes_cobranca (cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_vencimento ON solicitacoes_cobranca (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_cobranca (status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_carimbo ON solicitacoes_cobranca (carimbo_data_hora);

-- Seed categorias de motivo
INSERT INTO categorias_motivo (codigo, descricao) VALUES
  ('emissao_nota_boleto', 'Emissão de nota fiscal e boleto'),
  ('emissao_apenas_nota', 'Emissão apenas da nota fiscal'),
  ('emissao_apenas_boleto', 'Emissão apenas do boleto'),
  ('cancelamento', 'Cancelamento de NF e/ou boleto'),
  ('alteracao_vencimento', 'Alteração de vencimento'),
  ('correcao', 'Correção / ajuste'),
  ('outros', 'Outros')
ON CONFLICT (codigo) DO NOTHING;
