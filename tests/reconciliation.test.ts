import { describe, expect, it } from 'vitest';
import { reconcileUnknownPosition, applyEventReplay } from '../src/services/reconciliation.js';

describe('reconciliation service', () => {
  it('keeps UNKNOWN without re-sending order when broker cannot confirm execution', () => {
    const result = reconcileUnknownPosition({
      clientOrderId: 'X-1',
      brokerKnown: false,
      localPositionExists: false,
      graceMs: 15000,
    });

    expect(result.action).toBe('WAIT');
    expect(result.reason).toContain('UNKNOWN');
  });

  it('replays events in order when OPEN was confirmed later', () => {
    const replay = applyEventReplay({
      events: [
        { type: 'MODIFY', seq: 2, payload: { stopLoss: 100 } },
        { type: 'CLOSE', seq: 0, payload: {} },
        { type: 'PARTIAL_CLOSE', seq: 3, payload: { closedLot: 0.4 } },
      ],
    });

    expect(replay.map((e) => e.type)).toEqual(['CLOSE', 'MODIFY', 'PARTIAL_CLOSE']);
  });

  it('drops stale UNKNOWN orders once the grace window expires', () => {
    const result = reconcileUnknownPosition({
      clientOrderId: 'X-2',
      brokerKnown: false,
      localPositionExists: false,
      graceMs: 0,
    });

    expect(result.action).toBe('DROP');
    expect(result.reason).toContain('expired');
  });
});
