export type BrokerDirection = 'BUY' | 'SELL';
export type BrokerOrderStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'UNKNOWN' | 'CANCELLED';
export type BrokerPositionStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';

export interface BrokerOrderInput {
  symbol: string;
  direction: BrokerDirection;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  clientOrderId: string;
  magicNumber?: string;
  comment?: string;
  price?: number;
}

export interface BrokerExecutionResult {
  clientOrderId: string;
  status: BrokerOrderStatus;
  positionId?: string;
  filledVolume?: number;
  price?: number;
  message?: string;
}

export interface BrokerPosition {
  positionId: string;
  symbol: string;
  direction: BrokerDirection;
  volume: number;
  openPrice: number;
  clientOrderId: string;
  magicNumber?: string;
  status: BrokerPositionStatus;
  stopLoss?: number | null;
  takeProfit?: number | null;
  createdAt: string;
}

export interface BrokerQuote {
  symbol: string;
  bid: number;
  ask: number;
  valid: boolean;
  asOf: string;
}

export interface BrokerAccountSnapshot {
  accountId: string;
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  asOf: string;
}

export interface BrokerCancelResult {
  ok: boolean;
  clientOrderId: string;
  reason?: string;
}
