import { calcularValores, type ClienteServicoRow } from './faturamento.js';

const servicos: ClienteServicoRow[] = [
  { servico_id: 1, codigo: 'call_center', nome: 'CC', tipo_calculo: 'fixo', requer_liberacao: false, ativo: true, valor_fixo: 500, percentual: null, valor_por_linha: null, responsavel_id: null, responsavel_nome: null },
  { servico_id: 2, codigo: 'ajuste', nome: 'Ajuste', tipo_calculo: 'percentual', requer_liberacao: true, ativo: true, valor_fixo: null, percentual: 3.5, valor_por_linha: null, responsavel_id: 1, responsavel_nome: 'João' },
  { servico_id: 4, codigo: 'software', nome: 'SW', tipo_calculo: 'por_linha', requer_liberacao: true, ativo: true, valor_fixo: null, percentual: null, valor_por_linha: 2.5, responsavel_id: 2, responsavel_nome: 'Ana' },
];

const result = calcularValores(servicos, {
  base_ajuste: 10000,
  base_contestacao: null,
  qtd_linhas_software: 100,
  outra_cobranca: 200,
});

if (result.valor_call_center !== 500) throw new Error('call center');
if (result.valor_ajuste !== 350) throw new Error('ajuste');
if (result.valor_software !== 250) throw new Error('software');
if (result.valor_total !== 1300) throw new Error('total');

console.log('faturamento.calc.test OK');
