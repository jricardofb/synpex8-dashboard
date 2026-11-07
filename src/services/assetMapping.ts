import type { PrismaClient } from '@prisma/client';

export type InstrumentType =
  | 'UNKNOWN'
  | 'SPOT'
  | 'CFD'
  | 'FUTURE'
  | 'OPTION'
  | 'STOCK'
  | 'ETF'
  | 'CRYPTO_SPOT';
export type ContractSizeConversionMode = 'EXACT_ONLY' | 'CONTRACT_SIZE_RATIO';

export interface MasterAssetAlias {
  sourceSymbol: string;
  universalAssetCode: string;
  active?: boolean;
  instrumentType?: InstrumentType;
  contractSizeOverride?: number | null;
}

export interface BrokerAssetAlias {
  universalAssetCode: string;
  brokerSymbol: string;
  active?: boolean;
  instrumentType?: InstrumentType;
  contractSize: number;
  conversionMode?: ContractSizeConversionMode;
}

export interface ResolvedMasterAsset {
  sourceSymbol: string;
  universalAssetCode: string;
  instrumentType: Exclude<InstrumentType, 'UNKNOWN'>;
  masterContractSize: number;
}

export interface ResolvedBrokerAsset {
  brokerSymbol: string;
  instrumentType: Exclude<InstrumentType, 'UNKNOWN'>;
  contractSize: number;
  conversionMode: ContractSizeConversionMode;
}

export class UnknownMasterSymbolError extends Error {
  constructor(symbol: string) {
    super(`No active Master asset mapping exists for symbol ${symbol}`);
    this.name = 'UnknownMasterSymbolError';
  }
}

export class UnknownBrokerAssetError extends Error {
  constructor(assetCode: string) {
    super(`No active broker asset mapping exists for universal asset ${assetCode}`);
    this.name = 'UnknownBrokerAssetError';
  }
}

export class UnknownContractSizeError extends Error {
  constructor(context: string) {
    super(`A positive contract size is required for ${context}`);
    this.name = 'UnknownContractSizeError';
  }
}

export class UnknownInstrumentTypeError extends Error {
  constructor(context: string) {
    super(`A known instrument type is required for ${context}`);
    this.name = 'UnknownInstrumentTypeError';
  }
}

export class IncompatibleInstrumentTypeError extends Error {
  constructor(masterType: string, brokerType: string) {
    super(`Instrument type mismatch: Master uses ${masterType}, broker mapping uses ${brokerType}`);
    this.name = 'IncompatibleInstrumentTypeError';
  }
}

export class UnapprovedContractSizeConversionError extends Error {
  constructor(masterContractSize: number, brokerContractSize: number) {
    super(
      `Contract-size conversion from ${masterContractSize} to ${brokerContractSize} requires explicit approval`,
    );
    this.name = 'UnapprovedContractSizeConversionError';
  }
}

export function normalizeAssetSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function requirePositiveContractSize(value: number | null | undefined, context: string): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new UnknownContractSizeError(context);
  }
  return value;
}

function requireInstrumentType(
  value: InstrumentType | undefined,
  context: string,
): Exclude<InstrumentType, 'UNKNOWN'> {
  if (!value || value === 'UNKNOWN') throw new UnknownInstrumentTypeError(context);
  return value;
}

export function resolveMasterAsset(
  mappings: MasterAssetAlias[],
  sourceSymbol: string,
): ResolvedMasterAsset {
  const normalizedSourceSymbol = normalizeAssetSymbol(sourceSymbol);
  const mapping = mappings.find((candidate) =>
    candidate.active !== false && normalizeAssetSymbol(candidate.sourceSymbol) === normalizedSourceSymbol,
  );

  if (!mapping) throw new UnknownMasterSymbolError(sourceSymbol);

  return {
    sourceSymbol: mapping.sourceSymbol,
    universalAssetCode: mapping.universalAssetCode,
    instrumentType: requireInstrumentType(mapping.instrumentType, `Master symbol ${sourceSymbol}`),
    masterContractSize: requirePositiveContractSize(
      mapping.contractSizeOverride,
      `Master symbol ${sourceSymbol}`,
    ),
  };
}

export function resolveBrokerAsset(
  mappings: BrokerAssetAlias[],
  universalAssetCode: string,
): ResolvedBrokerAsset {
  const mapping = mappings.find((candidate) =>
    candidate.active !== false && candidate.universalAssetCode === universalAssetCode,
  );

  if (!mapping) throw new UnknownBrokerAssetError(universalAssetCode);

  return {
    brokerSymbol: mapping.brokerSymbol,
    instrumentType: requireInstrumentType(mapping.instrumentType, `broker symbol ${mapping.brokerSymbol}`),
    contractSize: requirePositiveContractSize(mapping.contractSize, `broker symbol ${mapping.brokerSymbol}`),
    conversionMode: mapping.conversionMode ?? 'EXACT_ONLY',
  };
}

export function assertAssetCompatibility(
  master: ResolvedMasterAsset,
  broker: ResolvedBrokerAsset,
): void {
  if (master.instrumentType !== broker.instrumentType) {
    throw new IncompatibleInstrumentTypeError(master.instrumentType, broker.instrumentType);
  }

  if (master.masterContractSize !== broker.contractSize && broker.conversionMode !== 'CONTRACT_SIZE_RATIO') {
    throw new UnapprovedContractSizeConversionError(master.masterContractSize, broker.contractSize);
  }
}

export function calculateClientVolume(
  masterLot: number,
  masterContractSize: number,
  clientContractSize: number,
): number {
  if (!Number.isFinite(masterLot) || masterLot <= 0) {
    throw new RangeError('Master lot must be a positive finite number');
  }

  const validMasterContractSize = requirePositiveContractSize(masterContractSize, 'Master asset');
  const validClientContractSize = requirePositiveContractSize(clientContractSize, 'client broker asset');
  const clientVolume = (masterLot * validMasterContractSize) / validClientContractSize;

  if (!Number.isFinite(clientVolume) || clientVolume <= 0) {
    throw new RangeError('Converted client volume must be a positive finite number');
  }

  return clientVolume;
}

export class PrismaAssetMappingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveForMaster(masterId: string, sourceSymbol: string): Promise<ResolvedMasterAsset> {
    const mapping = await this.prisma.masterAssetMapping.findUnique({
      where: {
        masterId_normalizedSourceSymbol: {
          masterId,
          normalizedSourceSymbol: normalizeAssetSymbol(sourceSymbol),
        },
      },
      include: { universalAsset: true },
    });

    if (!mapping || !mapping.active || !mapping.universalAsset.active) {
      throw new UnknownMasterSymbolError(sourceSymbol);
    }

    return resolveMasterAsset([{
      sourceSymbol: mapping.sourceSymbol,
      universalAssetCode: mapping.universalAsset.code,
      active: mapping.active,
      instrumentType: mapping.instrumentType,
      contractSizeOverride: mapping.masterContractSizeOverride?.toNumber(),
    }], sourceSymbol);
  }

  async resolveForBrokerAccount(brokerAccountId: string, universalAssetCode: string): Promise<ResolvedBrokerAsset> {
    const mapping = await this.prisma.brokerAssetMapping.findFirst({
      where: {
        brokerAccountId,
        active: true,
        brokerAccount: { is: { active: true } },
        universalAsset: { is: { code: universalAssetCode, active: true } },
      },
      select: { brokerSymbol: true, instrumentType: true, contractSize: true, conversionMode: true },
    });

    if (!mapping) throw new UnknownBrokerAssetError(universalAssetCode);

    return resolveBrokerAsset([{
      universalAssetCode,
      brokerSymbol: mapping.brokerSymbol,
      instrumentType: mapping.instrumentType,
      contractSize: mapping.contractSize.toNumber(),
      conversionMode: mapping.conversionMode,
    }], universalAssetCode);
  }
}