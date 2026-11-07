ALTER TABLE "Robot" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "BrokerAccount_clientId_id_key" ON "BrokerAccount"("clientId", "id");
CREATE UNIQUE INDEX "Robot_clientId_id_key" ON "Robot"("clientId", "id");
CREATE INDEX "Robot_clientId_idx" ON "Robot"("clientId");

ALTER TABLE "Robot"
ADD CONSTRAINT "Robot_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CopyTradingRoute" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "sourceRobotId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyTradingRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CopyTradingRoute_origin_destination_key"
ON "CopyTradingRoute"("masterId", "sourceRobotId", "strategyId", "brokerAccountId");

CREATE INDEX "CopyTradingRoute_origin_active_idx"
ON "CopyTradingRoute"("masterId", "sourceRobotId", "strategyId", "active");

ALTER TABLE "CopyTradingRoute"
ADD CONSTRAINT "CopyTradingRoute_masterId_fkey"
FOREIGN KEY ("masterId") REFERENCES "Master"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopyTradingRoute"
ADD CONSTRAINT "CopyTradingRoute_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopyTradingRoute"
ADD CONSTRAINT "CopyTradingRoute_clientId_brokerAccountId_fkey"
FOREIGN KEY ("clientId", "brokerAccountId") REFERENCES "BrokerAccount"("clientId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopyTradingRoute"
ADD CONSTRAINT "CopyTradingRoute_clientId_robotId_fkey"
FOREIGN KEY ("clientId", "robotId") REFERENCES "Robot"("clientId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
