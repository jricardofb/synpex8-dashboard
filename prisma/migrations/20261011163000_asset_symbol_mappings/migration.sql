-- CreateTable
CREATE TABLE "UniversalAsset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterAssetMapping" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "sourceSymbol" TEXT NOT NULL,
    "normalizedSourceSymbol" TEXT NOT NULL,
    "universalAssetId" TEXT NOT NULL,
    "masterContractSizeOverride" DECIMAL(18,8),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterAssetMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAssetMapping" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "universalAssetId" TEXT NOT NULL,
    "brokerSymbol" TEXT NOT NULL,
    "normalizedBrokerSymbol" TEXT NOT NULL,
    "contractSize" DECIMAL(18,8) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAssetMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniversalAsset_code_key" ON "UniversalAsset"("code");

-- CreateIndex
CREATE INDEX "MasterAssetMapping_universalAssetId_idx" ON "MasterAssetMapping"("universalAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAssetMapping_masterId_normalizedSourceSymbol_key" ON "MasterAssetMapping"("masterId", "normalizedSourceSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAssetMapping_brokerAccountId_universalAssetId_key" ON "BrokerAssetMapping"("brokerAccountId", "universalAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAssetMapping_brokerAccountId_normalizedBrokerSymbol_key" ON "BrokerAssetMapping"("brokerAccountId", "normalizedBrokerSymbol");

-- AddForeignKey
ALTER TABLE "MasterAssetMapping" ADD CONSTRAINT "MasterAssetMapping_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterAssetMapping" ADD CONSTRAINT "MasterAssetMapping_universalAssetId_fkey" FOREIGN KEY ("universalAssetId") REFERENCES "UniversalAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAssetMapping" ADD CONSTRAINT "BrokerAssetMapping_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAssetMapping" ADD CONSTRAINT "BrokerAssetMapping_universalAssetId_fkey" FOREIGN KEY ("universalAssetId") REFERENCES "UniversalAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
