export interface Strategy {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    createdAt?: string;
}

export type StrategyInput = Pick<Strategy, 'name' | 'description'>;

const BASE = '/api/v1/strategies';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json();
}


export const strategiesApi = {
    list: () => req<Strategy[]>(BASE),
    get: (id: string) => req<Strategy>(`${BASE}/${id}`),
    create: (data: StrategyInput) =>
        req<Strategy>(BASE, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<StrategyInput>) =>
        req<Strategy>(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    toggle: (id: string) => req<Strategy>(`${BASE}/${id}/toggle`, { method: 'PATCH' }),
};

