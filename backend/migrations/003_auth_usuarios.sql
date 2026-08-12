-- Autenticação, fechamento de competência e vínculo usuário-colaborador

ALTER TABLE competencias
  ADD COLUMN IF NOT EXISTS fechada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fechada_por_usuario_id INTEGER;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  senha_hash VARCHAR(200) NOT NULL,
  perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('admin', 'financeiro', 'contratado')),
  colaborador_id INTEGER REFERENCES colaboradores(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);
CREATE INDEX IF NOT EXISTS idx_usuarios_colaborador ON usuarios (colaborador_id);

-- Usuário admin inicial (senha: admin123 — troque após primeiro login)
INSERT INTO usuarios (nome, email, senha_hash, perfil)
SELECT
  'Administrador',
  'admin@luxus.local',
  '$2b$10$wWegKGcK.sxTvP5EzpWNE.3RGv5Uz0usMhzLmTkBdwYGSWG9LIYWK',
  'admin'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@luxus.local');
