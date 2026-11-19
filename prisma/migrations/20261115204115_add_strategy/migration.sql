-- DropIndex
DROP INDEX "Strategy_name_key";

-- AlterTable
ALTER TABLE "Strategy" ALTER COLUMN "riskPercent" SET DATA TYPE DECIMAL(65,30);

-- CreateIndex
CREATE INDEX "MasterSignal_strategyId_idx" ON "MasterSignal"("strategyId");
