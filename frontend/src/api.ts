const API = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Erro na requisição');
  }
  return res.json();
}

export const api = {
  getDashboard: () => fetchJson<import('./types').DashboardStats>(`${API}/dashboard`),
  getClientes: (busca?: string, tipoProduto?: string) => {
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (tipoProduto) params.set('tipo_produto', tipoProduto);
    const qs = params.toString();
    return fetchJson<import('./types').Cliente[]>(`${API}/clientes${qs ? `?${qs}` : ''}`);
  },
  getCliente: (id: number) =>
    fetchJson<import('./types').Cliente & { solicitacoes: import('./types').Solicitacao[] }>(
      `${API}/clientes/${id}`
    ),
  getSolicitacoes: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return fetchJson<import('./types').SolicitacoesResponse>(`${API}/solicitacoes?${qs}`);
  },
  getFiltros: () => fetchJson<import('./types').FiltrosOpcoes>(`${API}/solicitacoes/filtros`),
  getFaturamentoMeta: () => fetchJson<import('./types').FaturamentoMeta>(`${API}/faturamento/meta`),
  getFaturamento: (ano: number, mes: number) =>
    fetchJson<import('./types').FaturamentoResponse>(`${API}/faturamento/${ano}/${mes}`),
  saveFaturamento: (ano: number, mes: number, clienteId: number, data: Record<string, unknown>) =>
    fetchJson(`${API}/faturamento/${ano}/${mes}/${clienteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  liberarServico: (
    faturamentoId: number,
    servicoCodigo: string,
    data: { liberado?: boolean; colaborador_id?: number }
  ) =>
    fetchJson(`${API}/faturamento/liberacao/${faturamentoId}/${servicoCodigo}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  solicitarFinanceiro: (ano: number, mes: number, solicitante?: string) =>
    fetchJson<{ criados: number }>(`${API}/faturamento/${ano}/${mes}/solicitar-financeiro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitante }),
    }),
  exportFaturamentoCsv: (ano: number, mes: number) => {
    window.open(`${API}/faturamento/${ano}/${mes}/export.csv`, '_blank');
  },
  updateStatus: (id: number, status: import('./types').StatusCobranca) =>
    fetchJson<{ success: boolean }>(`${API}/solicitacoes/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  createSolicitacao: (data: Record<string, unknown>) =>
    fetchJson<import('./types').Solicitacao>(`${API}/solicitacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  createCliente: (data: Record<string, unknown>) =>
    fetchJson<import('./types').Cliente>(`${API}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateCliente: (id: number, data: Record<string, unknown>) =>
    fetchJson<import('./types').Cliente>(`${API}/clientes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};

export function formatCurrency(value: number | null, original?: string | null): string {
  if (original && !value) return original;
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value: string | null, original?: string | null): string {
  if (!value && original) return original;
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function formatDateTime(value: string | null, original?: string | null): string {
  if (!value && original) return original;
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export const STATUS_LABELS: Record<import('./types').StatusCobranca, string> = {
  pendente: 'Pendente',
  em_processamento: 'Em processamento',
  emitido: 'Emitido',
  cancelado: 'Cancelado',
  alterado: 'Alterado',
  correcao: 'Correção',
};

export const STATUS_COLORS: Record<import('./types').StatusCobranca, string> = {
  pendente: 'status-pendente',
  em_processamento: 'status-processando',
  emitido: 'status-emitido',
  cancelado: 'status-cancelado',
  alterado: 'status-alterado',
  correcao: 'status-correcao',
};

export const STATUS_FAT_COLORS: Record<import('./types').StatusFaturamento, string> = {
  rascunho: 'status-pendente',
  aguardando_liberacao: 'status-processando',
  pronto_emissao: 'status-emitido',
  solicitado_financeiro: 'status-alterado',
  emitido: 'status-emitido',
};
