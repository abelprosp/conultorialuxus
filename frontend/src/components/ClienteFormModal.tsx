import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ClienteServico, FaturamentoMeta, ServicoContrato } from '../types';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  clienteId?: number;
  onClose: () => void;
  onSuccess: () => void;
}

interface ServicoForm {
  codigo: string;
  ativo: boolean;
  valor_fixo: string;
  percentual: string;
  valor_por_linha: string;
  responsavel_id: string;
}

interface FormState {
  razao_social: string;
  cnpj: string;
  tipo_produto: string;
  empresa_emissora: string;
  email_contato: string;
  observacoes_padrao: string;
  dia_limite_emissao: string;
  vcto_obrigatorio: boolean;
  vcto_obrigatorio_explicacao: string;
  vcto_sugerido_dia: string;
  motivo_padrao: string;
  solicitante_padrao: string;
  cliente_novo_padrao: boolean;
  servicos: ServicoForm[];
}

function emptyServico(sc: ServicoContrato): ServicoForm {
  return {
    codigo: sc.codigo,
    ativo: false,
    valor_fixo: '',
    percentual: '',
    valor_por_linha: '',
    responsavel_id: '',
  };
}

function servicoFromCliente(sc: ServicoContrato, cs?: ClienteServico): ServicoForm {
  return {
    codigo: sc.codigo,
    ativo: cs?.ativo ?? false,
    valor_fixo: cs?.valor_fixo != null ? String(cs.valor_fixo) : '',
    percentual: cs?.percentual != null ? String(cs.percentual) : '',
    valor_por_linha: cs?.valor_por_linha != null ? String(cs.valor_por_linha) : '',
    responsavel_id: cs?.responsavel_id != null ? String(cs.responsavel_id) : '',
  };
}

export default function ClienteFormModal({ open, title, clienteId, onClose, onSuccess }: Props) {
  const [meta, setMeta] = useState<FaturamentoMeta | null>(null);
  const [opcoes, setOpcoes] = useState<Awaited<ReturnType<typeof api.getFiltros>> | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    Promise.all([api.getFaturamentoMeta(), api.getFiltros()])
      .then(async ([m, f]) => {
        setMeta(m);
        setOpcoes(f);
        if (clienteId) {
          const c = await api.getCliente(clienteId);
          setForm({
            razao_social: c.razao_social,
            cnpj: c.cnpj ?? '',
            tipo_produto: c.tipo_produto ?? '',
            empresa_emissora: c.empresa_emissora ?? '',
            email_contato: c.email_contato ?? '',
            observacoes_padrao: c.observacoes_padrao ?? '',
            dia_limite_emissao: c.dia_limite_emissao != null ? String(c.dia_limite_emissao) : '',
            vcto_obrigatorio: c.vcto_obrigatorio ?? false,
            vcto_obrigatorio_explicacao: c.vcto_obrigatorio_explicacao ?? '',
            vcto_sugerido_dia: c.vcto_sugerido_dia != null ? String(c.vcto_sugerido_dia) : '',
            motivo_padrao: c.motivo_padrao ?? 'Emissão de nota fiscal e boleto',
            solicitante_padrao: c.solicitante_padrao ?? '',
            cliente_novo_padrao: c.cliente_novo_padrao ?? false,
            servicos: m.servicos.map((sc) =>
              servicoFromCliente(sc, c.servicos?.find((x) => x.codigo === sc.codigo))
            ),
          });
        } else {
          setForm({
            razao_social: '',
            cnpj: '',
            tipo_produto: 'movel/assessoria',
            empresa_emissora: '',
            email_contato: '',
            observacoes_padrao: '',
            dia_limite_emissao: '',
            vcto_obrigatorio: false,
            vcto_obrigatorio_explicacao: '',
            vcto_sugerido_dia: '20',
            motivo_padrao: 'Emissão de nota fiscal e boleto',
            solicitante_padrao: f.solicitantes[0] ?? '',
            cliente_novo_padrao: false,
            servicos: m.servicos.map((sc) => emptyServico(sc)),
          });
        }
      })
      .catch((e) => setError(e.message));
  }, [open, clienteId]);

  if (!form || !meta) {
    return (
      <Modal open={open} title={title} onClose={onClose}>
        <div className="loading">Carregando...</div>
      </Modal>
    );
  }

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const setServico = (idx: number, patch: Partial<ServicoForm>) => {
    setForm((f) => {
      if (!f) return f;
      const servicos = [...f.servicos];
      servicos[idx] = { ...servicos[idx], ...patch };
      return { ...f, servicos };
    });
  };

  const payload = () => ({
    razao_social: form.razao_social.trim(),
    cnpj: form.cnpj || undefined,
    tipo_produto: form.tipo_produto || undefined,
    empresa_emissora: form.empresa_emissora || undefined,
    email_contato: form.email_contato || undefined,
    observacoes_padrao: form.observacoes_padrao || undefined,
    dia_limite_emissao: form.dia_limite_emissao ? Number(form.dia_limite_emissao) : null,
    vcto_obrigatorio: form.vcto_obrigatorio,
    vcto_obrigatorio_explicacao: form.vcto_obrigatorio_explicacao || null,
    vcto_sugerido_dia: !form.vcto_obrigatorio && form.vcto_sugerido_dia
      ? Number(form.vcto_sugerido_dia)
      : null,
    motivo_padrao: form.motivo_padrao || undefined,
    solicitante_padrao: form.solicitante_padrao || undefined,
    cliente_novo_padrao: form.cliente_novo_padrao,
    servicos: form.servicos.map((s) => ({
      codigo: s.codigo,
      ativo: s.ativo,
      valor_fixo: s.valor_fixo ? Number(s.valor_fixo) : null,
      percentual: s.percentual ? Number(s.percentual) : null,
      valor_por_linha: s.valor_por_linha ? Number(s.valor_por_linha) : null,
      responsavel_id: s.responsavel_id ? Number(s.responsavel_id) : null,
    })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (clienteId) {
        await api.updateCliente(clienteId, payload());
      } else {
        await api.createCliente(payload());
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose} wide>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error && <div className="error form-error">{error}</div>}

        <h3 className="form-section-title">Dados básicos</h3>
        <div className="form-row form-row-full">
          <label>Razão social *</label>
          <input required value={form.razao_social} onChange={(e) => set({ razao_social: e.target.value })} />
        </div>
        <div className="form-row">
          <label>CNPJ</label>
          <input value={form.cnpj} onChange={(e) => set({ cnpj: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Tipo de produto</label>
          <select value={form.tipo_produto} onChange={(e) => set({ tipo_produto: e.target.value })}>
            <option value="">Selecione...</option>
            {opcoes?.tipos_produto.map((t) => (
              <option key={t.nome_normalizado} value={t.nome}>{t.nome}</option>
            ))}
          </select>
        </div>

        <h3 className="form-section-title">Serviços contratados</h3>
        <div className="servicos-grid form-row-full">
          {meta.servicos.map((sc, idx) => {
            const s = form.servicos[idx];
            return (
              <div key={sc.codigo} className={`servico-card ${s.ativo ? 'ativo' : ''}`}>
                <label className="servico-check">
                  <input
                    type="checkbox"
                    checked={s.ativo}
                    onChange={(e) => setServico(idx, { ativo: e.target.checked })}
                  />
                  <strong>{sc.nome}</strong>
                </label>
                {s.ativo && sc.tipo_calculo === 'fixo' && (
                  <div className="form-row">
                    <label>Valor fixo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={s.valor_fixo}
                      onChange={(e) => setServico(idx, { valor_fixo: e.target.value })}
                    />
                  </div>
                )}
                {s.ativo && sc.tipo_calculo === 'percentual' && (
                  <>
                    <div className="form-row">
                      <label>Percentual (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={s.percentual}
                        onChange={(e) => setServico(idx, { percentual: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <label>Responsável (Lx)</label>
                      <select
                        value={s.responsavel_id}
                        onChange={(e) => setServico(idx, { responsavel_id: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        {meta.colaboradores.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {s.ativo && sc.tipo_calculo === 'por_linha' && (
                  <>
                    <div className="form-row">
                      <label>R$ por linha</label>
                      <input
                        type="number"
                        step="0.01"
                        value={s.valor_por_linha}
                        onChange={(e) => setServico(idx, { valor_por_linha: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <label>Responsável (Lx)</label>
                      <select
                        value={s.responsavel_id}
                        onChange={(e) => setServico(idx, { responsavel_id: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        {meta.colaboradores.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <h3 className="form-section-title">Emissão e vencimento</h3>
        <div className="form-row">
          <label>Dia limite emissão</label>
          <input
            type="number"
            min={1}
            max={28}
            value={form.dia_limite_emissao}
            onChange={(e) => set({ dia_limite_emissao: e.target.value })}
            placeholder="Ex: 5"
          />
        </div>
        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.vcto_obrigatorio}
              onChange={(e) => set({ vcto_obrigatorio: e.target.checked })}
            />
            Vencimento obrigatório (manual todo mês)
          </label>
        </div>
        {form.vcto_obrigatorio ? (
          <div className="form-row form-row-full">
            <label>Explicação vencimento obrigatório</label>
            <input
              value={form.vcto_obrigatorio_explicacao}
              onChange={(e) => set({ vcto_obrigatorio_explicacao: e.target.value })}
            />
          </div>
        ) : (
          <div className="form-row">
            <label>Dia vencimento sugerido</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.vcto_sugerido_dia}
              onChange={(e) => set({ vcto_sugerido_dia: e.target.value })}
            />
          </div>
        )}

        <h3 className="form-section-title">Defaults para solicitação</h3>
        <div className="form-row form-row-full">
          <label>Motivo padrão</label>
          <input value={form.motivo_padrao} onChange={(e) => set({ motivo_padrao: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Solicitante padrão</label>
          <select value={form.solicitante_padrao} onChange={(e) => set({ solicitante_padrao: e.target.value })}>
            <option value="">Selecione...</option>
            {opcoes?.solicitantes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Emissão por qual CNPJ?</label>
          <select value={form.empresa_emissora} onChange={(e) => set({ empresa_emissora: e.target.value })}>
            <option value="">Selecione...</option>
            {opcoes?.empresas_emissoras.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="form-row form-row-full">
          <label>E-mail</label>
          <input type="email" value={form.email_contato} onChange={(e) => set({ email_contato: e.target.value })} />
        </div>
        <div className="form-row form-row-full">
          <label>Observações padrão</label>
          <textarea rows={2} value={form.observacoes_padrao} onChange={(e) => set({ observacoes_padrao: e.target.value })} />
        </div>
        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.cliente_novo_padrao}
              onChange={(e) => set({ cliente_novo_padrao: e.target.checked })}
            />
            Cliente novo (padrão)
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
