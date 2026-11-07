import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  assertCopyTradingRouteAssetsCompatible,
  IncompatibleCopyTradingRouteAssetsError,
  PrismaCopyTradingRouteRepository,
  validateCopyTradingRouteAssets,
} from '../src/services/copyTradingRoutes.js';

describe('copy trading routes', () => {
  it('rejects route activation when any active Master asset is incompatible', () => {
    const validation = validateCopyTradingRouteAssets([
      {
        sourceSymbol: 'XAUUSD',
        universalAssetCode: 'GOLD_SPOT_CFD',
        instrumentType: 'CFD',
        contractSizeOverride: 100,
      },
      {
        sourceSymbol: 'GOLD-MICRO',
        universalAssetCode: 'GOLD_MICRO_FUTURE',
        instrumentType: 'FUTURE',
        contractSizeOverride: 1,
      },
    ], [
      {
        universalAssetCode: 'GOLD_SPOT_CFD',
        brokerSymbol: 'XAUUSD.s',
        instrumentType: 'CFD',
        contractSize: 100,
      },
    ]);

    expect(validation.compatibleAssetCount).toBe(1);
    expect(validation.issues).toEqual([
      'GOLD-MICRO: No active broker asset mapping exists for universal asset GOLD_MICRO_FUTURE',
    ]);
    expect(() => assertCopyTradingRouteAssetsCompatible(validation))
      .toThrow(IncompatibleCopyTradingRouteAssetsError);
  });

  it('allows route activation only when every active Master asset is mapped compatibly', () => {
    const validation = validateCopyTradingRouteAssets([
      {
        sourceSymbol: 'XAUUSD',
        universalAssetCode: 'GOLD_SPOT_CFD',
        instrumentType: 'CFD',
        contractSizeOverride: 100,
      },
      {
        sourceSymbol: 'GOLD-MICRO',
        universalAssetCode: 'GOLD_MICRO_FUTURE',
        instrumentType: 'FUTURE',
        contractSizeOverride: 1,
      },
      {
        sourceSymbol: 'DISABLED',
        universalAssetCode: 'DISABLED',
        instrumentType: 'CFD',
        contractSizeOverride: 1,
        active: false,
      },
    ], [
      {
        universalAssetCode: 'GOLD_SPOT_CFD',
        brokerSymbol: 'XAUUSD.s',
        instrumentType: 'CFD',
        contractSize: 100,
      },
      {
        universalAssetCode: 'GOLD_MICRO_FUTURE',
        brokerSymbol: 'GOLD-MICRO',
        instrumentType: 'FUTURE',
        contractSize: 1,
      },
    ]);

    expect(validation).toEqual({ compatibleAssetCount: 2, issues: [] });
    expect(() => assertCopyTradingRouteAssetsCompatible(validation)).not.toThrow();
  });

  it('requires explicit conversion approval for differing contract sizes', () => {
    const validation = validateCopyTradingRouteAssets([
      {
        sourceSymbol: 'XAUUSD',
        universalAssetCode: 'GOLD_SPOT_CFD',
        instrumentType: 'CFD',
        contractSizeOverride: 100,
      },
    ], [
      {
        universalAssetCode: 'GOLD_SPOT_CFD',
        brokerSymbol: 'XAUUSD.s',
        instrumentType: 'CFD',
        contractSize: 1,
      },
    ]);

    expect(validation.issues[0]).toContain('requires explicit approval');
    expect(() => assertCopyTradingRouteAssetsCompatible(validation))
      .toThrow(IncompatibleCopyTradingRouteAssetsError);
  });

  it('blocks a route when the Master and broker classify the same universal asset differently', () => {
    const validation = validateCopyTradingRouteAssets([
      {
        sourceSymbol: 'XAUUSD',
        universalAssetCode: 'GOLD_SPOT_CFD',
        instrumentType: 'CFD',
        contractSizeOverride: 100,
      },
    ], [
      {
        universalAssetCode: 'GOLD_SPOT_CFD',
        brokerSymbol: 'GOLD-MICRO',
        instrumentType: 'FUTURE',
        contractSize: 1,
        conversionMode: 'CONTRACT_SIZE_RATIO',
      },
    ]);

    expect(validation.issues[0]).toContain('Instrument type mismatch: Master uses CFD, broker mapping uses FUTURE');
    expect(() => assertCopyTradingRouteAssetsCompatible(validation))
      .toThrow(IncompatibleCopyTradingRouteAssetsError);
  });

  it('blocks route activation when there are no active Master asset mappings', () => {
    const validation = validateCopyTradingRouteAssets([], []);

    expect(validation).toEqual({
      compatibleAssetCount: 0,
      issues: ['No active Master asset mappings are configured'],
    });
    expect(() => assertCopyTradingRouteAssetsCompatible(validation))
      .toThrow(IncompatibleCopyTradingRouteAssetsError);
  });

  it('loads the active mappings scoped to the source Master and destination account', async () => {
    const masterAssetFindMany = vi.fn().mockResolvedValue([{
      sourceSymbol: 'XAUUSD',
      universalAsset: { code: 'GOLD_SPOT_CFD' },
      instrumentType: 'CFD',
      masterContractSizeOverride: { toNumber: () => 100 },
    }]);
    const brokerAssetFindMany = vi.fn().mockResolvedValue([{
      universalAsset: { code: 'GOLD_SPOT_CFD' },
      brokerSymbol: 'XAUUSD.s',
      instrumentType: 'CFD',
      contractSize: { toNumber: () => 100 },
      conversionMode: 'EXACT_ONLY',
    }]);
    const repository = new PrismaCopyTradingRouteRepository({
      masterAssetMapping: { findMany: masterAssetFindMany },
      brokerAssetMapping: { findMany: brokerAssetFindMany },
    } as unknown as PrismaClient);

    await expect(repository.validateRouteAssets('master-1', 'account-1')).resolves.toEqual({
      compatibleAssetCount: 1,
      issues: [],
    });
    expect(masterAssetFindMany).toHaveBeenCalledWith({
      where: {
        masterId: 'master-1',
        active: true,
        universalAsset: { is: { active: true } },
      },
      select: {
        sourceSymbol: true,
        universalAsset: { select: { code: true } },
        instrumentType: true,
        masterContractSizeOverride: true,
      },
    });
    expect(brokerAssetFindMany).toHaveBeenCalledWith({
      where: {
        brokerAccountId: 'account-1',
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
    });
  });

  it('queries only active, authorized destinations for the exact signal origin', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaCopyTradingRouteRepository({
      copyTradingRoute: { findMany },
    } as unknown as PrismaClient);

    const origin = {
      masterId: 'master-db-1',
      sourceRobotId: 'MASTER-ROBOT-1',
      strategyId: 'STRATEGY-1',
    };
    await repository.findEligibleRoutes(origin);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        ...origin,
        active: true,
        master: { is: { active: true } },
        brokerAccount: { is: { active: true } },
        robot: { is: { status: 'ON' } },
      },
      include: { brokerAccount: true, robot: true },
      orderBy: { id: 'asc' },
    });
  });
});
