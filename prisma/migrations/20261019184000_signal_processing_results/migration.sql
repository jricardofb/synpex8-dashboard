CREATE TYPE "SignalProcessingStatus" AS ENUM ('DRY_RUN_COMPLETED', 'NO_ROUTE', 'BLOCKED', 'UNSUPPORTED');

CREATE TABLE "SignalProcessingResult" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "status" "SignalProcessingStatus" NOT NULL,
    "result" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalProcessingResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignalProcessingResult_signalId_key" ON "SignalProcessingResult"("signalId");

ALTER TABLE "SignalProcessingResult"
ADD CONSTRAINT "SignalProcessingResult_signalId_fkey"
FOREIGN KEY ("signalId") REFERENCES "MasterSignal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
