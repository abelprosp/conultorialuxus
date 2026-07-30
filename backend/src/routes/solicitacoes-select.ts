export const solicitacaoSelectQuery = `
  SELECT
    s.id, s.cliente_id, c.razao_social, c.cnpj,
    s.carimbo_data_hora, s.carimbo_original,
    s.valor_boleto, s.valor_boleto_original,
    s.data_vencimento, s.data_vencimento_original,
    tp.nome AS tipo_produto,
    s.motivo_original,
    cm.codigo AS categoria_motivo,
    cm.descricao AS categoria_descricao,
    sol.nome AS solicitante,
    s.cliente_novo, s.observacoes,
    ee.nome AS empresa_emissora,
    s.email_contato, s.status, s.created_at
  FROM solicitacoes_cobranca s
  JOIN clientes c ON c.id = s.cliente_id
  LEFT JOIN tipos_produto tp ON tp.id = s.tipo_produto_id
  LEFT JOIN categorias_motivo cm ON cm.id = s.categoria_motivo_id
  LEFT JOIN solicitantes sol ON sol.id = s.solicitante_id
  LEFT JOIN empresas_emissoras ee ON ee.id = s.empresa_emissora_id
`;
