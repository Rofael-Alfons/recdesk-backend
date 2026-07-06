-- CreateEnum
CREATE TYPE "OfferMode" AS ENUM ('FIXED', 'LIVE');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "offerMode" "OfferMode" NOT NULL DEFAULT 'FIXED';
