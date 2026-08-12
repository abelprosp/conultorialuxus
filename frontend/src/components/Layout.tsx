import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Assessoria</h1>
          <p>Controle de Cobranças</p>
          {user && <p className="sidebar-user">{user.nome}</p>}
        </div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/faturamento">Cobrança mensal</NavLink>
          <NavLink to="/liberacoes">Minhas liberações</NavLink>
          <NavLink to="/solicitacoes">Solicitações</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          {isAdmin && <NavLink to="/colaboradores">Colaboradores</NavLink>}
        </nav>
        <button type="button" className="btn btn-ghost sidebar-logout" onClick={logout}>
          Sair
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
