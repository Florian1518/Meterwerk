CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED');
ALTER TABLE "Attachment"
  ADD COLUMN "scanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "scannedAt" TIMESTAMP(3),
  ADD COLUMN "scanProvider" TEXT,
  ADD COLUMN "sha256" TEXT;
-- Existing files deliberately remain quarantined until explicitly rescanned.
