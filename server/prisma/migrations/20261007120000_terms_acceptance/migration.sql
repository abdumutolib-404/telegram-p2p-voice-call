ALTER TABLE "User" ADD COLUMN "termsAcceptedVersion" TEXT,
                   ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
                   ADD COLUMN "termsDocumentSha256" TEXT;
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'TELEGRAM_BOT',
    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TermsAcceptance_userId_version_documentSha256_key"
    ON "TermsAcceptance"("userId", "version", "documentSha256");
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
