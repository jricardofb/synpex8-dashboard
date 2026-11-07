export interface MarginCheckInput {
  freeMargin: number;
  requiredMargin: number;
  reservedMargin?: number;
}

export interface MarginGuardResult {
  allowed: boolean;
  reason?: string;
  usableMargin: number;
}

export interface MarginReservationInput {
  accountId: string;
  symbol: string;
  amount: number;
  reason: string;
  expiresAt?: Date;
}

export interface MarginReservation {
  accountId: string;
  symbol: string;
  amount: number;
  reason: string;
  expiresAt?: Date;
  createdAt: Date;
}

export function evaluateMargin({ freeMargin, requiredMargin, reservedMargin = 0 }: MarginCheckInput): MarginGuardResult {
  const usableMargin = Math.max(0, freeMargin - reservedMargin);
  const allowed = requiredMargin <= usableMargin;

  return {
    allowed,
    usableMargin,
    reason: allowed ? undefined : `insufficient free margin: required ${requiredMargin} exceeds usable ${usableMargin}`,
  };
}

export function reserveMargin({ accountId, symbol, amount, reason, expiresAt }: MarginReservationInput): MarginReservation {
  return {
    accountId,
    symbol,
    amount,
    reason,
    expiresAt,
    createdAt: new Date(),
  };
}
