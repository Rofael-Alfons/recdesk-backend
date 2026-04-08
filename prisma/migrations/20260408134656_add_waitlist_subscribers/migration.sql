-- CreateTable
CREATE TABLE "waitlist_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT DEFAULT 'website',
    "referralCode" TEXT,
    "referredBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_subscribers_email_key" ON "waitlist_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_subscribers_referralCode_key" ON "waitlist_subscribers"("referralCode");

-- CreateIndex
CREATE INDEX "waitlist_subscribers_subscribedAt_idx" ON "waitlist_subscribers"("subscribedAt");
