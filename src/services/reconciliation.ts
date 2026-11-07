export interface ReconcileUnknownPositionInput {
  clientOrderId: string;
  brokerKnown: boolean;
  localPositionExists: boolean;
  graceMs: number;
}

export interface ReconcileUnknownPositionResult {
  action: 'WAIT' | 'RECONCILE' | 'DROP';
  reason: string;
}

export interface ReplayEvent {
  type: 'CLOSE' | 'MODIFY' | 'PARTIAL_CLOSE';
  seq: number;
  payload: Record<string, unknown>;
}

export function reconcileUnknownPosition({
  clientOrderId,
  brokerKnown,
  localPositionExists,
  graceMs,
}: ReconcileUnknownPositionInput): ReconcileUnknownPositionResult {
  if (brokerKnown && localPositionExists) {
    return {
      action: 'RECONCILE',
      reason: `Reconcile order ${clientOrderId} after broker confirmation`,
    };
  }

  if (graceMs <= 0) {
    return {
      action: 'DROP',
      reason: `Grace expired for ${clientOrderId}; drop stale UNKNOWN state`,
    };
  }

  if (!brokerKnown && !localPositionExists) {
    return {
      action: 'WAIT',
      reason: `UNKNOWN order ${clientOrderId} has no broker confirmation yet; do not re-send`,
    };
  }

  return {
    action: 'WAIT',
    reason: `UNKNOWN order ${clientOrderId} still inside grace window`,
  };
}

export function applyEventReplay(input: ReplayEvent[] | { events: ReplayEvent[] }): ReplayEvent[] {
  const events = Array.isArray(input) ? input : input.events;
  const order = ['CLOSE', 'MODIFY', 'PARTIAL_CLOSE'];
  return [...events].sort((a, b) => {
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    return ai - bi || a.seq - b.seq;
  });
}
