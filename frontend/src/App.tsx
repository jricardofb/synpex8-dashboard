import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Radio,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";

import { useState } from "react";
import "./index.css";

const robots = [
  {
    name: "ORB Institutional",
    strategy: "ORB Breakout",
    account: "Master-001",
    market: "WIN$",
    status: "Simulação",
  },
  {
    name: "VWAP Momentum",
    strategy: "VWAP + EMA9",
    account: "Master-002",
    market: "EURUSD",
    status: "Desligado",
  },
  {
    name: "Trend Following",
    strategy: "Tendência",
    account: "Master-003",
    market: "XAUUSD",
    status: "Desligado",
  },
  {
    name: "Mean Reversion",
    strategy: "Reversão à média",
    account: "Master-004",
    market: "PETR4",
    status: "Desligado",
  },
];

const services = [
  { name: "API", detail: "Estado não verificado", icon: Server },
  { name: "PostgreSQL", detail: "Estado não verificado", icon: Database },
  { name: "Redis", detail: "Estado não verificado", icon: Wifi },
  { name: "Worker", detail: "Execução simulada", icon: Activity },
];

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

  const filteredRobots = robots.filter((robot) =>
    [
      robot.name,
      robot.strategy,
      robot.account,
      robot.market,
      robot.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

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
          <div className="brand-icon">
            <Activity size={23} />
          </div>

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
                  <span className="nav-count">0</span>
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
              <span className="demo-label">DADOS DEMONSTRATIVOS</span>
              <button
                className="secondary-button"
                onClick={() => window.location.reload()}
              >
                <Activity size={16} />
                Atualizar tela
              </button>
            </div>
          </section>

          <section className="notice-banner">
            <div className="notice-icon">
              <ShieldCheck size={20} />
            </div>

            <div className="notice-copy">
              <strong>Ambiente protegido — modo de simulação</strong>
              <p>
                Os indicadores desta tela são demonstrativos. Nenhuma ordem
                real é executada por esta interface.
              </p>
            </div>

            <span className="notice-status">DRY-RUN</span>
          </section>

          <section className="metrics-grid">
            <MetricCard
              title="Robôs cadastrados"
              value="04"
              description="Exemplos de interface"
              icon={Bot}
              tone="purple"
            />

            <MetricCard
              title="Contas cadastradas"
              value="—"
              description="Aguardando integração"
              icon={Users}
              tone="blue"
            />

            <MetricCard
              title="Sinais recebidos"
              value="—"
              description="Dados da API pendentes"
              icon={Radio}
              tone="orange"
            />

            <MetricCard
              title="Alertas de risco"
              value="—"
              description="Monitoramento pendente"
              icon={ShieldCheck}
              tone="green"
            />
          </section>

          <section className="content-grid">
            <div className="panel robots-panel">
              <div className="panel-header">
                <div>
                  <h3>Robôs de trading</h3>
                  <p>Visualização demonstrativa dos robôs</p>
                </div>

                <button
                  className="icon-button"
                  aria-label="Mais opções"
                  title="Mais opções"
                >
                  <MoreHorizontal size={21} />
                </button>
              </div>

              <div className="table-toolbar">
                <div className="table-count">
                  <span className="count-number">{filteredRobots.length}</span>
                  <span>robôs na lista demonstrativa</span>
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
                      <th>MERCADO</th>
                      <th>CONTA</th>
                      <th>SITUAÇÃO</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRobots.map((robot) => (
                      <tr key={robot.name}>
                        <td>
                          <div className="robot-cell">
                            <div className="robot-avatar">
                              <Bot size={19} />
                            </div>

                            <div>
                              <strong>{robot.name}</strong>
                              <span>{robot.strategy}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="market-badge">{robot.market}</span>
                        </td>

                        <td>
                          <span className="account-name">{robot.account}</span>
                        </td>

                        <td>
                          <StatusBadge status={robot.status} />
                        </td>

                        <td>
                          <button
                            className="row-action"
                            aria-label={`Ver ${robot.name}`}
                            title="Visualização demonstrativa"
                            onClick={() =>
                              window.alert(
                                `${robot.name}\n\nEsta tela ainda não está conectada à API.`,
                              )
                            }
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredRobots.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          Nenhum robô encontrado para essa busca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="panel-footer">
                <span>Dados locais de demonstração</span>
                <span>Integração com API pendente</span>
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
                        <div className="service-icon">
                          <Icon size={18} />
                        </div>

                        <div className="service-info">
                          <strong>{service.name}</strong>
                          <span>{service.detail}</span>
                        </div>

                        <span className="unknown-dot" title="Não verificado" />
                      </div>
                    );
                  })}
                </div>

                <div className="service-note">
                  Os estados serão verificados pela API na próxima etapa.
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
                  <div className="activity-empty-icon">
                    <Radio size={22} />
                  </div>
                  <strong>Aguardando eventos</strong>
                  <p>
                    Os sinais e eventos reais aparecerão aqui quando
                    conectarmos a API.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <footer className="page-footer">
            <span>
              SYNPEX8 <span className="footer-separator">·</span> Painel
              administrativo
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
  title,
  value,
  description,
  icon: Icon,
  tone,
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

      <div className="metric-description">
        <span>{description}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Simulação") {
    return (
      <span className="status-badge status-simulation">
        <span />
        Simulação
      </span>
    );
  }

  return (
    <span className="status-badge status-off">
      <span />
      Desligado
    </span>
  );
}

export default App;