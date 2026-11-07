import { describe, expect, it } from 'vitest';
import {
  assertAssetCompatibility,
  calculateClientVolume,
  IncompatibleInstrumentTypeError,
  resolveBrokerAsset,
  resolveMasterAsset,
  UnknownBrokerAssetError,
  UnknownContractSizeError,
  UnknownInstrumentTypeError,
  UnknownMasterSymbolError,
  UnapprovedContractSizeConversionError,
} from '../src/services/assetMapping.js';

describe('universal asset mapping', () => {
  const masterMappings = [
    { sourceSymbol: 'GOLD', universalAssetCode: 'GOLD_SPOT_CFD', instrumentType: 'CFD' as const, contractSizeOverride: 100 },
    { sourceSymbol: 'XAUUSD.a', universalAssetCode: 'GOLD_SPOT_CFD', instrumentType: 'CFD' as const, contractSizeOverride: 100 },
  ];
  const brokerMappings = [
    {
      universalAssetCode: 'GOLD_SPOT_CFD',
      brokerSymbol: 'XAUUSDm',
      instrumentType: 'CFD' as const,
      contractSize: 100,
    },
  ];

  it('maps different Master and broker symbols through the same canonical asset', () => {
    const master = resolveMasterAsset(masterMappings, ' gold ');
    const broker = resolveBrokerAsset(brokerMappings, master.universalAssetCode);

    expect(master.universalAssetCode).toBe('GOLD_SPOT_CFD');
    expect(broker.brokerSymbol).toBe('XAUUSDm');
    expect(() => assertAssetCompatibility(master, broker)).not.toThrow();
    expect(calculateClientVolume(0.1, master.masterContractSize, broker.contractSize)).toBe(0.1);
  });

  it('converts exposure when broker contract sizes differ', () => {
    expect(calculateClientVolume(0.1, 100, 1)).toBe(10);
  });

  it('does not infer aliases by stripping broker suffixes', () => {
    expect(() => resolveMasterAsset(masterMappings, 'XAUUSDm')).toThrow(UnknownMasterSymbolError);
    expect(() => resolveBrokerAsset([], 'GOLD_SPOT_CFD')).toThrow(UnknownBrokerAssetError);
  });

  it('requires a known instrument type and a configured contract size', () => {
    expect(() => resolveMasterAsset(masterMappings, 'GOLD')).not.toThrow();
    expect(() => resolveMasterAsset([{
      sourceSymbol: 'GOLD',
      universalAssetCode: 'GOLD_SPOT_CFD',
      instrumentType: 'UNKNOWN',
      contractSizeOverride: 100,
    }], 'GOLD')).toThrow(UnknownInstrumentTypeError);
    expect(() => resolveMasterAsset([{
      sourceSymbol: 'GOLD',
      universalAssetCode: 'GOLD_SPOT_CFD',
      instrumentType: 'CFD',
    }], 'GOLD'))
      .toThrow(UnknownContractSizeError);
  });

  it('blocks different instrument types even when the universal code matches', () => {
    const master = resolveMasterAsset(masterMappings, 'GOLD');
    const future = resolveBrokerAsset([{
      universalAssetCode: 'GOLD_SPOT_CFD',
      brokerSymbol: 'GOLD-MICRO',
      instrumentType: 'FUTURE',
      contractSize: 1,
      conversionMode: 'CONTRACT_SIZE_RATIO',
    }], 'GOLD_SPOT_CFD');

    expect(() => assertAssetCompatibility(master, future)).toThrow(IncompatibleInstrumentTypeError);
  });

  it('requires explicit approval before converting different contract sizes', () => {
    const master = resolveMasterAsset(masterMappings, 'GOLD');
    const exactOnly = resolveBrokerAsset([{
      universalAssetCode: 'GOLD_SPOT_CFD',
      brokerSymbol: 'XAUUSDm',
      instrumentType: 'CFD',
      contractSize: 1,
      conversionMode: 'EXACT_ONLY',
    }], 'GOLD_SPOT_CFD');
    const approvedRatio = resolveBrokerAsset([{
      universalAssetCode: 'GOLD_SPOT_CFD',
      brokerSymbol: 'XAUUSDm',
      instrumentType: 'CFD',
      contractSize: 1,
      conversionMode: 'CONTRACT_SIZE_RATIO',
    }], 'GOLD_SPOT_CFD');

    expect(() => assertAssetCompatibility(master, exactOnly)).toThrow(UnapprovedContractSizeConversionError);
    expect(() => assertAssetCompatibility(master, approvedRatio)).not.toThrow();
    expect(calculateClientVolume(0.1, master.masterContractSize, approvedRatio.contractSize)).toBe(10);
  });
});