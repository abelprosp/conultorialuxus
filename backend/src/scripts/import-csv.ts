import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { assertDatabaseUrl, closePool, getPool, resolveDatabaseUrl } from '../db.js';
import {
  normalizeCnpj,
  normalizeProductType,
  parseBooleanClienteNovo,
  parseValorBoleto,
  parseDate,
  parseTimestamp,
  normalizeSolicitante,
  categorizeMotivo,
  motivoToStatus,
  normalizeEmpresaEmissora,
} from '../utils/parsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CsvRow {
  'Carimbo de data/hora': string;
  'Razão Social Cliente': string;
  'CNPJ do Cliente': string;
  'Valor do boleto:': string;
  'Data de Vencimento': string;
  'Tipo de produto:': string;
  'Motivo:': string;
  'QUEM SOLICITOU': string;
  'Cliente novo?': string;
  Obsevações: string;
  'Emissão por qual CNPJ?': string;
  'Endereço de e-mail': string;
}

async function getOrCreate<T extends { id: number }>(
  table: string,
  column: string,
  value: string
): Promise<number> {
  const existing = await getPool().query<T>(`SELECT id FROM ${table} WHERE ${column} = $1`, [value]);
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await getPool().query<T>(
    `INSERT INTO ${table} (${column}) VALUES ($1) RETURNING id`,
    [value]
  );
  return inserted.rows[0].id;
}

async function getOrCreateTipoProduto(nome: string, nomeNormalizado: string): Promise<number> {
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

async function getOrCreateCliente(razaoSocial: string, cnpj: string | null): Promise<number> {
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

async function importCsv(csvPath: string) {
  if (!existsSync(csvPath)) {
    throw new Error(`Arquivo CSV não encontrado: ${csvPath}`);
  }

  const content = readFileSync(csvPath, 'utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];

  console.log(`Importando ${rows.length} linhas do CSV...`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const razaoSocial = row['Razão Social Cliente']?.trim();
    const motivo = row['Motivo:']?.trim();

    if (!razaoSocial || !motivo) {
      skipped++;
      continue;
    }

    const cnpj = normalizeCnpj(row['CNPJ do Cliente']);
    const clienteId = await getOrCreateCliente(razaoSocial, cnpj);

    const productRaw = row['Tipo de produto:']?.trim() ?? '';
    const productNorm = normalizeProductType(productRaw);
    const tipoProdutoId = productRaw ? await getOrCreateTipoProduto(productRaw, productNorm) : null;

    const empresaRaw = normalizeEmpresaEmissora(row['Emissão por qual CNPJ?']);
    const empresaId = empresaRaw
      ? await getOrCreate('empresas_emissoras', 'nome', empresaRaw)
      : null;

    const solicitanteRaw = normalizeSolicitante(row['QUEM SOLICITOU']);
    const solicitanteId = solicitanteRaw
      ? await getOrCreate('solicitantes', 'nome', solicitanteRaw)
      : null;

    const categoriaCodigo = categorizeMotivo(motivo);
    const catResult = await getPool().query<{ id: number }>(
      'SELECT id FROM categorias_motivo WHERE codigo = $1',
      [categoriaCodigo]
    );
    const categoriaId = catResult.rows[0]?.id ?? null;

    const { numeric: valor, original: valorOriginal } = parseValorBoleto(row['Valor do boleto:']);
    const { date: vencimento, original: vencimentoOriginal } = parseDate(row['Data de Vencimento']);
    const { date: carimbo, original: carimboOriginal } = parseTimestamp(row['Carimbo de data/hora']);

    const status = motivoToStatus(categoriaCodigo);
    const email = row['Endereço de e-mail']?.trim() || null;
    const observacoes = row['Obsevações']?.trim() || null;

    await getPool().query(
      `INSERT INTO solicitacoes_cobranca (
        cliente_id, carimbo_data_hora, carimbo_original,
        valor_boleto, valor_boleto_original,
        data_vencimento, data_vencimento_original,
        tipo_produto_id, motivo_original, categoria_motivo_id,
        solicitante_id, cliente_novo, observacoes,
        empresa_emissora_id, email_contato, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        clienteId,
        carimbo,
        carimboOriginal,
        valor,
        valorOriginal,
        vencimento,
        vencimentoOriginal,
        tipoProdutoId,
        motivo,
        categoriaId,
        solicitanteId,
        parseBooleanClienteNovo(row['Cliente novo?']),
        observacoes,
        empresaId,
        email,
        status,
      ]
    );

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

    imported++;
  }

  console.log(`Importação concluída: ${imported} registros importados, ${skipped} ignorados.`);
}

const defaultPath = resolve(__dirname, '../../../data/historico-solicitacoes.csv');
const csvPath = process.env.CSV_PATH
  ? resolve(process.cwd(), process.env.CSV_PATH)
  : defaultPath;

async function main() {
  assertDatabaseUrl('import-csv');
  await importCsv(csvPath);
  await closePool();
}

main().catch((err) => {
  console.error('Erro na importação:', err);
  closePool().finally(() => process.exit(1));
});
