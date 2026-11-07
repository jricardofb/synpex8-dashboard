-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('MOCK', 'MT5', 'XM');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PositionState" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN', 'PENDING');

-- CreateEnum
CREATE TYPE "BrokerOrderState" AS ENUM ('SUBMITTING', 'PENDING', 'FILLED', 'PARTIALLY_FILLED', 'UNKNOWN', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExecutionState" AS ENUM ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RobotMode" AS ENUM ('OFF', 'ON');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "broker" "BrokerType" NOT NULL,
    "accountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(18,8),
    "equity" DECIMAL(18,8),
    "freeMargin" DECIMAL(18,8),
    "usedMargin" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Robot" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configuredVolume" DECIMAL(18,8) NOT NULL,
    "marginAllocation" DECIMAL(18,8),
    "status" "RobotMode" NOT NULL DEFAULT 'OFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Robot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "brokerAccountId" TEXT NOT NULL,
    "robotId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "openPrice" DECIMAL(18,8),
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "state" "PositionState" NOT NULL DEFAULT 'OPEN',
    "clientOrderId" TEXT,
    "eventSeq" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerOrder" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "requestedVolume" DECIMAL(18,8) NOT NULL,
    "requiredMargin" DECIMAL(18,8) NOT NULL,
    "status" "BrokerOrderState" NOT NULL DEFAULT 'PENDING',
    "filledVolume" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "brokerPositionId" TEXT,
    "executionPrice" DECIMAL(18,8),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "eventSeq" INTEGER NOT NULL,
    "side" "OrderSide" NOT NULL,
    "observedVolume" DECIMAL(18,8) NOT NULL,
    "executedPrice" DECIMAL(18,8),
    "status" "ExecutionState" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginReservation" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarginReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_externalId_key" ON "Client"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAccount_clientId_accountNumber_key" ON "BrokerAccount"("clientId", "accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Robot_externalId_key" ON "Robot"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_externalId_key" ON "Position"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_clientOrderId_key" ON "Position"("clientOrderId");

-- CreateIndex
CREATE INDEX "BrokerOrder_status_createdAt_idx" ON "BrokerOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerOrder_brokerAccountId_clientOrderId_key" ON "BrokerOrder"("brokerAccountId", "clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_positionId_eventSeq_key" ON "Execution"("positionId", "eventSeq");

-- CreateIndex
CREATE UNIQUE INDEX "MarginReservation_brokerOrderId_key" ON "MarginReservation"("brokerOrderId");

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerOrder" ADD CONSTRAINT "BrokerOrder_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarginReservation" ADD CONSTRAINT "MarginReservation_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarginReservation" ADD CONSTRAINT "MarginReservation_brokerOrderId_fkey" FOREIGN KEY ("brokerOrderId") REFERENCES "BrokerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
