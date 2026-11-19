-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "freeMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reservedMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
