import type { BrokerAccountSnapshot, BrokerExecutionResult, BrokerOrderInput } from '../broker/types.js';
import type { BrokerAdapter } from '../broker/BrokerAdapter.js';
import { evaluateMargin, type MarginReservation } from './margin.js';
import {
  BrokerAccountNotFoundError,
  isKnownBrokerStatus,
  PersistedMarginUnavailableError,
  type OrderExecutionStore,
} from './orderExecutionStore.js';

export interface ExecuteOrderInput {
  broker: BrokerAdapter;
  store: OrderExecutionStore;
  brokerAccountId: string;
  accountSnapshot: BrokerAccountSnapshot;
  order: BrokerOrderInput;
  requiredMargin: number;
  reservedMargin?: number;
}

export interface ExecuteOrderResult {
  accepted: boolean;
  status: 'REJECTED' | 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'UNKNOWN' | 'CANCELLED';
  reason?: string;
  reservation?: MarginReservation;
  execution?: BrokerExecutionResult;
}

export async function executeOrder({
  broker,
  store,
  brokerAccountId,
  accountSnapshot,
  order,
  requiredMargin,
  reservedMargin = 0,
}: ExecuteOrderInput): Promise<ExecuteOrderResult> {
  const marginCheck = evaluateMargin({
    freeMargin: accountSnapshot.freeMargin,
    requiredMargin,
    reservedMargin,
  });

  if (!marginCheck.allowed) {
    return {
      accepted: false,
      status: 'REJECTED',
      reason: marginCheck.reason,
    };
  }

  let intent;
  try {
    intent = await store.createOrderIntent({ brokerAccountId, order, requiredMargin });
  } catch (error) {
    if (error instanceof PersistedMarginUnavailableError || error instanceof BrokerAccountNotFoundError) {
      return { accepted: false, status: 'REJECTED', reason: error.message };
    }
    throw error;
  }

  const reservation = intent.record.reservation;

  if (!intent.created) {
    if (intent.record.status === 'REJECTED') {
      return { accepted: false, status: 'REJECTED', reason: intent.record.message, reservation };
    }

    if (intent.record.status === 'UNKNOWN') {
      return {
        accepted: false,
        status: 'UNKNOWN',
        reason: `Order ${order.clientOrderId} is UNKNOWN; reconcile without resubmitting. ${intent.record.message ?? ''}`.trim(),
        reservation,
        execution: {
          clientOrderId: order.clientOrderId,
          status: 'UNKNOWN',
          positionId: intent.record.positionId,
          filledVolume: intent.record.filledVolume,
          price: intent.record.price,
          message: intent.record.message,
        },
      };
    }

    if (isKnownBrokerStatus(intent.record.status)) {
      const execution: BrokerExecutionResult = {
        clientOrderId: order.clientOrderId,
        status: intent.record.status,
        positionId: intent.record.positionId,
        filledVolume: intent.record.filledVolume,
        price: intent.record.price,
        message: intent.record.message,
      };
      const accepted = execution.status === 'PENDING' || execution.status === 'FILLED' || execution.status === 'PARTIALLY_FILLED';

      return {
        accepted,
        status: execution.status,
        reason: accepted ? undefined : execution.message,
        reservation,
        execution,
      };
    }

    return {
      accepted: false,
      status: 'UNKNOWN',
      reason: `Order ${order.clientOrderId} already exists in ${intent.record.status}; reconcile without resubmitting`,
      reservation,
    };
  }

  let execution: BrokerExecutionResult;
  try {
    execution = await broker.placeOrder(order);
  } catch (error) {
    execution = {
      clientOrderId: order.clientOrderId,
      status: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'Broker submission outcome is unknown',
    };
  }

  await store.updateExecution(intent.record.id, execution);

  const acceptedStatus = execution.status === 'PENDING' || execution.status === 'FILLED' || execution.status === 'PARTIALLY_FILLED';

  return {
    accepted: acceptedStatus,
    status: execution.status,
    reservation,
    execution,
    reason: acceptedStatus ? undefined : execution.message,
  };
}
