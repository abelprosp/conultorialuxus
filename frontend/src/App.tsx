import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SolicitacoesPage from './pages/SolicitacoesPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetailPage from './pages/ClienteDetailPage';
import FaturamentoPage from './pages/FaturamentoPage';
import MinhasLiberacoesPage from './pages/MinhasLiberacoesPage';
import ColaboradoresPage from './pages/ColaboradoresPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="faturamento" element={<FaturamentoPage />} />
          <Route path="liberacoes" element={<MinhasLiberacoesPage />} />
          <Route path="solicitacoes" element={<SolicitacoesPage />} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="clientes/:id" element={<ClienteDetailPage />} />
          <Route path="colaboradores" element={<ColaboradoresPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
