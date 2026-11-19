-- CreateEnum
CREATE TYPE "StrategyMode" AS ENUM ('DRY_RUN', 'LIVE');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" "StrategyMode" NOT NULL DEFAULT 'DRY_RUN',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "symbols" TEXT[],
    "riskPercent" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "maxPositions" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_name_key" ON "Strategy"("name");
