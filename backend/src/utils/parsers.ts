import type { status_cobranca } from '../types.js';

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export function normalizeCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj?.trim()) return null;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj.trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function normalizeProductType(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower.includes('assessoria') || lower.includes('móvel') || lower.includes('movel')) {
    return 'movel/assessoria';
  }
  if (lower === 'fixo') return 'FIXO';
  if (lower === 'aluguel') return 'Aluguel';
  if (lower === 'gerenciamento') return 'gerenciamento';
  return raw.trim();
}

export function parseBooleanClienteNovo(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === 'sim' || v === 's';
}

export function parseValorBoleto(raw: string | null | undefined): { numeric: number | null; original: string | null } {
  if (!raw?.trim()) return { numeric: null, original: null };
  const original = raw.trim();
  let cleaned = original.replace(/R\$\s?/gi, '');

  // Formato brasileiro: 1.234,56
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    // Formato decimal americano: 797.16
    // mantém o ponto como separador decimal
  } else {
    cleaned = cleaned.replace(/\./g, '');
  }

  const num = parseFloat(cleaned);
  return { numeric: Number.isFinite(num) ? num : null, original };
}

export function parseDate(raw: string | null | undefined): { date: Date | null; original: string | null } {
  if (!raw?.trim()) return { date: null, original: null };
  const original = raw.trim();

  // Formato "16-fev." ou "11-dez."
  const ptMatch = original.match(/^(\d{1,2})[-/](\w{3})\.?$/i);
  if (ptMatch) {
    const day = parseInt(ptMatch[1], 10);
    const monthKey = ptMatch[2].slice(0, 3).toLowerCase();
    const month = MESES[monthKey];
    if (month) {
      const year = month >= 11 ? 2025 : 2026;
      return { date: new Date(year, month - 1, day), original };
    }
  }

  // Formato M/D/YYYY ou M/D/YY (com ou sem hora depois)
  const slashMatch = original.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let month = parseInt(slashMatch[1], 10);
    let day = parseInt(slashMatch[2], 10);
    let yearStr = slashMatch[3];
    let year = parseInt(yearStr, 10);
    if (year < 100) year += 2000;
    if (day > 12 && month <= 12) {
      [day, month] = [month, day];
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: new Date(year, month - 1, day), original };
    }
  }

  // Formato DD/MM/YYYY
  const brMatch = original.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    const year = parseInt(brMatch[3], 10);
    if (month >= 1 && month <= 12) {
      return { date: new Date(year, month - 1, day), original };
    }
  }

  return { date: null, original };
}

export function parseTimestamp(raw: string | null | undefined): { date: Date | null; original: string | null } {
  if (!raw?.trim()) return { date: null, original: null };
  const original = raw.trim();

  // Separar hora se presente
  const timeMatch = original.match(/(\d{1,2}):(\d{2})/);
  const datePart = timeMatch ? original.replace(timeMatch[0], '').trim() : original;

  const parsed = parseDate(datePart.endsWith(',') ? datePart.slice(0, -1).trim() : datePart);
  if (parsed.date) {
    if (timeMatch) {
      parsed.date.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
    }
    return { date: parsed.date, original };
  }

  return { date: null, original };
}

export function normalizeSolicitante(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  if (v.toLowerCase() === 'não' || v.toLowerCase() === 'nao') return null;
  const lower = v.toLowerCase();
  if (lower === 'bruna') return 'Bruna';
  if (lower === 'jenifer' || lower.startsWith('jenifer/')) return v.includes('/') ? v : 'Jenifer';
  if (lower === 'francine') return 'Francine';
  if (lower === 'lisete') return 'Lisete';
  if (lower === 'meline') return 'Meline';
  if (lower === 'rafa') return 'Rafa';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function categorizeMotivo(motivo: string): string {
  const m = motivo.trim().toLowerCase();

  if (m.includes('cancel')) return 'cancelamento';
  if (m.includes('alteração') || m.includes('alteracao')) return 'alteracao_vencimento';
  if (m.includes('corrigir') || m.includes('ajustar') || m.includes('arrumar')) return 'correcao';

  const apenasNota =
    m.includes('apenas nota') ||
    m.includes('apenas da nota') ||
    m.includes('apenas nf') ||
    m.includes('somente nf') ||
    m.includes('somentte nf') ||
    (m.includes('apenas') && m.includes('nota') && !m.includes('boleto'));

  const apenasBoleto =
    m.includes('apenas boleto') ||
    m.includes('apenas do boleto') ||
    (m === 'boleto');

  if (apenasNota) return 'emissao_apenas_nota';
  if (apenasBoleto) return 'emissao_apenas_boleto';
  if (m.includes('boleto') || m.includes('nf') || m.includes('nota')) return 'emissao_nota_boleto';

  return 'outros';
}

export function motivoToStatus(categoria: string): status_cobranca {
  switch (categoria) {
    case 'cancelamento':
      return 'cancelado';
    case 'alteracao_vencimento':
      return 'alterado';
    case 'correcao':
      return 'correcao';
    case 'emissao_nota_boleto':
    case 'emissao_apenas_nota':
    case 'emissao_apenas_boleto':
      return 'pendente';
    default:
      return 'pendente';
  }
}

export function normalizeEmpresaEmissora(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower === 'telefonia' || lower === 'serra') return 'LUXUS TELEFONIA LTDA';
  if (lower === 'cardoso') return 'CARDOSO E POLI';
  return v;
}
