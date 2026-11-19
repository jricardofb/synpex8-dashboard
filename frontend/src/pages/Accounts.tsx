// frontend/src/pages/Accounts.tsx
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { useApi, type Account } from "../lib/api";

const brl = (v: number) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AccountsPage() {
  const { data, error, loading } = useApi<Account[] | { data: Account[] }>("/api/v1/accounts", 10_000);
  const [search, setSearch] = useState("");

  const list: Account[] = Array.isArray(data) ? data : data?.data ?? [];

  const accounts = list.filter((a) =>
    [a.id, a.broker].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Contas</h3>
          <p>Contas de corretora cadastradas</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-count">
          <span className="count-number">{accounts.length}</span>
          <span>contas na lista</span>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conta..."
            aria-label="Buscar conta"
          />
        </label>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>CONTA</th>
              <th>CORRETORA</th>
              <th>MARGEM LIVRE</th>
              <th>RESERVADA</th>
              <th>UTILIZÁVEL</th>
              <th>SITUAÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="empty-state">Erro: {error.message}</td></tr>
            )}
            {!loading && !error && accounts.length === 0 && (
              <tr><td colSpan={6} className="empty-state">Nenhuma conta encontrada.</td></tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="robot-cell">
                    <div className="robot-avatar"><Users size={19} /></div>
                    <div>
                      <strong>{a.broker}</strong>
                      <span>{a.id}</span>
                    </div>
                  </div>
                </td>
                <td><span className="market-badge">{a.broker}</span></td>
                <td><span className="account-name">{brl(a.freeMargin)}</span></td>
                <td><span className="account-name">{brl(a.reservedMargin)}</span></td>
                <td><span className="account-name">{brl(a.usableMargin)}</span></td>
                <td>
                  <span className={`status-badge ${a.active ? "status-simulation" : "status-off"}`}>
                    <span />
                    {a.active ? "Ativa" : "Inativa"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-footer">
        <span>Dados da API</span>
        <span>Atualiza a cada 10s</span>
      </div>
    </div>
  );
}
