import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FiltrosOpcoes } from '../types';
import Modal from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMPTY = {
  razao_social: '',
  cnpj: '',
  tipo_produto: '',
  empresa_emissora: '',
  email_contato: '',
  observacoes_padrao: '',
};

export default function NovoClienteModal({ open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [opcoes, setOpcoes] = useState<FiltrosOpcoes | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.getFiltros().then(setOpcoes).catch(console.error);
    setForm(EMPTY);
    setError('');
  }, [open]);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createCliente({
        razao_social: form.razao_social.trim(),
        cnpj: form.cnpj || undefined,
        tipo_produto: form.tipo_produto || undefined,
        empresa_emissora: form.empresa_emissora || undefined,
        email_contato: form.email_contato || undefined,
        observacoes_padrao: form.observacoes_padrao || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Novo cliente" onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error && <div className="error form-error">{error}</div>}

        <div className="form-row form-row-full">
          <label>Razão social *</label>
          <input
            required
            value={form.razao_social}
            onChange={(e) => set({ razao_social: e.target.value })}
            placeholder="Nome do cliente"
          />
        </div>

        <div className="form-row form-row-full">
          <label>CNPJ</label>
          <input
            value={form.cnpj}
            onChange={(e) => set({ cnpj: e.target.value })}
            placeholder="00.000.000/0000-00"
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
          <label>E-mail de contato</label>
          <input
            type="email"
            value={form.email_contato}
            onChange={(e) => set({ email_contato: e.target.value })}
            placeholder="nome@luxustelefonia.com.br"
          />
        </div>

        <div className="form-row form-row-full">
          <label>Observações padrão</label>
          <textarea
            rows={3}
            value={form.observacoes_padrao}
            onChange={(e) => set({ observacoes_padrao: e.target.value })}
            placeholder="Notas recorrentes sobre este cliente..."
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
