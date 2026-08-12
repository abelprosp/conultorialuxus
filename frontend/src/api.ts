const API = '/api';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !url.includes('/auth/login')) {
    localStorage.removeItem('assessoria_token');
    localStorage.removeItem('assessoria_user');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Erro na requisição');
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json();
  return undefined as T;
}

export const api = {
  login: (email: string, senha: string) =>
    fetchJson<{ token: string; user: import('./types').User }>(`${API}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    }),
  authMe: () => fetchJson<{ user: import('./types').User }>(`${API}/auth/me`),
  trocarSenha: (senha_atual: string, senha_nova: string) =>
    fetchJson(`${API}/auth/trocar-senha`, {
      method: 'POST',
      body: JSON.stringify({ senha_atual, senha_nova }),
    }),

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
  getMinhasLiberacoes: () => fetchJson<import('./types').LiberacaoPendente[]>(`${API}/faturamento/minhas-liberacoes`),
  saveFaturamento: (ano: number, mes: number, clienteId: number, data: Record<string, unknown>) =>
    fetchJson(`${API}/faturamento/${ano}/${mes}/${clienteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  liberarServico: (
    faturamentoId: number,
    servicoCodigo: string,
    data: { liberado?: boolean; colaborador_id?: number }
  ) =>
    fetchJson(`${API}/faturamento/liberacao/${faturamentoId}/${servicoCodigo}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  solicitarFinanceiro: (ano: number, mes: number, solicitante?: string) =>
    fetchJson<{ criados: number }>(`${API}/faturamento/${ano}/${mes}/solicitar-financeiro`, {
      method: 'POST',
      body: JSON.stringify({ solicitante }),
    }),
  fecharCompetencia: (ano: number, mes: number) =>
    fetchJson(`${API}/faturamento/${ano}/${mes}/fechar`, { method: 'POST' }),
  reabrirCompetencia: (ano: number, mes: number) =>
    fetchJson(`${API}/faturamento/${ano}/${mes}/reabrir`, { method: 'POST' }),
  duplicarMesAnterior: (ano: number, mes: number) =>
    fetchJson<{ duplicados: number }>(`${API}/faturamento/${ano}/${mes}/duplicar-anterior`, { method: 'POST' }),
  exportFaturamentoCsv: async (ano: number, mes: number) => {
    const headers: HeadersInit = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API}/faturamento/${ano}/${mes}/export.csv`, { headers });
    if (!res.ok) throw new Error('Erro ao exportar');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faturamento-${ano}-${String(mes).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  getColaboradores: () => fetchJson<{ id: number; nome: string; ativo: boolean }[]>(`${API}/colaboradores`),
  createColaborador: (nome: string) =>
    fetchJson(`${API}/colaboradores`, { method: 'POST', body: JSON.stringify({ nome }) }),
  getUsuarios: () => fetchJson<Record<string, unknown>[]>(`${API}/colaboradores/usuarios`),
  createUsuario: (data: Record<string, unknown>) =>
    fetchJson(`${API}/colaboradores/usuarios`, { method: 'POST', body: JSON.stringify(data) }),

  updateStatus: (id: number, status: import('./types').StatusCobranca) =>
    fetchJson<{ success: boolean }>(`${API}/solicitacoes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  createSolicitacao: (data: Record<string, unknown>) =>
    fetchJson<import('./types').Solicitacao>(`${API}/solicitacoes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createCliente: (data: Record<string, unknown>) =>
    fetchJson<import('./types').Cliente>(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCliente: (id: number, data: Record<string, unknown>) =>
    fetchJson<import('./types').Cliente>(`${API}/clientes/${id}`, {
      method: 'PATCH',
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
