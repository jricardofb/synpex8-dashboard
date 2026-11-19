import { useEffect, useState } from "react";
import { Bot, Power, Save } from "lucide-react";
import type { Robot } from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://172.18.32.1:3000";

export default function RobotsPage() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [volumes, setVolumes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/api/v1/robots`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: Robot[] = Array.isArray(json) ? json : json.data ?? [];
      setRobots(list);
      setVolumes(Object.fromEntries(list.map((r) => [r.id, String(r.configuredVolume)])));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

    async function update(rawId: string | number, body: Record<string, unknown>) {
    const id = String(rawId);
      setBusy(id);

    try {
      const res = await fetch(`${API_URL}/api/v1/robots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      alert(`Erro ao atualizar: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel robots-panel">
      <div className="panel-header">
        <div>
          <h3>Gerenciar robôs</h3>
          <p>Ligar/desligar e ajustar volume</p>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ROBÔ</th>
              <th>ID EXTERNO</th>
              <th>VOLUME</th>
              <th>SITUAÇÃO</th>
              <th>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((robot) => {
              const on = robot.status === "ON";
              return (
                <tr key={robot.id}>
                  <td>
                    <div className="robot-cell">
                      <div className="robot-avatar"><Bot size={19} /></div>
                      <div>
                        <strong>{robot.name}</strong>
                        <span>{robot.id}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="market-badge">{robot.externalId}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={volumes[robot.id] ?? ""}
                        onChange={(e) => setVolumes({ ...volumes, [robot.id]: e.target.value })}
                        style={{ width: 80 }}
                      />
                      <button
                        className="icon-button"
                        title="Salvar volume"
                        disabled={busy === robot.id}
                        onClick={() => update(robot.id, { configuredVolume: volumes[robot.id] })}
                      >
                        <Save size={16} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${on ? "status-simulation" : "status-off"}`}>
                      <span />
                      {on ? "Ligado" : "Desligado"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="secondary-button"
                      disabled={busy === String(robot.id)}
                      onClick={() => update(robot.id, { status: on ? "OFF" : "ON" })}
                    >
                      <Power size={15} />
                      {on ? "Desligar" : "Ligar"}
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && robots.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
                  {error ? `Falha ao carregar robôs (${error}).` : "Nenhum robô cadastrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
