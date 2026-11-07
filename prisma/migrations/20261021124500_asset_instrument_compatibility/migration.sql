CREATE TYPE "InstrumentType" AS ENUM (
    'UNKNOWN',
    'SPOT',
    'CFD',
    'FUTURE',
    'OPTION',
    'STOCK',
    'ETF',
    'CRYPTO_SPOT'
);

CREATE TYPE "ContractSizeConversionMode" AS ENUM (
    'EXACT_ONLY',
    'CONTRACT_SIZE_RATIO'
);

ALTER TABLE "MasterAssetMapping"
ADD COLUMN "instrumentType" "InstrumentType" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "BrokerAssetMapping"
ADD COLUMN "instrumentType" "InstrumentType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "conversionMode" "ContractSizeConversionMode" NOT NULL DEFAULT 'EXACT_ONLY';
