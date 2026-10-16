ALTER TABLE "User" ADD COLUMN "starterGiftGrantedAt" TIMESTAMP(3);
-- Preserve all existing balances and prevent a second starter allocation.
UPDATE "User" SET "starterGiftGrantedAt"=CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "callCredits" SET DEFAULT 0;
