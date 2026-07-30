import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { DashboardStats } from '../types';

function BarChart({ items, labelKey, valueKey }: {
  items: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(...items.map((i) => Number(i[valueKey])), 1);
  return (
    <div className="chart-bars">
      {items.slice(0, 8).map((item) => (
        <div key={String(item[labelKey])} className="chart-row">
          <span className="chart-label" title={String(item[labelKey])}>
            {String(item[labelKey])}
          </span>
          <div className="chart-bar-wrap">
            <div
              className="chart-bar"
              style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
            />
          </div>
          <span className="chart-value">{item[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Carregando dashboard...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!stats) return null;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Visão geral do controle de cobranças Assessoria</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Clientes</div>
          <div className="value">{stats.total_clientes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Solicitações</div>
          <div className="value">{stats.total_solicitacoes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pendentes</div>
          <div className="value">{stats.pendentes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cancelados</div>
          <div className="value">{stats.cancelados}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Por tipo de produto</strong>
          </div>
          <BarChart
            items={stats.por_produto.map((p) => ({ produto: p.produto, total: p.total }))}
            labelKey="produto"
            valueKey="total"
          />
        </div>
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Por solicitante</strong>
          </div>
          <BarChart
            items={stats.por_solicitante.map((s) => ({ solicitante: s.solicitante, total: s.total }))}
            labelKey="solicitante"
            valueKey="total"
          />
        </div>
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Por tipo de ação (Motivo)</strong>
          </div>
          <BarChart
            items={stats.por_categoria.map((c) => ({ descricao: c.descricao, total: c.total }))}
            labelKey="descricao"
            valueKey="total"
          />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <Link to="/solicitacoes" className="btn btn-primary">Ver solicitações</Link>
        <Link to="/clientes" className="btn btn-ghost">Ver clientes</Link>
      </div>
    </>
  );
}
