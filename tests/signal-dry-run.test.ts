import { describe, expect, it, vi } from 'vitest';
import {
  SignalDryRunProcessor,
  type SignalDryRunStore,
} from '../src/services/signalDryRun.js';
import {
  UnknownInstrumentTypeError,
  UnknownMasterSymbolError,
} from '../src/services/assetMapping.js';

const signal = {
  masterAccountId: 'MASTER-1',
  robotId: 'SOURCE-ROBOT',
  strategyId: 'STRATEGY-1',
  magicNumber: '1001',
  masterTicketId: 'TEST-1',
  eventType: 'OPEN',
  eventSeq: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  masterLot: 0.1,
  masterPrice: 2328.15,
  contractSize: 100,
};

function createStore(overrides: Partial<SignalDryRunStore> = {}): SignalDryRunStore {
  return {
    async findSignal() {
      return {
        id: 'signal-1',
        masterId: 'master-db-1',
        robotId: 'SOURCE-ROBOT',
        strategyId: 'STRATEGY-1',
        payload: signal,
      };
    },
    async findResult() { return null; },
    async findEligibleRoutes() {
      return [{
        id: 'route-1',
        clientId: 'client-1',
        brokerAccountId: 'account-1',
        brokerAccount: { broker: 'XM' },
        robot: { id: 'robot-1' },
      }];
    },
    async resolveMasterAsset() {
      return {
        sourceSymbol: 'XAUUSD',
        universalAssetCode: 'GOLD',
        instrumentType: 'CFD',
        masterContractSize: 100,
      };
    },
    async resolveBrokerAsset() {
      return {
        brokerSymbol: 'XAUUSD',
        instrumentType: 'CFD',
        contractSize: 100,
        conversionMode: 'EXACT_ONLY',
      };
    },
    saveResult: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('signal dry-run processor', () => {
  it('validates active destination mappings and calculates the proportional volume without calling a broker', async () => {
    const store = createStore();
    const result = await new SignalDryRunProcessor(store).process('signal-1');

    expect(result).toMatchObject({
      mode: 'DRY_RUN',
      status: 'DRY_RUN_COMPLETED',
      destinationCount: 1,
      destinations: [{
        routeId: 'route-1',
        broker: 'XM',
        brokerSymbol: 'XAUUSD',
        direction: 'BUY',
        plannedVolume: 0.1,
        status: 'MAPPED',
      }],
    });
    expect(store.saveResult).toHaveBeenCalledWith('signal-1', result);
  });

  it('records that missing routes block a signal rather than sending an order', async () => {
    const result = await new SignalDryRunProcessor(createStore({
      async findEligibleRoutes() { return []; },
    })).process('signal-1');

    expect(result.status).toBe('NO_ROUTE');
    expect(result.destinationCount).toBe(0);
  });

  it('records an unmapped asset as blocked and does not silently fall back', async () => {
    const result = await new SignalDryRunProcessor(createStore({
      async resolveMasterAsset() { throw new UnknownMasterSymbolError('XAUUSD'); },
    })).process('signal-1');

    expect(result.status).toBe('BLOCKED');
    expect(result.destinations[0]).toMatchObject({
      status: 'BLOCKED',
      reason: 'No active Master asset mapping exists for symbol XAUUSD',
    });
  });

  it('blocks legacy unknown mappings, then accepts them after explicit recadastration', async () => {
    const legacyResult = await new SignalDryRunProcessor(createStore({
      async resolveMasterAsset() { throw new UnknownInstrumentTypeError('Master symbol XAUUSD'); },
    })).process('signal-legacy');

    const recadastratedResult = await new SignalDryRunProcessor(createStore({
      async resolveMasterAsset() {
        return {
          sourceSymbol: 'XAUUSD',
          universalAssetCode: 'GOLD',
          instrumentType: 'CFD',
          masterContractSize: 100,
        };
      },
    })).process('signal-recadastred');

    expect(legacyResult.status).toBe('BLOCKED');
    expect(legacyResult.destinations[0]).toMatchObject({
      status: 'BLOCKED',
      reason: 'A known instrument type is required for Master symbol XAUUSD',
    });
    expect(recadastratedResult.status).toBe('DRY_RUN_COMPLETED');
  });

  it('blocks a different instrument type even when both mappings use the same universal code', async () => {
    const result = await new SignalDryRunProcessor(createStore({
      async resolveBrokerAsset() {
        return {
          brokerSymbol: 'GOLD-MICRO',
          instrumentType: 'FUTURE',
          contractSize: 1,
          conversionMode: 'CONTRACT_SIZE_RATIO',
        };
      },
    })).process('signal-1');

    expect(result.status).toBe('BLOCKED');
    expect(result.destinations[0]).toMatchObject({
      status: 'BLOCKED',
      reason: 'Instrument type mismatch: Master uses CFD, broker mapping uses FUTURE',
    });
  });

  it('only calculates a contract-size ratio when the broker mapping explicitly allows it', async () => {
    const exactOnly = await new SignalDryRunProcessor(createStore({
      async resolveBrokerAsset() {
        return {
          brokerSymbol: 'XAUUSD.s',
          instrumentType: 'CFD',
          contractSize: 1,
          conversionMode: 'EXACT_ONLY',
        };
      },
    })).process('signal-1');
    const approved = await new SignalDryRunProcessor(createStore({
      async resolveBrokerAsset() {
        return {
          brokerSymbol: 'XAUUSD.s',
          instrumentType: 'CFD',
          contractSize: 1,
          conversionMode: 'CONTRACT_SIZE_RATIO',
        };
      },
    })).process('signal-1');

    expect(exactOnly.status).toBe('BLOCKED');
    expect(exactOnly.destinations[0]?.status).toBe('BLOCKED');
    expect(approved.status).toBe('DRY_RUN_COMPLETED');
    expect(approved.destinations[0]).toMatchObject({
      status: 'MAPPED',
      brokerSymbol: 'XAUUSD.s',
      plannedVolume: 10,
    });
  });

  it('marks CLOSE events unsupported until position lifecycle routing is implemented', async () => {
    const result = await new SignalDryRunProcessor(createStore({
      async findSignal() {
        return {
          id: 'signal-1',
          masterId: 'master-db-1',
          robotId: 'SOURCE-ROBOT',
          strategyId: 'STRATEGY-1',
          payload: { ...signal, eventType: 'CLOSE', eventSeq: 2 },
        };
      },
    })).process('signal-1');

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.eventType).toBe('CLOSE');
  });

  it('returns the persisted result on retry without recalculating or duplicating work', async () => {
    const result = {
      mode: 'DRY_RUN' as const,
      status: 'DRY_RUN_COMPLETED' as const,
      eventType: 'OPEN',
      destinationCount: 0,
      destinations: [],
    };
    const findEligibleRoutes = vi.fn();
    const processor = new SignalDryRunProcessor(createStore({
      async findResult() { return result; },
      findEligibleRoutes,
    }));

    await expect(processor.process('signal-1')).resolves.toEqual(result);
    expect(findEligibleRoutes).not.toHaveBeenCalled();
  });
});
