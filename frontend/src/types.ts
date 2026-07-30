export type StatusCobranca =
  | 'pendente'
  | 'em_processamento'
  | 'emitido'
  | 'cancelado'
  | 'alterado'
  | 'correcao';

export interface Cliente {
  id: number;
  razao_social: string;
  cnpj: string | null;
  tipo_produto: string | null;
  empresa_emissora: string | null;
  email_contato: string | null;
  total_solicitacoes: number;
  ultima_solicitacao: string | null;
}

export interface Solicitacao {
  id: number;
  cliente_id: number;
  razao_social: string;
  cnpj: string | null;
  carimbo_data_hora: string | null;
  carimbo_original: string | null;
  valor_boleto: number | null;
  valor_boleto_original: string | null;
  data_vencimento: string | null;
  data_vencimento_original: string | null;
  tipo_produto: string | null;
  motivo_original: string;
  categoria_motivo: string | null;
  categoria_descricao: string | null;
  solicitante: string | null;
  cliente_novo: boolean;
  observacoes: string | null;
  empresa_emissora: string | null;
  email_contato: string | null;
  status: StatusCobranca;
  created_at: string;
}

export interface DashboardStats {
  total_clientes: number;
  total_solicitacoes: number;
  pendentes: number;
  cancelados: number;
  por_produto: { produto: string; total: number }[];
  por_solicitante: { solicitante: string; total: number }[];
  por_categoria: { categoria: string; descricao: string; total: number }[];
}

export interface FiltrosOpcoes {
  tipos_produto: { nome: string; nome_normalizado: string }[];
  categorias_motivo: { codigo: string; descricao: string }[];
  solicitantes: string[];
  empresas_emissoras: string[];
  statuses: StatusCobranca[];
}

export interface SolicitacoesResponse {
  data: Solicitacao[];
  total: number;
  page: number;
  limit: number;
}
