-- AlterTable
ALTER TABLE "StarsTransaction" ADD COLUMN     "refundAdminId" TEXT,
ADD COLUMN     "refundFailure" TEXT,
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3);
