import { getPool } from '../db.js';
import {
  normalizeCnpj,
  normalizeProductType,
  normalizeSolicitante,
  normalizeEmpresaEmissora,
  categorizeMotivo,
  motivoToStatus,
} from '../utils/parsers.js';
import type { status_cobranca } from '../types.js';

export async function getOrCreate(table: string, column: string, value: string): Promise<number> {
  const existing = await getPool().query<{ id: number }>(`SELECT id FROM ${table} WHERE ${column} = $1`, [value]);
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await getPool().query<{ id: number }>(
    `INSERT INTO ${table} (${column}) VALUES ($1) RETURNING id`,
    [value]
  );
  return inserted.rows[0].id;
}

export async function getOrCreateTipoProduto(nome: string, nomeNormalizado: string): Promise<number> {
  const existing = await getPool().query<{ id: number }>(
    'SELECT id FROM tipos_produto WHERE nome_normalizado = $1',
    [nomeNormalizado]
  );
  if (existing.rows[0]) {
    await getPool().query('UPDATE tipos_produto SET nome = $1 WHERE id = $2 AND nome <> $1', [
      nome,
      existing.rows[0].id,
    ]);
    return existing.rows[0].id;
  }

  const inserted = await getPool().query<{ id: number }>(
    'INSERT INTO tipos_produto (nome, nome_normalizado) VALUES ($1, $2) RETURNING id',
    [nome, nomeNormalizado]
  );
  return inserted.rows[0].id;
}

export async function getOrCreateCliente(razaoSocial: string, cnpj: string | null): Promise<number> {
  if (cnpj) {
    const byCnpj = await getPool().query<{ id: number }>(
      'SELECT id FROM clientes WHERE cnpj = $1',
      [cnpj]
    );
    if (byCnpj.rows[0]) {
      await getPool().query(
        'UPDATE clientes SET razao_social = $1, updated_at = NOW() WHERE id = $2',
        [razaoSocial, byCnpj.rows[0].id]
      );
      return byCnpj.rows[0].id;
    }
  }

  const byName = await getPool().query<{ id: number }>(
    'SELECT id FROM clientes WHERE razao_social = $1 AND (cnpj IS NULL OR cnpj = $2)',
    [razaoSocial, cnpj ?? '']
  );
  if (byName.rows[0]) {
    if (cnpj) {
      await getPool().query('UPDATE clientes SET cnpj = $1, updated_at = NOW() WHERE id = $2', [
        cnpj,
        byName.rows[0].id,
      ]);
    }
    return byName.rows[0].id;
  }

  const inserted = await getPool().query<{ id: number }>(
    'INSERT INTO clientes (razao_social, cnpj) VALUES ($1, $2) RETURNING id',
    [razaoSocial, cnpj]
  );
  return inserted.rows[0].id;
}

export async function upsertClienteConfig(
  clienteId: number,
  tipoProdutoId: number | null,
  empresaId: number | null,
  email: string | null,
  observacoes: string | null
): Promise<void> {
  await getPool().query(
    `INSERT INTO clientes_config (cliente_id, tipo_produto_id, empresa_emissora_id, email_contato, observacoes_padrao, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (cliente_id) DO UPDATE SET
       tipo_produto_id = COALESCE(EXCLUDED.tipo_produto_id, clientes_config.tipo_produto_id),
       empresa_emissora_id = COALESCE(EXCLUDED.empresa_emissora_id, clientes_config.empresa_emissora_id),
       email_contato = COALESCE(EXCLUDED.email_contato, clientes_config.email_contato),
       observacoes_padrao = COALESCE(EXCLUDED.observacoes_padrao, clientes_config.observacoes_padrao),
       updated_at = NOW()`,
    [clienteId, tipoProdutoId, empresaId, email, observacoes]
  );
}

export async function resolveTipoProdutoId(tipoProduto?: string | null): Promise<number | null> {
  if (!tipoProduto?.trim()) return null;
  const nome = tipoProduto.trim();
  return getOrCreateTipoProduto(nome, normalizeProductType(nome));
}

export async function resolveEmpresaId(empresa?: string | null): Promise<number | null> {
  const normalized = normalizeEmpresaEmissora(empresa);
  if (!normalized) return null;
  return getOrCreate('empresas_emissoras', 'nome', normalized);
}

export async function resolveSolicitanteId(solicitante?: string | null): Promise<number | null> {
  const normalized = normalizeSolicitante(solicitante);
  if (!normalized) return null;
  return getOrCreate('solicitantes', 'nome', normalized);
}

export async function resolveCategoria(
  motivo: string,
  categoriaCodigo?: string
): Promise<{ categoriaId: number | null; codigo: string; status: status_cobranca }> {
  const codigo = categoriaCodigo?.trim() || categorizeMotivo(motivo);
  const catResult = await getPool().query<{ id: number }>(
    'SELECT id FROM categorias_motivo WHERE codigo = $1',
    [codigo]
  );
  return {
    categoriaId: catResult.rows[0]?.id ?? null,
    codigo,
    status: motivoToStatus(codigo),
  };
}

export { normalizeCnpj, motivoToStatus, categorizeMotivo };
