import { z } from 'zod';

export const masterSignalSchema = z.object({
  masterAccountId: z.string().trim().min(1).max(128),
  robotId: z.string().trim().min(1).max(128),
  strategyId: z.string().trim().min(1).max(128),
  magicNumber: z.union([z.string().trim().min(1).max(64), z.number().int().nonnegative()]).transform(String),
  masterTicketId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]).transform(String),
  eventType: z.enum(['OPEN', 'MODIFY', 'PARTIAL_CLOSE', 'CLOSE']).default('OPEN'),
  eventSeq: z.number().int().min(1),
  symbol: z.string().trim().min(1).max(64),
  direction: z.enum(['BUY', 'SELL']),
  masterLot: z.number().finite().positive(),
  masterBalance: z.number().finite().positive().optional(),
  masterPrice: z.number().finite().positive().optional(),
  contractSize: z.number().finite().positive().optional(),
  stopLoss: z.number().finite().min(0).nullable().optional(),
  takeProfit: z.number().finite().min(0).nullable().optional(),
}).strict().superRefine((signal, context) => {
  if (signal.eventType === 'OPEN' && signal.eventSeq !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['eventSeq'],
      message: 'OPEN eventSeq must be 1',
    });
  }

  if (signal.eventType === 'OPEN' && signal.masterPrice === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['masterPrice'],
      message: 'masterPrice is required for OPEN events',
    });
  }

  if (signal.eventType === 'MODIFY' && signal.stopLoss == null && signal.takeProfit == null) {
    context.addIssue({
      code: 'custom',
      path: ['stopLoss'],
      message: 'MODIFY requires stopLoss or takeProfit',
    });
  }
});

export type MasterSignal = z.infer<typeof masterSignalSchema>;