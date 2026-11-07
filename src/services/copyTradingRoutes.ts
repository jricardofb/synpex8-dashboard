import type { PrismaClient } from '@prisma/client';
import {
  assertAssetCompatibility,
  IncompatibleInstrumentTypeError,
  resolveBrokerAsset,
  resolveMasterAsset,
  UnknownBrokerAssetError,
  UnknownContractSizeError,
  UnknownInstrumentTypeError,
  UnknownMasterSymbolError,
  UnapprovedContractSizeConversionError,
  type BrokerAssetAlias,
  type MasterAssetAlias,
} from './assetMapping.js';

export interface SignalOrigin {
  masterId: string;
  sourceRobotId: string;
  strategyId: string;
}

export interface CopyTradingRouteAssetValidation {
  compatibleAssetCount: number;
  issues: string[];
}

export class IncompatibleCopyTradingRouteAssetsError extends Error {
  constructor(issues: string[]) {
    super(`Copy trading route has incompatible assets: ${issues.join('; ')}`);
    this.name = 'IncompatibleCopyTradingRouteAssetsError';
  }
}

export function validateCopyTradingRouteAssets(
  masterMappings: MasterAssetAlias[],
  brokerMappings: BrokerAssetAlias[],
): CopyTradingRouteAssetValidation {
  const issues: string[] = [];
  let compatibleAssetCount = 0;
  const activeMasterMappings = masterMappings.filter((mapping) => mapping.active !== false);

  if (activeMasterMappings.length === 0) {
    issues.push('No active Master asset mappings are configured');
  }

  for (const masterMapping of activeMasterMappings) {
    try {
      const masterAsset = resolveMasterAsset([masterMapping], masterMapping.sourceSymbol);
      const brokerAsset = resolveBrokerAsset(brokerMappings, masterAsset.universalAssetCode);
      assertAssetCompatibility(masterAsset, brokerAsset);
      compatibleAssetCount += 1;
    } catch (error) {
      if (
        !(error instanceof UnknownMasterSymbolError)
        && !(error instanceof UnknownBrokerAssetError)
        && !(error instanceof UnknownContractSizeError)
        && !(error instanceof UnknownInstrumentTypeError)
        && !(error instanceof IncompatibleInstrumentTypeError)
        && !(error instanceof UnapprovedContractSizeConversionError)
      ) {
        throw error;
      }
      issues.push(`${masterMapping.sourceSymbol}: ${error.message}`);
    }
  }

  return { compatibleAssetCount, issues };
}

export function assertCopyTradingRouteAssetsCompatible(
  validation: CopyTradingRouteAssetValidation,
): void {
  if (validation.issues.length > 0 || validation.compatibleAssetCount === 0) {
    const issues = validation.issues.length > 0
      ? validation.issues
      : ['No compatible active Master assets are configured'];
    throw new IncompatibleCopyTradingRouteAssetsError(issues);
  }
}

export class PrismaCopyTradingRouteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async validateRouteAssets(masterId: string, brokerAccountId: string): Promise<CopyTradingRouteAssetValidation> {
    const [masterMappings, brokerMappings] = await Promise.all([
      this.prisma.masterAssetMapping.findMany({
        where: {
          masterId,
          active: true,
          universalAsset: { is: { active: true } },
        },
        select: {
          sourceSymbol: true,
          universalAsset: { select: { code: true } },
          instrumentType: true,
          masterContractSizeOverride: true,
        },
      }),
      this.prisma.brokerAssetMapping.findMany({
        where: {
          brokerAccountId,
          active: true,
          brokerAccount: { is: { active: true } },
          universalAsset: { is: { active: true } },
        },
        select: {
          universalAsset: { select: { code: true } },
          brokerSymbol: true,
          instrumentType: true,
          contractSize: true,
          conversionMode: true,
        },
      }),
    ]);

    return validateCopyTradingRouteAssets(
      masterMappings.map((mapping) => ({
        sourceSymbol: mapping.sourceSymbol,
        universalAssetCode: mapping.universalAsset.code,
        instrumentType: mapping.instrumentType,
        contractSizeOverride: mapping.masterContractSizeOverride?.toNumber(),
      })),
      brokerMappings.map((mapping) => ({
        universalAssetCode: mapping.universalAsset.code,
        brokerSymbol: mapping.brokerSymbol,
        instrumentType: mapping.instrumentType,
        contractSize: mapping.contractSize.toNumber(),
        conversionMode: mapping.conversionMode,
      })),
    );
  }

  async findEligibleRoutes(origin: SignalOrigin) {
    return this.prisma.copyTradingRoute.findMany({
      where: {
        ...origin,
        active: true,
        master: { is: { active: true } },
        brokerAccount: { is: { active: true } },
        robot: { is: { status: 'ON' } },
      },
      include: {
        brokerAccount: true,
        robot: true,
      },
      orderBy: { id: 'asc' },
    });
  }
}
