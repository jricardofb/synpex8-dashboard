import { Prisma, type BrokerOrderState, type PrismaClient } from '@prisma/client';
import type { BrokerExecutionResult, BrokerOrderInput, BrokerOrderStatus } from '../broker/types.js';
import type { MarginReservation } from './margin.js';

export interface CreateOrderIntentInput {
  brokerAccountId: string;
  order: BrokerOrderInput;
  requiredMargin: number;
}

export interface OrderIntentRecord {
  id: string;
  status: BrokerOrderState;
  filledVolume: number;
  positionId?: string;
  price?: number;
  message?: string;
  reservation?: MarginReservation;
}

export interface CreateOrderIntentResult {
  created: boolean;
  record: OrderIntentRecord;
}

export interface OrderExecutionStore {
  createOrderIntent(input: CreateOrderIntentInput): Promise<CreateOrderIntentResult>;
  updateExecution(orderId: string, execution: BrokerExecutionResult): Promise<void>;
  releaseReservation(orderId: string): Promise<void>;
}

export class BrokerAccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Broker account ${accountId} was not found`);
    this.name = 'BrokerAccountNotFoundError';
  }
}

export class PersistedMarginUnavailableError extends Error {
  constructor(requiredMargin: number, usableMargin: number) {
    super(`insufficient persisted free margin: required ${requiredMargin} exceeds usable ${usableMargin}`);
    this.name = 'PersistedMarginUnavailableError';
  }
}

export class PrismaOrderExecutionStore implements OrderExecutionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createOrderIntent({ brokerAccountId, order, requiredMargin }: CreateOrderIntentInput): Promise<CreateOrderIntentResult> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.brokerOrder.findUnique({
        where: { brokerAccountId_clientOrderId: { brokerAccountId, clientOrderId: order.clientOrderId } },
        include: { reservation: true },
      });

      if (existing) {
        return { created: false, record: this.toRecord(existing) };
      }

      const account = await transaction.brokerAccount.findUnique({
        where: { id: brokerAccountId },
        select: { freeMargin: true },
      });

      if (!account) {
        throw new BrokerAccountNotFoundError(brokerAccountId);
      }

      const now = new Date();
      const reservations = await transaction.marginReservation.aggregate({
        where: {
          brokerAccountId,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        _sum: { amount: true },
      });
      const reservedAmount = Number(reservations._sum.amount ?? 0);
      const usableMargin = Math.max(0, Number(account.freeMargin ?? 0) - reservedAmount);
      const amount = Math.max(0, requiredMargin);

      if (amount > usableMargin) {
        throw new PersistedMarginUnavailableError(amount, usableMargin);
      }

      const created = await transaction.brokerOrder.create({
        data: {
          brokerAccountId,
          clientOrderId: order.clientOrderId,
          symbol: order.symbol,
          side: order.direction,
          requestedVolume: order.volume,
          requiredMargin: amount,
          status: 'SUBMITTING',
        },
      });

      await transaction.marginReservation.create({
        data: {
          brokerAccountId,
          brokerOrderId: created.id,
          symbol: order.symbol,
          amount,
          reason: 'new-order',
        },
      });

      const record = await transaction.brokerOrder.findUniqueOrThrow({
        where: { id: created.id },
        include: { reservation: true },
      });

      return { created: true, record: this.toRecord(record) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateExecution(orderId: string, execution: BrokerExecutionResult): Promise<void> {
    await this.prisma.brokerOrder.update({
      where: { id: orderId },
      data: {
        status: execution.status,
        filledVolume: execution.filledVolume ?? 0,
        brokerPositionId: execution.positionId,
        executionPrice: execution.price,
        error: execution.message,
      },
    });
  }

  async releaseReservation(orderId: string): Promise<void> {
    const releasedAt = new Date();
    await this.prisma.marginReservation.updateMany({
      where: { brokerOrderId: orderId, releasedAt: null },
      data: { releasedAt, expiresAt: releasedAt },
    });
  }

  private toRecord(record: {
    id: string;
    status: BrokerOrderState;
    filledVolume: { toNumber(): number };
    brokerPositionId: string | null;
    executionPrice: { toNumber(): number } | null;
    error: string | null;
    reservation: {
      brokerAccountId: string;
      symbol: string;
      amount: { toNumber(): number };
      reason: string;
      expiresAt: Date | null;
      createdAt: Date;
    } | null;
  }): OrderIntentRecord {
    return {
      id: record.id,
      status: record.status,
      filledVolume: record.filledVolume.toNumber(),
      positionId: record.brokerPositionId ?? undefined,
      price: record.executionPrice?.toNumber(),
      message: record.error ?? undefined,
      reservation: record.reservation
        ? {
            accountId: record.reservation.brokerAccountId,
            symbol: record.reservation.symbol,
            amount: record.reservation.amount.toNumber(),
            reason: record.reservation.reason,
            expiresAt: record.reservation.expiresAt ?? undefined,
            createdAt: record.reservation.createdAt,
          }
        : undefined,
    };
  }
}

export function isKnownBrokerStatus(status: BrokerOrderState): status is BrokerOrderStatus {
  return status !== 'SUBMITTING' && status !== 'REJECTED';
}