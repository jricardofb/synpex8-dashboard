import { useState } from "react";
import { useApi, type DashboardSummary, type Robot, type Account } from "./lib/api";
import AccountsPage from "./pages/Accounts";
import RobotsPage from "./pages/Robots";
import SignalsPage from "./pages/Signals";
import { refreshAll } from "./lib/api";
import StrategiesPage from './pages/Strategies'; // ajuste o caminho se precisar



import {
  Activity, ArrowUpRight, Bell, Bot, CheckCircle2, ChevronDown, Clock3, Database,
  LayoutDashboard, Menu, MoreHorizontal, Radio, Search, Server, Settings,
  ShieldCheck, Users, Wifi, X, Zap,
} from "lucide-react";

type Health = { api: "ok"; postgres: "ok" | "down"; redis: "ok" | "down" };

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Robôs", icon: Bot },
  { label: "Contas", icon: Users },
  { label: "Sinais", icon: Radio },
  { label: "Estratégias", icon: Zap },
  { label: "Gestão de risco", icon: ShieldCheck },
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  const dashboard = useApi<DashboardSummary>('/api/v1/dashboard/summary');
  const robotsRes = useApi<Robot[] | { data: Robot[] }>("/api/v1/robots", 10_000);
  const robots: Robot[] = Array.isArray(robotsRes.data)
    ? robotsRes.data
    : robotsRes.data?.data ?? [];



  const health = useApi<Health>("/api/v1/health", 10_000);
  const accountsRes = useApi<Account[]>("/api/v1/accounts", 10_000);
  const accounts = accountsRes.data ?? [];



  const filteredRobots = robots.filter((robot) =>
    [robot.name, robot.externalId, robot.status]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const d = dashboard.data;
  const h = health.data;

  // null = carregando | true = ok | false = falha
  const svc = (value: string | undefined): boolean | null => {
    if (health.error) return false;
    if (!h) return null;
    return value === "ok";
  };
  const label = (ok: boolean | null) =>
    ok === null ? "Verificando..." : ok ? "Online" : "Offline";

  const apiOk = svc(h?.api);
  const pgOk = svc(h?.postgres);
  const redisOk = svc(h?.redis);

  const services = [
    { name: "API", detail: label(apiOk), icon: Server, ok: apiOk },
    { name: "PostgreSQL", detail: label(pgOk), icon: Database, ok: pgOk },
    { name: "Redis", detail: label(redisOk), icon: Wifi, ok: redisOk },
    { name: "Worker", detail: "Execução simulada", icon: Activity, ok: null },
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Activity size={23} /></div>
          <div>
            <h1>SYNPEX<span>8</span></h1>
            <p>TRADING SYSTEM</p>
          </div>
          <button
            className="mobile-close icon-button"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace">
          <div className="workspace-avatar">S</div>
          <div className="workspace-info">
            <strong>Synpex Workspace</strong>
            <span>Ambiente de desenvolvimento</span>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <div className="nav-label">MENU PRINCIPAL</div>

        <nav className="navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.label;
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
                onClick={() => {
                  setActivePage(item.label);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === "Sinais" && (
                  <span className="nav-count">{d ? d.signals.pending : 0}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="environment-card">
            <div className="environment-heading">
              <span className="environment-dot" />
              Ambiente de teste
            </div>
            <p>
              O processamento de sinais está em modo de simulação.
              Ordens reais não estão habilitadas.
            </p>
          </div>

          <button
            className={`nav-item ${activePage === "Configurações" ? "nav-item-active" : ""}`}
            onClick={() => {
              setActivePage("Configurações");
              setSidebarOpen(false);
            }}
          >
            <Settings size={19} />
            <span>Configurações</span>
          </button>

          <div className="sidebar-version">
            <span>SYNPEX8</span>
            <span>Frontend v0.1</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-separator">/</span>
              <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="environment-badge">
              <span className="environment-dot" />
              DRY-RUN
            </div>
            <button className="icon-button notification-button" aria-label="Notificações">
              <Bell size={19} />
              <span />
            </button>
            <div className="user-profile">
              <div className="user-avatar">AD</div>
              <div className="user-details">
                <strong>Administrador</strong>
                <span>Desenvolvimento</span>
              </div>
              <ChevronDown size={15} className="muted-icon" />
            </div>
          </div>
        </header>

        <div className="page-container">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                CENTRAL DE OPERAÇÕES
              </div>
              <h2>{activePage === "Dashboard" ? "Visão geral" : activePage}</h2>
              <p>
                {activePage === "Dashboard"
                  ? "Acompanhe seus robôs e a infraestrutura em um só lugar."
                  : `Área de ${activePage.toLowerCase()} do sistema SYNPEX8.`}
              </p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" onClick={refreshAll}>
                <Activity size={16} />
                Atualizar tela
              </button>
            </div>
          </section>

          {activePage === "Contas" ? (
            <AccountsPage />
          ) : activePage === "Robôs" ? (
            <RobotsPage />
          ) : activePage === "Sinais" ? (
            <SignalsPage />
          ) : activePage === "Estratégias" ? (
            <StrategiesPage />
          ) : activePage !== "Dashboard" ? (
            <section className="panel">
              <div className="activity-empty">
                <div className="activity-empty-icon"><Clock3 size={22} /></div>
                <strong>Em construção</strong>
                <p>A área de {activePage.toLowerCase()} será disponibilizada em breve.</p>
              </div>
            </section>
          ) : (
            <>
              <section className="notice-banner">
                <div className="notice-icon"><ShieldCheck size={20} /></div>
                <div className="notice-copy">
                  <strong>Ambiente protegido — modo de simulação</strong>
                  <p>Nenhuma ordem real é executada por esta interface.</p>
                </div>
                <span className="notice-status">DRY-RUN</span>
              </section>

              <section className="metrics-grid">
                <MetricCard
                  title="Robôs cadastrados"
                  value={d ? String(d.robots.total) : "—"}
                  description={d ? `${d.robots.on} ON / ${d.robots.off} OFF` : "Carregando..."}
                  icon={Bot}
                  tone="purple"
                />
                <MetricCard
                  title="Contas cadastradas"
                  value={accountsRes.data ? String(accounts.length) : "—"}
                  description={
                    accountsRes.data
                      ? `${accounts.filter((a) => a.active).length} ativas`
                      : "Carregando..."
                  }
                  icon={Users}
                  tone="blue"
                />
                <MetricCard
                  title="Sinais recebidos"
                  value={d ? String(d.signals.total) : "—"}
                  description={d ? `${d.signals.pending} pendentes` : "Carregando..."}
                  icon={Radio}
                  tone="orange"
                />
                <MetricCard
                  title="Posições abertas"
                  value={d ? String(d.positions.open) : "—"}
                  description="Modo simulação"
                  icon={ShieldCheck}
                  tone="green"
                />
              </section>

              <section className="content-grid">
                <div className="panel robots-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Robôs de trading</h3>
                      <p>Robôs cadastrados na API</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Gerenciar robôs"
                      title="Gerenciar robôs"
                      onClick={() => setActivePage("Robôs")}
                    >
                      <MoreHorizontal size={21} />
                    </button>
                  </div>

                  <div className="table-toolbar">
                    <div className="table-count">
                      <span className="count-number">{filteredRobots.length}</span>
                      <span>robôs na lista</span>
                    </div>
                    <label className="search-box">
                      <Search size={16} />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar robô..."
                        aria-label="Buscar robô"
                      />
                    </label>
                  </div>

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>ROBÔ</th>
                          <th>ID EXTERNO</th>
                          <th>VOLUME</th>
                          <th>SITUAÇÃO</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRobots.map((robot) => (
                          <tr key={robot.id}>
                            <td>
                              <div className="robot-cell">
                                <div className="robot-avatar"><Bot size={19} /></div>
                                <div>
                                  <strong>{robot.name}</strong>
                                  <span>{robot.externalId}</span>
                                </div>
                              </div>
                            </td>
                            <td><span className="market-badge">{robot.externalId}</span></td>
                            <td>
                              <span className="account-name">{String(robot.configuredVolume)}</span>
                            </td>
                            <td>
                              <StatusBadge status={robot.status === "ON" ? "Simulação" : "Desligado"} />
                            </td>
                            <td>
                              <button
                                className="row-action"
                                aria-label={`Gerenciar ${robot.name}`}
                                onClick={() => setActivePage("Robôs")}
                              >
                                <ArrowUpRight size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {filteredRobots.length === 0 && (
                          <tr>
                            <td colSpan={5} className="empty-state">
                              {robotsRes.error
                                ? "Falha ao carregar robôs."
                                : "Nenhum robô encontrado para essa busca."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="panel-footer">
                    <span>Dados da API</span>
                    <span>Atualiza a cada 10s</span>
                  </div>
                </div>

                <div className="right-column">
                  <div className="panel services-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Infraestrutura</h3>
                        <p>Estado dos componentes</p>
                      </div>
                      <span className="live-indicator">
                        <span />
                        STATUS
                      </span>
                    </div>

                    <div className="services-list">
                      {services.map((service) => {
                        const Icon = service.icon;
                        return (
                          <div className="service-row" key={service.name}>
                            <div className="service-icon"><Icon size={18} /></div>
                            <div className="service-info">
                              <strong>{service.name}</strong>
                              <span>{service.detail}</span>
                            </div>
                            <span
                              className="unknown-dot"
                              style={
                                service.ok === null
                                  ? undefined
                                  : { background: service.ok ? "#79d9b2" : "#f2788f" }
                              }
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="service-note">
                      API, PostgreSQL e Redis verificados a cada 10s.
                    </div>
                  </div>

                  <div className="panel activity-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Atividade recente</h3>
                        <p>Eventos do sistema</p>
                      </div>
                      <Clock3 size={18} className="muted-icon" />
                    </div>
                    <div className="activity-empty">
                      <div className="activity-empty-icon"><Radio size={22} /></div>
                      <strong>Aguardando eventos</strong>
                      <p>Os sinais e eventos reais aparecerão aqui quando conectarmos a API.</p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>
              SYNPEX8 <span className="footer-separator">·</span> Painel administrativo
            </span>
            <span>
              <CheckCircle2 size={14} />
              Interface em desenvolvimento
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  title, value, description, icon: Icon, tone,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Bot;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <div className={`metric-icon ${tone}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-description"><span>{description}</span></div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const sim = status === "Simulação";
  return (
    <span className={`status-badge ${sim ? "status-simulation" : "status-off"}`}>
      <span />
      {sim ? "Simulação" : "Desligado"}
    </span>
  );
}

export default App;
