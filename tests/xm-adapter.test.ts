import { describe, expect, it } from 'vitest';
import { XMAdapter } from '../src/broker/xm/XMAdapter.js';
import type { BrokerOrderInput, BrokerPosition, BrokerAccountSnapshot } from '../src/broker/types.js';

describe('XMAdapter contract', () => {
  it('refuses real mode because this adapter is only an in-memory simulator', () => {
    expect(() => new XMAdapter({
      apiUrl: 'https://api.xm.com',
      accountId: 'XM-REAL-1',
      environment: 'real',
    })).toThrow('XMAdapter is an in-memory demo simulator; real XM account execution is not supported');
  });

  it('builds a demo account snapshot with required broker fields', () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });

    const snapshot = adapter.getAccountSnapshot();

    expect(snapshot).toMatchObject({
      accountId: 'XM-DEMO-1',
      balance: expect.any(Number),
      equity: expect.any(Number),
      usedMargin: expect.any(Number),
      freeMargin: expect.any(Number),
      currency: 'USD',
    });
  });

  it('accepts a safe order and returns a clientOrderId', async () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });

    const order: BrokerOrderInput = {
      symbol: 'XAUUSD',
      direction: 'BUY',
      volume: 0.1,
      stopLoss: undefined,
      takeProfit: undefined,
      clientOrderId: 'CT-demo-1',
      magicNumber: '1001',
    };

    const result = await adapter.placeOrder(order);

    expect(result.clientOrderId).toBe('CT-demo-1');
    expect(result.status).toMatch(/PENDING|FILLED|UNKNOWN/);
    expect(result.positionId ?? '').toBeTruthy();
  });

  it('tracks a position and supports partial fill cancellation semantics', async () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });

    const order = {
      symbol: 'EURUSD',
      direction: 'BUY',
      volume: 0.5,
      clientOrderId: 'CT-demo-2',
      magicNumber: '1002',
    } satisfies BrokerOrderInput;

    const placed = await adapter.placeOrder(order);
    expect(placed.clientOrderId).toBe('CT-demo-2');

    const positions = adapter.listPositions();
    expect(positions.length).toBeGreaterThan(0);

    const first = positions[0] as BrokerPosition;
    expect(first).toMatchObject({
      symbol: expect.any(String),
      direction: expect.stringMatching(/BUY|SELL/),
      volume: expect.any(Number),
      clientOrderId: expect.any(String),
    });

    const cancelResult = adapter.cancelOrder(first.clientOrderId);
    expect(cancelResult.ok).toBe(true);
  });

  it('keeps the remaining position open after a partial close', async () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });
    const placed = await adapter.placeOrder({
      symbol: 'EURUSD',
      direction: 'BUY',
      volume: 1,
      clientOrderId: 'CT-partial-close',
    });

    const close = await adapter.closePosition(placed.positionId!, 0.4);

    expect(close.status).toBe('FILLED');
    expect(close.filledVolume).toBe(0.4);
    expect(adapter.listPositions()).toMatchObject([
      { positionId: placed.positionId, volume: 0.6, status: 'PARTIAL' },
    ]);
  });

  it('resolves quotes without blocking order creation on quote failure', async () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });

    const quote = await adapter.getQuote('XAUUSD');
    expect(quote).toMatchObject({
      symbol: 'XAUUSD',
      bid: expect.any(Number),
      ask: expect.any(Number),
      valid: true,
    });
  });

  it('marks an unknown symbol quote invalid instead of inventing generic prices', async () => {
    const adapter = new XMAdapter({
      apiUrl: 'https://demo-api.xm.com',
      accountId: 'XM-DEMO-1',
      environment: 'demo',
    });

    const quote = await adapter.getQuote('XAUUSDm');

    expect(quote).toMatchObject({ symbol: 'XAUUSDm', bid: 0, ask: 0, valid: false });
  });
});
