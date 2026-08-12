export type StatusCobranca =
  | 'pendente'
  | 'em_processamento'
  | 'emitido'
  | 'cancelado'
  | 'alterado'
  | 'correcao';

export type StatusFaturamento =
  | 'rascunho'
  | 'aguardando_liberacao'
  | 'pronto_emissao'
  | 'solicitado_financeiro'
  | 'emitido';

export interface ServicoContrato {
  id: number;
  codigo: string;
  nome: string;
  tipo_calculo: 'fixo' | 'percentual' | 'por_linha';
  requer_liberacao: boolean;
  ordem: number;
}

export interface ClienteServico {
  servico_id: number;
  codigo: string;
  nome: string;
  tipo_calculo: string;
  requer_liberacao: boolean;
  ativo: boolean;
  valor_fixo: number | null;
  percentual: number | null;
  valor_por_linha: number | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
}

export interface Cliente {
  id: number;
  razao_social: string;
  cnpj: string | null;
  tipo_produto: string | null;
  empresa_emissora: string | null;
  email_contato: string | null;
  observacoes_padrao?: string | null;
  dia_limite_emissao?: number | null;
  vcto_obrigatorio?: boolean;
  vcto_obrigatorio_explicacao?: string | null;
  vcto_sugerido_dia?: number | null;
  motivo_padrao?: string | null;
  solicitante_padrao?: string | null;
  solicitante_padrao_id?: number | null;
  cliente_novo_padrao?: boolean;
  servicos?: ClienteServico[];
  total_solicitacoes: number;
  ultima_solicitacao: string | null;
}

export interface Liberacao {
  id: number;
  faturamento_id: number;
  servico_id: number;
  codigo: string;
  servico_nome: string;
  status: string;
  liberado_por_colaborador_id: number | null;
  liberado_por_nome: string | null;
  liberado_em: string | null;
  observacao: string | null;
}

export interface FaturamentoRow {
  id: number;
  competencia_id: number;
  cliente_id: number;
  razao_social: string;
  cnpj: string | null;
  base_ajuste: number | null;
  base_contestacao: number | null;
  qtd_linhas_software: number | null;
  outra_cobranca: number | null;
  outra_cobranca_descricao: string | null;
  data_vencimento: string | null;
  tipo_produto: string | null;
  motivo: string | null;
  solicitante: string | null;
  cliente_novo: boolean;
  observacoes: string | null;
  email_contato: string | null;
  empresa_emissora: string | null;
  valor_call_center: number | null;
  valor_ajuste: number | null;
  valor_contestacao: number | null;
  valor_software: number | null;
  valor_fixado: number | null;
  valor_total: number | null;
  status: StatusFaturamento;
  solicitacao_id?: number | null;
  prazo_emissao_vencido?: boolean;
  dia_limite_emissao: number | null;
  vcto_obrigatorio: boolean;
  vcto_obrigatorio_explicacao: string | null;
  vcto_sugerido_dia: number | null;
  servicos: ClienteServico[];
  liberacoes: Liberacao[];
}

export interface FaturamentoResponse {
  competencia: { id: number; ano: number; mes: number; status: string };
  ano: number;
  mes: number;
  fechada?: boolean;
  rows: FaturamentoRow[];
}

export interface FaturamentoMeta {
  servicos: ServicoContrato[];
  colaboradores: { id: number; nome: string }[];
  solicitantes: { id: number; nome: string }[];
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

export interface User {
  id: number;
  nome: string;
  email: string;
  perfil: 'admin' | 'financeiro' | 'contratado';
  colaborador_id: number | null;
}

export interface LiberacaoPendente {
  faturamento_id: number;
  cliente_id: number;
  razao_social: string;
  servico_codigo: string;
  servico_nome: string;
  ano: number;
  mes: number;
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

export const SERVICO_LABELS: Record<string, string> = {
  call_center: 'Call center',
  ajuste: 'Ajuste',
  contestacao: 'Contestação',
  software: 'Software',
  vlr_fixado: 'Vlr fixado',
};

export const STATUS_FATURAMENTO_LABELS: Record<StatusFaturamento, string> = {
  rascunho: 'Rascunho',
  aguardando_liberacao: 'Aguardando liberação',
  pronto_emissao: 'Pronto p/ emissão',
  solicitado_financeiro: 'Enviado ao financeiro',
  emitido: 'Emitido',
};
