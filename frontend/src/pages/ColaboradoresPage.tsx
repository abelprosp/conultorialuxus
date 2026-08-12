import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function ColaboradoresPage() {
  const { isAdmin } = useAuth();
  const [colaboradores, setColaboradores] = useState<{ id: number; nome: string; ativo: boolean }[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, unknown>[]>([]);
  const [nomeColab, setNomeColab] = useState('');
  const [formUser, setFormUser] = useState({
    nome: '', email: '', senha: '', perfil: 'contratado', colaborador_id: '',
  });
  const [error, setError] = useState('');

  const load = () => {
    api.getColaboradores().then(setColaboradores).catch((e) => setError(e.message));
    if (isAdmin) api.getUsuarios().then(setUsuarios).catch(console.error);
  };

  useEffect(() => { load(); }, [isAdmin]);

  if (!isAdmin) {
    return <div className="error">Acesso restrito a administradores.</div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>Colaboradores e usuários</h2>
        <p>Gestão de responsáveis Lx e acessos ao sistema</p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <h3>Novo colaborador</h3>
        <div className="filters-bar" style={{ marginTop: '0.75rem' }}>
          <input placeholder="Nome do colaborador Lx" value={nomeColab} onChange={(e) => setNomeColab(e.target.value)} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await api.createColaborador(nomeColab);
              setNomeColab('');
              load();
            }}
          >
            Adicionar
          </button>
        </div>
        <ul className="colab-list">
          {colaboradores.map((c) => (
            <li key={c.id}>
              {c.nome} {!c.ativo && '(inativo)'}
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <h3>Novo usuário</h3>
        <div className="form-grid" style={{ marginTop: '0.75rem' }}>
          <div className="form-row">
            <label>Nome</label>
            <input value={formUser.nome} onChange={(e) => setFormUser({ ...formUser, nome: e.target.value })} />
          </div>
          <div className="form-row">
            <label>E-mail</label>
            <input value={formUser.email} onChange={(e) => setFormUser({ ...formUser, email: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Senha</label>
            <input type="password" value={formUser.senha} onChange={(e) => setFormUser({ ...formUser, senha: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Perfil</label>
            <select value={formUser.perfil} onChange={(e) => setFormUser({ ...formUser, perfil: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="financeiro">Financeiro</option>
              <option value="contratado">Contratado</option>
            </select>
          </div>
          <div className="form-row">
            <label>Colaborador vinculado</label>
            <select value={formUser.colaborador_id} onChange={(e) => setFormUser({ ...formUser, colaborador_id: e.target.value })}>
              <option value="">—</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await api.createUsuario({
                  ...formUser,
                  colaborador_id: formUser.colaborador_id ? Number(formUser.colaborador_id) : null,
                });
                setFormUser({ nome: '', email: '', senha: '', perfil: 'contratado', colaborador_id: '' });
                load();
              }}
            >
              Criar usuário
            </button>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Colaborador</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id as number}>
                  <td>{u.nome as string}</td>
                  <td>{u.email as string}</td>
                  <td>{u.perfil as string}</td>
                  <td>{(u.colaborador_nome as string) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
