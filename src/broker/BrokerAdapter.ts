import type {
  BrokerAccountSnapshot,
  BrokerCancelResult,
  BrokerExecutionResult,
  BrokerOrderInput,
  BrokerPosition,
  BrokerQuote,
} from './types.js';

export abstract class BrokerAdapter {
  protected readonly brokerName: string;
  protected readonly accountId: string;

  constructor(brokerName: string, accountId: string) {
    this.brokerName = brokerName;
    this.accountId = accountId;
  }

  abstract getAccountSnapshot(): BrokerAccountSnapshot;

  abstract listPositions(): BrokerPosition[];

  abstract getQuote(symbol: string): Promise<BrokerQuote>;

  abstract placeOrder(input: BrokerOrderInput): Promise<BrokerExecutionResult>;

  abstract modifyOrder(input: BrokerOrderInput): Promise<BrokerExecutionResult>;

  abstract cancelOrder(clientOrderId: string): BrokerCancelResult;

  abstract closePosition(positionId: string, volume?: number): Promise<BrokerExecutionResult>;
}
