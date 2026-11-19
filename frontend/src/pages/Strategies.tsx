import { useState, useEffect } from 'react';
import { Layers, Loader2, Power, Trash2 } from 'lucide-react';
import { strategiesApi, type Strategy } from '../services/strategies';

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await strategiesApi.list();
      console.log('Resposta da API:', res); // confira o formato no console

      const list = Array.isArray(res)
        ? res
        : res?.data ?? res?.strategies ?? res?.items ?? res?.results ?? [];

      setStrategies(Array.isArray(list) ? list : []);
    } catch {
      setError('Não foi possível carregar as estratégias.');
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await strategiesApi.toggle(id);
      setStrategies((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      setError('Falha ao alterar status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Excluir esta estratégia?')) return;
    setBusyId(id);
    try {
      await strategiesApi.remove(id);
      setStrategies((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Falha ao excluir.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <section className="panel">
        <div className="activity-empty">
          <div className="activity-empty-icon"><Loader2 size={22} className="spin" /></div>
          <strong>Carregando...</strong>
        </div>
      </section>
    );
  }

  if (error && strategies.length === 0) {
    return (
      <section className="panel">
        <div className="activity-empty">
          <strong className="text-danger">{error}</strong>
          <button className="strategy-btn" onClick={load}>Tentar novamente</button>
        </div>
      </section>
    );
  }

  if (strategies.length === 0) {
    return (
      <section className="panel">
        <div className="activity-empty">
          <div className="activity-empty-icon"><Layers size={22} /></div>
          <strong>Nenhuma estratégia cadastrada</strong>
          <p>As estratégias criadas aparecerão aqui.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      {error && <p className="text-danger">{error}</p>}
      <div className="strategy-grid">
        {strategies.map((s) => (
          <section key={s.id} className="panel strategy-card">
            <div className="strategy-header">
              <strong>{s.name}</strong>
              <span className={`strategy-badge ${s.enabled ? 'on' : 'off'}`}>
                {s.enabled ? 'Ativa' : 'Inativa'}
              </span>
            </div>

            <p className="strategy-desc">{s.description || 'Sem descrição.'}</p>

            {s.createdAt && (
              <small className="strategy-date">
                Criada em {new Date(s.createdAt).toLocaleDateString('pt-BR')}
              </small>
            )}

            <div className="strategy-actions">
              <button
                className="strategy-btn"
                disabled={busyId === s.id}
                onClick={() => handleToggle(s.id)}
              >
                <Power size={14} /> {s.enabled ? 'Desativar' : 'Ativar'}
              </button>
              <button
                className="strategy-btn danger"
                disabled={busyId === s.id}
                onClick={() => handleRemove(s.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
