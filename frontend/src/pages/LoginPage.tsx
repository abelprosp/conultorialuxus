import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState('admin@luxus.local');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, senha);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1>Assessoria</h1>
        <p>Controle de Cobranças</p>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error">{error}</div>}
          <div className="form-row">
            <label>E-mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Senha</label>
            <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="login-hint">Acesso inicial: admin@luxus.local / admin123</p>
      </div>
    </div>
  );
}
