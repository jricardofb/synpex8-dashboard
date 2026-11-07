import { describe, expect, it } from 'vitest';
import { masterSignalSchema } from '../src/signals/masterSignal.js';

const openSignal = {
  masterAccountId: 'MASTER-1',
  robotId: 'ROBOT-1',
  strategyId: 'STRATEGY-1',
  magicNumber: '1001',
  masterTicketId: 123456,
  eventType: 'OPEN',
  eventSeq: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  masterLot: 0.1,
  masterBalance: 10000,
  masterPrice: 2328.15,
};

describe('Master signal contract', () => {
  it('accepts an MT5 OPEN event and normalizes numeric identifiers', () => {
    const result = masterSignalSchema.parse(openSignal);

    expect(result.masterTicketId).toBe('123456');
    expect(result.eventSeq).toBe(1);
    expect(result.masterPrice).toBe(2328.15);
  });

  it('rejects OPEN events without the required master price or with legacy sequence zero', () => {
    expect(masterSignalSchema.safeParse({ ...openSignal, masterPrice: undefined }).success).toBe(false);
    expect(masterSignalSchema.safeParse({ ...openSignal, eventSeq: 0 }).success).toBe(false);
    expect(masterSignalSchema.safeParse({ ...openSignal, eventSeq: 2 }).success).toBe(false);
  });

  it('requires at least one stop update for MODIFY while allowing zero to remove a stop', () => {
    const modify = { ...openSignal, eventType: 'MODIFY', eventSeq: 2, masterPrice: undefined, stopLoss: 0 };
    expect(masterSignalSchema.parse(modify).stopLoss).toBe(0);
    expect(masterSignalSchema.safeParse({ ...modify, stopLoss: undefined }).success).toBe(false);
    expect(masterSignalSchema.safeParse({ ...modify, stopLoss: null, takeProfit: null }).success).toBe(false);
  });
});