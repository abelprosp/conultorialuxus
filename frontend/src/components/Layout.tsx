import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Assessoria</h1>
          <p>Controle de Cobranças</p>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/solicitacoes">Solicitações</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
