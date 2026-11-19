// frontend/src/pages/Signals.tsx
import { useMemo, useState } from "react";
import { Search, Radio, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useApi } from "../lib/api";

export type Signal = {
  id: string;
  symbol?: string;
  ticker?: string;
  side?: string;        // "buy" | "sell"
  action?: string;      // alternativa a side
  quantity?: number;
  qty?: number;
  price?: number;
  status?: string;      // "pending" | "processed" | "error" ...
  source?: string;
  masterId?: string;
  error?: string;
  errorMessage?: string;
  createdAt?: string;
  receivedAt?: string;
  eventType?: string;
  masterTicketId?: string;
  payload?: { symbol?: string; side?: string; volume?: number; price?: number };
};


type Resp = Signal[] | { data: Signal[] };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendente",   cls: "status-paused" },
  queued:    { label: "Na fila",    cls: "status-paused" },
  processing:{ label: "Processando",cls: "status-simulation" },
  processed: { label: "Processado", cls: "status-active" },
  executed:  { label: "Executado",  cls: "status-active" },
  error:     { label: "Erro",       cls: "status-off" },
  failed:    { label: "Falhou",     cls: "status-off" },
  rejected:  { label: "Rejeitado",  cls: "status-off" },
};

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendentes", match: ["pending", "queued", "processing"] },
  { key: "processed", label: "Processados", match: ["processed", "executed"] },
  { key: "error", label: "Com erro", match: ["error", "failed", "rejected"] },
] as const;

const brl = (v?: number) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";

const norm = (s: Signal) => ({
  id: s.id,
  symbol: s.symbol ?? s.ticker ?? s.payload?.symbol ?? "—",
  side: (s.side ?? s.action ?? s.payload?.side ?? "").toLowerCase(),
  qty: s.quantity ?? s.qty ?? s.payload?.volume,
  price: s.price ?? s.payload?.price,
  status: (s.status ?? "pending").toLowerCase(),
  source: s.source ?? s.masterId ?? s.masterTicketId ?? "—",
  error: s.error ?? s.errorMessage,
  date: s.createdAt ?? s.receivedAt,
});


export default function SignalsPage() {
  const { data, error, loading } = useApi<Resp>("/api/v1/signals", 5_000);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");


  const all = useMemo(() => {
    const list: Signal[] = Array.isArray(data) ? data : data?.data ?? [];
    return list
      .map(norm)
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    FILTERS.forEach((f) => {
      if ("match" in f) c[f.key] = all.filter((s) => (f.match as readonly string[]).includes(s.status)).length;
    });
    return c;
  }, [all]);

  const signals = all.filter((s) => {
    const f = FILTERS.find((x) => x.key === filter);
    const okStatus = !f || !("match" in f) || (f.match as readonly string[]).includes(s.status);
    const okSearch = [s.id, s.symbol, s.source].join(" ").toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Sinais</h3>
          <p>Sinais recebidos e status de processamento</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className="count-number">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ativo, ID ou origem..."
            aria-label="Buscar sinal"
          />
        </label>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ATIVO</th>
              <th>LADO</th>
              <th>QTD</th>
              <th>PREÇO</th>
              <th>ORIGEM</th>
              <th>RECEBIDO</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            )}
            {error && (
              <tr><td colSpan={7} className="empty-state">Erro: {error.message}</td></tr>
            )}
            {!loading && !error && signals.length === 0 && (
              <tr><td colSpan={7} className="empty-state">Nenhum sinal encontrado.</td></tr>
            )}
            {signals.map((s) => {
              const st = STATUS[s.status] ?? { label: s.status, cls: "status-off" };
              const buy = s.side === "buy" || s.side === "compra";
              return (
                <tr key={s.id}>
                  <td>
                    <div className="robot-cell">
                      <div className="robot-avatar"><Radio size={19} /></div>
                      <div>
                        <strong>{s.symbol}</strong>
                        <span>{s.id}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {s.side ? (
                      <span className={`side-badge ${buy ? "side-buy" : "side-sell"}`}>
                        {buy ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {buy ? "Compra" : "Venda"}
                      </span>
                    ) : "—"}
                  </td>
                  <td>{s.qty ?? "—"}</td>
                  <td><span className="account-name">{brl(s.price)}</span></td>
                  <td><span className="market-badge">{s.source}</span></td>
                  <td>{fmtDate(s.date)}</td>
                  <td>
                    <span className={`status-badge ${st.cls}`} title={s.error ?? ""}>
                      <span />
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-footer">
        <span>Dados da API</span>
        <span>Atualiza a cada 5s</span>
      </div>
    </div>
  );
}
