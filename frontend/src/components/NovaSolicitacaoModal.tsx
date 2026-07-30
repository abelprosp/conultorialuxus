import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Cliente, FiltrosOpcoes } from '../types';
import Modal from './Modal';

export interface NovaSolicitacaoDefaults {
  clienteId?: number;
  razaoSocial?: string;
  cnpj?: string;
  tipoProduto?: string;
  empresaEmissora?: string;
  emailContato?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaults?: NovaSolicitacaoDefaults;
}

const MOTIVOS_SUGERIDOS = [
  'Emissão de nota fiscal e boleto',
  'Emissão apenas da nota fiscal',
  'Emissão apenas do boleto',
  'Cancelamento de NF e boleto',
  'Alteração de vencimento',
  'Correção / ajuste',
];

const EMPTY = {
  modo: 'existente' as 'existente' | 'novo',
  cliente_id: '',
  razao_social: '',
  cnpj: '',
  valor_boleto: '',
  data_vencimento: '',
  tipo_produto: '',
  motivo: 'Emissão de nota fiscal e boleto',
  categoria_motivo: 'emissao_nota_boleto',
  solicitante: '',
  cliente_novo: false,
  observacoes: '',
  empresa_emissora: '',
  email_contato: '',
};

export default function NovaSolicitacaoModal({ open, onClose, onSuccess, defaults }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [opcoes, setOpcoes] = useState<FiltrosOpcoes | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    Promise.all([api.getClientes(), api.getFiltros()])
      .then(([c, f]) => {
        setClientes(c);
        setOpcoes(f);
      })
      .catch(console.error);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const locked = Boolean(defaults?.clienteId);
    setForm({
      ...EMPTY,
      modo: locked ? 'existente' : EMPTY.modo,
      cliente_id: defaults?.clienteId ? String(defaults.clienteId) : '',
      razao_social: defaults?.razaoSocial ?? '',
      cnpj: defaults?.cnpj ?? '',
      tipo_produto: defaults?.tipoProduto ?? '',
      empresa_emissora: defaults?.empresaEmissora ?? '',
      email_contato: defaults?.emailContato ?? '',
    });
    setError('');
  }, [open, defaults]);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find((c) => String(c.id) === clienteId);
    set({
      cliente_id: clienteId,
      tipo_produto: cliente?.tipo_produto ?? form.tipo_produto,
      empresa_emissora: cliente?.empresa_emissora ?? form.empresa_emissora,
      email_contato: cliente?.email_contato ?? form.email_contato,
    });
  };

  const handleMotivoChange = (motivo: string) => {
    const cat = opcoes?.categorias_motivo.find((c) =>
      motivo.toLowerCase().includes(c.descricao.toLowerCase().slice(0, 12))
    );
    set({
      motivo,
      categoria_motivo: cat?.codigo ?? form.categoria_motivo,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        valor_boleto: form.valor_boleto || undefined,
        data_vencimento: form.data_vencimento || undefined,
        tipo_produto: form.tipo_produto || undefined,
        motivo: form.motivo,
        categoria_motivo: form.categoria_motivo || undefined,
        solicitante: form.solicitante || undefined,
        cliente_novo: form.cliente_novo,
        observacoes: form.observacoes || undefined,
        empresa_emissora: form.empresa_emissora || undefined,
        email_contato: form.email_contato || undefined,
      };

      if (form.modo === 'existente' && form.cliente_id) {
        payload.cliente_id = parseInt(form.cliente_id, 10);
      } else {
        payload.razao_social = form.razao_social.trim();
        payload.cnpj = form.cnpj || undefined;
        if (!payload.razao_social) {
          setError('Informe a razão social do cliente');
          setSaving(false);
          return;
        }
      }

      await api.createSolicitacao(payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const lockedCliente = Boolean(defaults?.clienteId);

  return (
    <Modal open={open} title="Nova solicitação de cobrança" onClose={onClose} wide>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error && <div className="error form-error">{error}</div>}

        {!lockedCliente && (
          <div className="form-row form-row-full">
            <div className="form-radio-group">
              <label>
                <input
                  type="radio"
                  checked={form.modo === 'existente'}
                  onChange={() => set({ modo: 'existente' })}
                />
                Cliente existente
              </label>
              <label>
                <input
                  type="radio"
                  checked={form.modo === 'novo'}
                  onChange={() => set({ modo: 'novo' })}
                />
                Cliente novo
              </label>
            </div>
          </div>
        )}

        {form.modo === 'existente' ? (
          <div className="form-row form-row-full">
            <label>Cliente *</label>
            <select
              required
              value={form.cliente_id}
              onChange={(e) => handleClienteChange(e.target.value)}
              disabled={lockedCliente}
            >
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razao_social}{c.cnpj ? ` — ${c.cnpj}` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="form-row form-row-full">
              <label>Razão social *</label>
              <input
                required
                value={form.razao_social}
                onChange={(e) => set({ razao_social: e.target.value })}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="form-row">
              <label>CNPJ</label>
              <input
                value={form.cnpj}
                onChange={(e) => set({ cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={form.cliente_novo}
                  onChange={(e) => set({ cliente_novo: e.target.checked })}
                />
                {' '}Marcar como cliente novo
              </label>
            </div>
          </>
        )}

        <div className="form-row">
          <label>Valor do boleto</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.valor_boleto}
            onChange={(e) => set({ valor_boleto: e.target.value })}
            placeholder="572,70"
          />
        </div>

        <div className="form-row">
          <label>Data de vencimento</label>
          <input
            type="date"
            value={form.data_vencimento}
            onChange={(e) => set({ data_vencimento: e.target.value })}
          />
        </div>

        <div className="form-row">
          <label>Tipo de produto</label>
          <select
            value={form.tipo_produto}
            onChange={(e) => set({ tipo_produto: e.target.value })}
          >
            <option value="">Selecione...</option>
            {opcoes?.tipos_produto.map((t) => (
              <option key={t.nome_normalizado} value={t.nome}>{t.nome}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Emissão por qual CNPJ?</label>
          <select
            value={form.empresa_emissora}
            onChange={(e) => set({ empresa_emissora: e.target.value })}
          >
            <option value="">Selecione...</option>
            {opcoes?.empresas_emissoras.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        <div className="form-row form-row-full">
          <label>Motivo *</label>
          <input
            list="motivos-list"
            required
            value={form.motivo}
            onChange={(e) => handleMotivoChange(e.target.value)}
          />
          <datalist id="motivos-list">
            {MOTIVOS_SUGERIDOS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div className="form-row">
          <label>Categoria</label>
          <select
            value={form.categoria_motivo}
            onChange={(e) => set({ categoria_motivo: e.target.value })}
          >
            {opcoes?.categorias_motivo.map((c) => (
              <option key={c.codigo} value={c.codigo}>{c.descricao}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Quem solicitou</label>
          <select
            value={form.solicitante}
            onChange={(e) => set({ solicitante: e.target.value })}
          >
            <option value="">Selecione...</option>
            {opcoes?.solicitantes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>E-mail</label>
          <input
            type="email"
            value={form.email_contato}
            onChange={(e) => set({ email_contato: e.target.value })}
            placeholder="nome@luxustelefonia.com.br"
          />
        </div>

        <div className="form-row form-row-full">
          <label>Observações</label>
          <textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => set({ observacoes: e.target.value })}
            placeholder="Informações adicionais..."
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar solicitação'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
