import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { MasterSignal } from './masterSignal.js';

export interface MasterCredentials {
  id: string;
  active: boolean;
  encryptedSecret: string;
}

export interface MasterSignalStore {
  findMaster(externalId: string): Promise<MasterCredentials | null>;
  persistSignal(masterId: string, signal: MasterSignal): Promise<'CREATED' | 'DUPLICATE' | 'CONFLICT'>;
}

export function hashMasterSignal(signal: MasterSignal): string {
  return createHash('sha256').update(JSON.stringify(signal)).digest('hex');
}

export class PrismaMasterSignalStore implements MasterSignalStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findMaster(externalId: string): Promise<MasterCredentials | null> {
    return this.prisma.master.findUnique({
      where: { externalId },
      select: { id: true, active: true, encryptedSecret: true },
    });
  }

  async persistSignal(masterId: string, signal: MasterSignal): Promise<'CREATED' | 'DUPLICATE' | 'CONFLICT'> {
    const payloadHash = hashMasterSignal(signal);
    const uniqueWhere = {
      masterId_masterTicketId_eventSeq: {
        masterId,
        masterTicketId: signal.masterTicketId,
        eventSeq: signal.eventSeq,
      },
    };

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.masterSignal.findUnique({ where: uniqueWhere });
        if (existing) return existing.payloadHash === payloadHash ? 'DUPLICATE' : 'CONFLICT';

        const storedSignal = await transaction.masterSignal.create({
          data: {
            masterId,
            masterAccountId: signal.masterAccountId,
            robotId: signal.robotId,
            strategyId: signal.strategyId,
            magicNumber: signal.magicNumber,
            masterTicketId: signal.masterTicketId,
            eventType: signal.eventType,
            eventSeq: signal.eventSeq,
            payload: JSON.parse(JSON.stringify(signal)) as Prisma.InputJsonValue,
            payloadHash,
          },
          select: { id: true },
        });

        await transaction.signalOutbox.create({ data: { signalId: storedSignal.id } });
        return 'CREATED';
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;

      const existing = await this.prisma.masterSignal.findUnique({ where: uniqueWhere });
      if (!existing) throw error;
      return existing.payloadHash === payloadHash ? 'DUPLICATE' : 'CONFLICT';
    }
  }
}