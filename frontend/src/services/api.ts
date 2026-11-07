const API_URL = 'http://localhost:3000';

export interface DashboardData {
  totalClients?: number;
  activeRobots?: number;
  openPositions?: number;
  [key: string]: unknown;
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_URL}/api/v1/dashboard`);

  if (!response.ok) {
    throw new Error(`Erro ao buscar dashboard: ${response.status}`);
  }

  return response.json();
}