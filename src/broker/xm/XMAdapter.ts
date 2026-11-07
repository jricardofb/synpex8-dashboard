import { BrokerAdapter } from '../BrokerAdapter.js';
import type {
  BrokerAccountSnapshot,
  BrokerCancelResult,
  BrokerExecutionResult,
  BrokerOrderInput,
  BrokerPosition,
  BrokerPositionStatus,
  BrokerQuote,
} from '../types.js';

export interface XMAdapterConfig {
  apiUrl: string;
  accountId: string;
  environment?: 'demo' | 'real';
  currency?: string;
}

export class XMAdapter extends BrokerAdapter {
  private readonly apiUrl: string;
  private readonly environment: 'demo' | 'real';
  private readonly currency: string;
  private readonly demoPositions: Map<string, BrokerPosition>;
  private readonly demoOrders: Map<string, BrokerExecutionResult>;

  constructor(config: XMAdapterConfig) {
    if (config.environment === 'real') {
      throw new Error('XMAdapter is an in-memory demo simulator; real XM account execution is not supported');
    }

    super('XM', config.accountId);
    this.apiUrl = config.apiUrl;
    this.environment = config.environment ?? 'demo';
    this.currency = config.currency ?? 'USD';
    this.demoPositions = new Map();
    this.demoOrders = new Map();
  }

  getAccountSnapshot(): BrokerAccountSnapshot {
    const asOf = new Date().toISOString();

    return {
      accountId: this.accountId,
      broker: 'XM',
      currency: this.currency,
      balance: 25000,
      equity: 25000,
      usedMargin: 1240,
      freeMargin: 23760,
      asOf,
    };
  }

  listPositions(): BrokerPosition[] {
    return [...this.demoPositions.values()];
  }

  async getQuote(symbol: string): Promise<BrokerQuote> {
    const base = {
      XAUUSD: { bid: 2328.15, ask: 2328.45 },
      EURUSD: { bid: 1.0852, ask: 1.0855 },
      GBPUSD: { bid: 1.2744, ask: 1.2747 },
      USDJPY: { bid: 153.22, ask: 153.25 },
    } as const;

    const pair = base[symbol as keyof typeof base];

    return {
      symbol,
      bid: pair?.bid ?? 0,
      ask: pair?.ask ?? 0,
      valid: pair !== undefined,
      asOf: new Date().toISOString(),
    };
  }

  async placeOrder(input: BrokerOrderInput): Promise<BrokerExecutionResult> {
    const clientOrderId = input.clientOrderId;
    const positionId = `XM-${this.accountId}-${clientOrderId}`;
    const openPrice = input.price ?? 100;
    const createdAt = new Date().toISOString();

    const position: BrokerPosition = {
      positionId,
      symbol: input.symbol,
      direction: input.direction,
      volume: Number(input.volume),
      openPrice,
      clientOrderId,
      magicNumber: input.magicNumber,
      status: 'OPEN',
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      createdAt,
    };

    this.demoPositions.set(positionId, position);

    const result: BrokerExecutionResult = {
      clientOrderId,
      status: 'PENDING',
      positionId,
      filledVolume: Number(input.volume),
      price: openPrice,
      message: `XM demo order accepted for ${input.symbol}`,
    };

    this.demoOrders.set(clientOrderId, result);

    if (this.environment === 'demo') {
      result.status = 'FILLED';
    }

    const stored = this.demoPositions.get(positionId);
    if (stored) {
      stored.status = 'OPEN';
    }

    return result;
  }

  async modifyOrder(input: BrokerOrderInput): Promise<BrokerExecutionResult> {
    const existing = [...this.demoPositions.values()].find((pos) => pos.clientOrderId === input.clientOrderId);

    if (!existing) {
      return {
        clientOrderId: input.clientOrderId,
        status: 'UNKNOWN',
        message: 'No matching XM position found for modifyOrder',
      };
    }

    existing.stopLoss = input.stopLoss ?? existing.stopLoss ?? null;
    existing.takeProfit = input.takeProfit ?? existing.takeProfit ?? null;
    existing.openPrice = input.price ?? existing.openPrice;

    const result: BrokerExecutionResult = {
      clientOrderId: input.clientOrderId,
      positionId: existing.positionId,
      status: 'FILLED',
      filledVolume: existing.volume,
      price: existing.openPrice,
      message: `XM demo order modified for ${existing.symbol}`,
    };

    this.demoOrders.set(input.clientOrderId, result);
    return result;
  }

  cancelOrder(clientOrderId: string): BrokerCancelResult {
    const target = [...this.demoPositions.values()].find((pos) => pos.clientOrderId === clientOrderId);

    if (!target) {
      return {
        ok: false,
        clientOrderId,
        reason: 'position-not-found',
      };
    }

    target.status = 'CLOSED';
    this.demoPositions.delete(target.positionId);
    this.demoOrders.set(clientOrderId, {
      clientOrderId,
      status: 'CANCELLED',
      positionId: target.positionId,
      message: 'XM demo cancellation accepted',
    });

    return {
      ok: true,
      clientOrderId,
    };
  }

  async closePosition(positionId: string, volume = 0): Promise<BrokerExecutionResult> {
    const position = this.demoPositions.get(positionId);

    if (!position) {
      return {
        clientOrderId: positionId,
        status: 'UNKNOWN',
        message: 'position-not-found',
      };
    }

    const finalVolume = volume > 0 ? Math.min(volume, position.volume) : position.volume;
    const result: BrokerExecutionResult = {
      clientOrderId: position.clientOrderId,
      status: 'FILLED',
      positionId,
      filledVolume: finalVolume,
      price: position.openPrice,
      message: `XM demo close accepted for ${position.symbol}`,
    };

    const remainingVolume = position.volume - finalVolume;
    if (remainingVolume > 0) {
      position.volume = remainingVolume;
      position.status = 'PARTIAL';
    } else {
      position.status = 'CLOSED';
      this.demoPositions.delete(positionId);
    }
    this.demoOrders.set(position.clientOrderId, result);

    return result;
  }
}
