CREATE TABLE "email_otps" (
  "email" TEXT PRIMARY KEY,
  "otp_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "used_at" TIMESTAMP(3),
  "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_count" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX "email_otps_expires_at_idx" ON "email_otps"("expires_at");
ALTER TABLE "email_otps" ENABLE ROW LEVEL SECURITY;
-- Backend database role only; never expose OTP hashes through the public API.
REVOKE ALL ON "email_otps" FROM anon, authenticated;
