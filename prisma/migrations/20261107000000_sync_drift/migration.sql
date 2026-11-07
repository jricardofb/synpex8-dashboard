-- DropIndex
DROP INDEX "public"."Robot_clientId_idx";

-- AlterTable
ALTER TABLE "public"."MasterSignal" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
