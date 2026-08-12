export type status_cobranca =
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
  created_at: string;
  updated_at: string;
}

export interface ClienteConfig {
  id: number;
  cliente_id: number;
  tipo_produto: string | null;
  empresa_emissora: string | null;
  email_contato: string | null;
  observacoes_padrao: string | null;
}

export interface ClienteComConfig extends Cliente {
  tipo_produto: string | null;
  empresa_emissora: string | null;
  email_contato: string | null;
  total_solicitacoes: number;
  ultima_solicitacao: string | null;
}

export interface SolicitacaoCobranca {
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
  status: status_cobranca;
  created_at: string;
}

export interface DashboardStats {
  total_clientes: number;
  total_solicitacoes: number;
  pendentes: number;
  cancelados: number;
  por_produto: { produto: string; total: number }[];
  por_solicitante: { solicitante: string; total: number }[];
  por_categoria?: { categoria: string; descricao: string; total: number }[];
  mensal?: {
    ano: number;
    mes: number;
    total_clientes: number;
    prontos: number;
    aguardando_liberacao: number;
    rascunho: number;
    valor_total_prontos: number;
    liberacoes_pendentes: number;
    prazo_emissao_vencido: number;
  };
}

export interface FiltrosSolicitacao {
  busca?: string;
  tipo_produto?: string;
  categoria_motivo?: string;
  status?: string;
  solicitante?: string;
  empresa_emissora?: string;
  cliente_novo?: string;
  vencimento_de?: string;
  vencimento_ate?: string;
  page?: number;
  limit?: number;
}
