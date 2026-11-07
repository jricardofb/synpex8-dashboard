import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { masterSignalSchema } from '../signals/masterSignal.js';
import {
  assertAssetCompatibility,
  calculateClientVolume,
  IncompatibleInstrumentTypeError,
  PrismaAssetMappingRepository,
  UnknownBrokerAssetError,
  UnknownContractSizeError,
  UnknownInstrumentTypeError,
  UnknownMasterSymbolError,
  UnapprovedContractSizeConversionError,
} from './assetMapping.js';
import { PrismaCopyTradingRouteRepository } from './copyTradingRoutes.js';

interface StoredSignal {
  id: string;
  masterId: string;
  robotId: string;
  strategyId: string;
  payload: Prisma.JsonValue;
}

interface DryRunDestination {
  routeId: string;
  clientId: string;
  brokerAccountId: string;
  broker: string;
  robotId: string;
  status: 'MAPPED' | 'BLOCKED';
  sourceSymbol?: string;
  brokerSymbol?: string;
  direction?: 'BUY' | 'SELL';
  plannedVolume?: number;
  reason?: string;
}

const signalDryRunSchema = z.object({
  mode: z.literal('DRY_RUN'),
  status: z.enum(['DRY_RUN_COMPLETED', 'NO_ROUTE', 'BLOCKED', 'UNSUPPORTED']),
  eventType: z.string(),
  destinationCount: z.number().int().nonnegative(),
  destinations: z.array(z.object({
    routeId: z.string(),
    clientId: z.string(),
    brokerAccountId: z.string(),
    broker: z.string(),
    robotId: z.string(),
    status: z.enum(['MAPPED', 'BLOCKED']),
    sourceSymbol: z.string().optional(),
    brokerSymbol: z.string().optional(),
    direction: z.enum(['BUY', 'SELL']).optional(),
    plannedVolume: z.number().positive().optional(),
    reason: z.string().optional(),
  })),
  reason: z.string().optional(),
});
type SignalDryRun = z.infer<typeof signalDryRunSchema>;

export interface SignalDryRunStore {
  findSignal(signalId: string): Promise<StoredSignal | null>;
  findResult(signalId: string): Promise<SignalDryRun | null>;
  findEligibleRoutes(origin: { masterId: string; sourceRobotId: string; strategyId: string }): Promise<Array<{
    id: string;
    clientId: string;
    brokerAccountId: string;
    brokerAccount: { broker: string };
    robot: { id: string };
  }>>;
  resolveMasterAsset(masterId: string, sourceSymbol: string): ReturnType<PrismaAssetMappingRepository['resolveForMaster']>;
  resolveBrokerAsset(brokerAccountId: string, universalAssetCode: string): ReturnType<PrismaAssetMappingRepository['resolveForBrokerAccount']>;
  saveResult(signalId: string, result: SignalDryRun): Promise<void>;
}

export class PrismaSignalDryRunStore implements SignalDryRunStore {
  private readonly routes: PrismaCopyTradingRouteRepository;
  private readonly assets: PrismaAssetMappingRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.routes = new PrismaCopyTradingRouteRepository(prisma);
    this.assets = new PrismaAssetMappingRepository(prisma);
  }

  findSignal(signalId: string): Promise<StoredSignal | null> {
    return this.prisma.masterSignal.findUnique({
      where: { id: signalId },
      select: { id: true, masterId: true, robotId: true, strategyId: true, payload: true },
    });
  }

  async findResult(signalId: string): Promise<SignalDryRun | null> {
    const result = await this.prisma.signalProcessingResult.findUnique({
      where: { signalId },
      select: { result: true },
    });
    return result ? signalDryRunSchema.parse(result.result) : null;
  }

  async findEligibleRoutes(origin: { masterId: string; sourceRobotId: string; strategyId: string }) {
    const routes = await this.routes.findEligibleRoutes(origin);
    return routes.map((route) => ({
      id: route.id,
      clientId: route.clientId,
      brokerAccountId: route.brokerAccountId,
      brokerAccount: { broker: route.brokerAccount.broker },
      robot: { id: route.robot.id },
    }));
  }

  resolveMasterAsset(masterId: string, sourceSymbol: string) {
    return this.assets.resolveForMaster(masterId, sourceSymbol);
  }

  resolveBrokerAsset(brokerAccountId: string, universalAssetCode: string) {
    return this.assets.resolveForBrokerAccount(brokerAccountId, universalAssetCode);
  }

  async saveResult(signalId: string, result: SignalDryRun): Promise<void> {
    await this.prisma.signalProcessingResult.createMany({
      data: [{
        signalId,
        status: result.status,
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
  }
}

function mappingFailure(error: unknown): string | undefined {
  if (
    error instanceof UnknownMasterSymbolError
    || error instanceof UnknownBrokerAssetError
    || error instanceof UnknownContractSizeError
    || error instanceof UnknownInstrumentTypeError
    || error instanceof IncompatibleInstrumentTypeError
    || error instanceof UnapprovedContractSizeConversionError
  ) {
    return error.message;
  }
  return undefined;
}

export class SignalDryRunProcessor {
  constructor(private readonly store: SignalDryRunStore) {}

  async process(signalId: string): Promise<SignalDryRun> {
    const existing = await this.store.findResult(signalId);
    if (existing) return existing;

    const storedSignal = await this.store.findSignal(signalId);
    if (!storedSignal) throw new Error(`Signal ${signalId} was not found`);

    const parsed = masterSignalSchema.safeParse(storedSignal.payload);
    if (!parsed.success) {
      return this.persist(signalId, {
        mode: 'DRY_RUN',
        status: 'BLOCKED',
        eventType: 'UNKNOWN',
        destinationCount: 0,
        destinations: [],
        reason: 'Persisted signal payload does not match the current signal contract',
      });
    }

    const signal = parsed.data;
    if (signal.eventType !== 'OPEN') {
      return this.persist(signalId, {
        mode: 'DRY_RUN',
        status: 'UNSUPPORTED',
        eventType: signal.eventType,
        destinationCount: 0,
        destinations: [],
        reason: 'The first dry-run processor currently evaluates OPEN events only',
      });
    }

    const routes = await this.store.findEligibleRoutes({
      masterId: storedSignal.masterId,
      sourceRobotId: storedSignal.robotId,
      strategyId: storedSignal.strategyId,
    });
    if (routes.length === 0) {
      return this.persist(signalId, {
        mode: 'DRY_RUN',
        status: 'NO_ROUTE',
        eventType: signal.eventType,
        destinationCount: 0,
        destinations: [],
        reason: 'No active route matches this Master, source robot, and strategy',
      });
    }

    const destinations: DryRunDestination[] = [];
    for (const route of routes) {
      try {
        const source = await this.store.resolveMasterAsset(storedSignal.masterId, signal.symbol);
        const target = await this.store.resolveBrokerAsset(route.brokerAccountId, source.universalAssetCode);
        assertAssetCompatibility(source, target);
        destinations.push({
          routeId: route.id,
          clientId: route.clientId,
          brokerAccountId: route.brokerAccountId,
          broker: route.brokerAccount.broker,
          robotId: route.robot.id,
          status: 'MAPPED',
          sourceSymbol: source.sourceSymbol,
          brokerSymbol: target.brokerSymbol,
          direction: signal.direction,
          plannedVolume: calculateClientVolume(
            signal.masterLot,
            source.masterContractSize,
            target.contractSize,
          ),
        });
      } catch (error) {
        const reason = mappingFailure(error);
        if (!reason) throw error;
        destinations.push({
          routeId: route.id,
          clientId: route.clientId,
          brokerAccountId: route.brokerAccountId,
          broker: route.brokerAccount.broker,
          robotId: route.robot.id,
          status: 'BLOCKED',
          reason,
        });
      }
    }

    return this.persist(signalId, {
      mode: 'DRY_RUN',
      status: destinations.some((destination) => destination.status === 'BLOCKED') ? 'BLOCKED' : 'DRY_RUN_COMPLETED',
      eventType: signal.eventType,
      destinationCount: destinations.length,
      destinations,
    });
  }

  private async persist(signalId: string, result: SignalDryRun): Promise<SignalDryRun> {
    await this.store.saveResult(signalId, result);
    return (await this.store.findResult(signalId)) ?? result;
  }
}
