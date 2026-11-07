-- CreateEnum
CREATE TYPE "SignalEventType" AS ENUM ('OPEN', 'MODIFY', 'PARTIAL_CLOSE', 'CLOSE');

-- CreateEnum
CREATE TYPE "SignalOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Master" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterSignal" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "masterAccountId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "magicNumber" TEXT NOT NULL,
    "masterTicketId" TEXT NOT NULL,
    "eventType" "SignalEventType" NOT NULL,
    "eventSeq" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalOutbox" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "status" "SignalOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Master_externalId_key" ON "Master"("externalId");

-- CreateIndex
CREATE INDEX "MasterSignal_masterId_receivedAt_idx" ON "MasterSignal"("masterId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasterSignal_masterId_masterTicketId_eventSeq_key" ON "MasterSignal"("masterId", "masterTicketId", "eventSeq");

-- CreateIndex
CREATE UNIQUE INDEX "SignalOutbox_signalId_key" ON "SignalOutbox"("signalId");

-- CreateIndex
CREATE INDEX "SignalOutbox_status_availableAt_idx" ON "SignalOutbox"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "MasterSignal" ADD CONSTRAINT "MasterSignal_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOutbox" ADD CONSTRAINT "SignalOutbox_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "MasterSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
