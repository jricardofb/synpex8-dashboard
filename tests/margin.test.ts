import { describe, expect, it } from 'vitest';
import { evaluateMargin, reserveMargin } from '../src/services/margin.js';

describe('margin guard', () => {
  it('allows orders when required margin is below free margin', () => {
    const result = evaluateMargin({
      freeMargin: 1000,
      requiredMargin: 200,
      reservedMargin: 150,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects orders when required margin exceeds usable margin after reservations', () => {
    const result = evaluateMargin({
      freeMargin: 1000,
      requiredMargin: 900,
      reservedMargin: 150,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('insufficient');
  });

  it('creates a reservation record keyed by account and symbol', () => {
    const reservation = reserveMargin({
      accountId: 'ACC-1',
      symbol: 'XAUUSD',
      amount: 250,
      reason: 'new-order',
      expiresAt: new Date(Date.now() + 60000),
    });

    expect(reservation).toMatchObject({
      accountId: 'ACC-1',
      symbol: 'XAUUSD',
      amount: 250,
      reason: 'new-order',
    });
  });
});
