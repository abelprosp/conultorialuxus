-- Faturamento mensal: serviços contratados, competências, liberações e export financeiro

CREATE TABLE IF NOT EXISTS servicos_contrato (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  tipo_calculo VARCHAR(20) NOT NULL CHECK (tipo_calculo IN ('fixo', 'percentual', 'por_linha')),
  requer_liberacao BOOLEAN NOT NULL DEFAULT FALSE,
  ordem SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO servicos_contrato (codigo, nome, tipo_calculo, requer_liberacao, ordem) VALUES
  ('call_center', 'Call center', 'fixo', FALSE, 1),
  ('ajuste', 'Ajuste', 'percentual', TRUE, 2),
  ('contestacao', 'Contestação', 'percentual', TRUE, 3),
  ('software', 'Software', 'por_linha', TRUE, 4),
  ('vlr_fixado', 'Vlr fixado (outros)', 'fixo', FALSE, 5)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS colaboradores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO colaboradores (nome)
SELECT nome FROM solicitantes
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS clientes_servicos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos_contrato(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  valor_fixo NUMERIC(14, 2),
  percentual NUMERIC(8, 4),
  valor_por_linha NUMERIC(14, 2),
  responsavel_id INTEGER REFERENCES colaboradores(id),
  UNIQUE (cliente_id, servico_id)
);

CREATE INDEX IF NOT EXISTS idx_clientes_servicos_cliente ON clientes_servicos (cliente_id);

ALTER TABLE clientes_config
  ADD COLUMN IF NOT EXISTS dia_limite_emissao SMALLINT,
  ADD COLUMN IF NOT EXISTS vcto_obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vcto_obrigatorio_explicacao TEXT,
  ADD COLUMN IF NOT EXISTS vcto_sugerido_dia SMALLINT,
  ADD COLUMN IF NOT EXISTS motivo_padrao TEXT,
  ADD COLUMN IF NOT EXISTS solicitante_padrao_id INTEGER REFERENCES solicitantes(id),
  ADD COLUMN IF NOT EXISTS cliente_novo_padrao BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS competencias (
  id SERIAL PRIMARY KEY,
  ano SMALLINT NOT NULL,
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status VARCHAR(20) NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ano, mes)
);

CREATE TABLE IF NOT EXISTS faturamentos_mensais (
  id SERIAL PRIMARY KEY,
  competencia_id INTEGER NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  base_ajuste NUMERIC(14, 2),
  base_contestacao NUMERIC(14, 2),
  qtd_linhas_software INTEGER,
  outra_cobranca NUMERIC(14, 2),
  outra_cobranca_descricao TEXT,
  data_vencimento DATE,
  tipo_produto_id INTEGER REFERENCES tipos_produto(id),
  motivo TEXT,
  solicitante_id INTEGER REFERENCES solicitantes(id),
  cliente_novo BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  email_contato VARCHAR(200),
  empresa_emissora_id INTEGER REFERENCES empresas_emissoras(id),
  valor_call_center NUMERIC(14, 2),
  valor_ajuste NUMERIC(14, 2),
  valor_contestacao NUMERIC(14, 2),
  valor_software NUMERIC(14, 2),
  valor_fixado NUMERIC(14, 2),
  valor_total NUMERIC(14, 2),
  status VARCHAR(30) NOT NULL DEFAULT 'rascunho',
  solicitacao_id INTEGER REFERENCES solicitacoes_cobranca(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competencia_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_faturamentos_competencia ON faturamentos_mensais (competencia_id);
CREATE INDEX IF NOT EXISTS idx_faturamentos_cliente ON faturamentos_mensais (cliente_id);
CREATE INDEX IF NOT EXISTS idx_faturamentos_status ON faturamentos_mensais (status);

CREATE TABLE IF NOT EXISTS faturamento_liberacoes (
  id SERIAL PRIMARY KEY,
  faturamento_id INTEGER NOT NULL REFERENCES faturamentos_mensais(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos_contrato(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  liberado_por_colaborador_id INTEGER REFERENCES colaboradores(id),
  liberado_em TIMESTAMPTZ,
  observacao TEXT,
  UNIQUE (faturamento_id, servico_id)
);

CREATE INDEX IF NOT EXISTS idx_liberacoes_faturamento ON faturamento_liberacoes (faturamento_id);
