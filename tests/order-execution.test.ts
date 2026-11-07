import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter } from '../src/broker/BrokerAdapter.js';
import type { BrokerExecutionResult } from '../src/broker/types.js';
import { XMAdapter } from '../src/broker/xm/XMAdapter.js';
import { executeOrder } from '../src/services/orderExecution.js';
import type { OrderExecutionStore, OrderIntentRecord } from '../src/services/orderExecutionStore.js';

function createMemoryOrderStore(): OrderExecutionStore {
  const records = new Map<string, OrderIntentRecord>();
  let nextId = 0;

  return {
    async createOrderIntent({ brokerAccountId, order, requiredMargin }) {
      const key = `${brokerAccountId}:${order.clientOrderId}`;
      const existing = records.get(key);
      if (existing) return { created: false, record: existing };

      const record: OrderIntentRecord = {
        id: `order-${++nextId}`,
        status: 'SUBMITTING',
        filledVolume: 0,
        reservation: {
          accountId: brokerAccountId,
          symbol: order.symbol,
          amount: requiredMargin,
          reason: 'new-order',
          createdAt: new Date(),
        },
      };
      records.set(key, record);
      return { created: true, record };
    },
    async updateExecution(orderId, execution: BrokerExecutionResult) {
      const record = [...records.values()].find((candidate) => candidate.id === orderId);
      if (!record) throw new Error(`Unknown order ${orderId}`);
      record.status = execution.status;
      record.filledVolume = execution.filledVolume ?? 0;
      record.positionId = execution.positionId;
      record.price = execution.price;
      record.message = execution.message;
    },
    async releaseReservation() {},
  };
}

describe('order execution service', () => {
  it('blocks order when margin is insufficient', async () => {
    const broker = new XMAdapter({ apiUrl: 'https://demo-api.xm.com', accountId: 'XM-ACCT-1', environment: 'demo' });

    const result = await executeOrder({
      broker,
      store: createMemoryOrderStore(),
      brokerAccountId: 'broker-db-1',
      accountSnapshot: {
        accountId: 'XM-ACCT-1',
        broker: 'XM',
        currency: 'USD',
        balance: 1000,
        equity: 1000,
        usedMargin: 0,
        freeMargin: 100,
        asOf: new Date().toISOString(),
      },
      order: {
        symbol: 'XAUUSD',
        direction: 'BUY',
        volume: 0.8,
        clientOrderId: 'order-insufficient',
        magicNumber: '2000',
      },
      requiredMargin: 300,
      reservedMargin: 10,
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  it('accepts order and reserves margin when enough free margin exists', async () => {
    const broker = new XMAdapter({ apiUrl: 'https://demo-api.xm.com', accountId: 'XM-ACCT-1', environment: 'demo' });

    const result = await executeOrder({
      broker,
      store: createMemoryOrderStore(),
      brokerAccountId: 'broker-db-1',
      accountSnapshot: {
        accountId: 'XM-ACCT-1',
        broker: 'XM',
        currency: 'USD',
        balance: 10000,
        equity: 10000,
        usedMargin: 0,
        freeMargin: 2000,
        asOf: new Date().toISOString(),
      },
      order: {
        symbol: 'EURUSD',
        direction: 'BUY',
        volume: 0.5,
        clientOrderId: 'order-ok',
        magicNumber: '2001',
      },
      requiredMargin: 200,
      reservedMargin: 50,
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toMatch(/PENDING|FILLED|PARTIALLY_FILLED/);
    expect(result.reservation?.amount).toBeGreaterThan(0);
  });

  it('does not resubmit an order after an uncertain broker response', async () => {
    const store = createMemoryOrderStore();
    const broker = {
      placeOrder: vi.fn(async () => {
        throw new Error('network timeout');
      }),
    } as unknown as BrokerAdapter;
    const input = {
      broker,
      store,
      brokerAccountId: 'broker-db-1',
      accountSnapshot: {
        accountId: 'XM-ACCT-1',
        broker: 'XM',
        currency: 'USD',
        balance: 10000,
        equity: 10000,
        usedMargin: 0,
        freeMargin: 2000,
        asOf: new Date().toISOString(),
      },
      order: {
        symbol: 'EURUSD',
        direction: 'BUY' as const,
        volume: 0.5,
        clientOrderId: 'order-uncertain',
      },
      requiredMargin: 200,
    };

    const first = await executeOrder(input);
    const retry = await executeOrder(input);

    expect(first.status).toBe('UNKNOWN');
    expect(retry.status).toBe('UNKNOWN');
    expect(retry.reason).toContain('reconcile without resubmitting');
    expect(broker.placeOrder).toHaveBeenCalledTimes(1);
  });
});
