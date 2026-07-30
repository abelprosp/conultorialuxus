import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import SolicitacoesPage from './pages/SolicitacoesPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetailPage from './pages/ClienteDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="solicitacoes" element={<SolicitacoesPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="clientes/:id" element={<ClienteDetailPage />} />
      </Route>
    </Routes>
  );
}
