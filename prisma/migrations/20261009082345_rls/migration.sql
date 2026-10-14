-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'DIRECTOR', 'C_LEVEL', 'EMPLOYEE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING_OTP', 'ACTIVE', 'QUALIFIED', 'NURTURING', 'DA_VERIFICARE_MANUALMENTE', 'ANOMALO', 'REJECTED');

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "adminEmail" TEXT,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING_OTP',
    "problemDescription" TEXT,
    "urgency" "Urgency",
    "role" "Role",
    "budget" DOUBLE PRECISION,
    "icpScore" INTEGER NOT NULL DEFAULT 0,
    "industry" TEXT,
    "coherenceScore" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "lastIp" TEXT,
    "fingerprint" TEXT,
    "passiveScore" INTEGER NOT NULL DEFAULT 0,
    "lastDecayedAt" TIMESTAMP(3),
    "recency" INTEGER NOT NULL DEFAULT 0,
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "monetary" INTEGER NOT NULL DEFAULT 0,
    "segment" TEXT NOT NULL DEFAULT 'Freddo',
    "arch_angle" TEXT,
    "is_proxy" BOOLEAN NOT NULL DEFAULT false,
    "contactCount" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "winningVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resendId" TEXT,
    "profileId" TEXT NOT NULL,
    "campaignId" TEXT,
    "variantId" TEXT,
    "messageId" TEXT,
    "emailAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "spamScore" DOUBLE PRECISION,
    "bounceHard" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSender" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "appPassword" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GMAIL',
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 465,
    "imapHost" TEXT,
    "imapPort" INTEGER DEFAULT 993,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "quarantineUntil" TIMESTAMP(3),
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "profileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebActivity" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "scrollDepth" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urlScoreAwarded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WebActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpToken_token_idx" ON "OtpToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_adminEmail_key" ON "Tenant"("adminEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_apiKey_key" ON "Tenant"("apiKey");

-- CreateIndex
CREATE INDEX "Tenant_apiKey_idx" ON "Tenant"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_tenantId_email_key" ON "Profile"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_resendId_key" ON "AutomationLog"("resendId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_messageId_key" ON "AutomationLog"("messageId");

-- CreateIndex
CREATE INDEX "AutomationLog_tenantId_idx" ON "AutomationLog"("tenantId");

-- CreateIndex
CREATE INDEX "AutomationLog_profileId_idx" ON "AutomationLog"("profileId");

-- CreateIndex
CREATE INDEX "AutomationLog_campaignId_variantId_idx" ON "AutomationLog"("campaignId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSender_email_key" ON "GmailSender"("email");

-- CreateIndex
CREATE INDEX "TrackingEvent_profileId_idx" ON "TrackingEvent"("profileId");

-- CreateIndex
CREATE INDEX "TrackingEvent_tenantId_idx" ON "TrackingEvent"("tenantId");

-- CreateIndex
CREATE INDEX "WebActivity_fingerprint_idx" ON "WebActivity"("fingerprint");

-- CreateIndex
CREATE INDEX "WebActivity_profileId_idx" ON "WebActivity"("profileId");

-- AddForeignKey
ALTER TABLE "OtpToken" ADD CONSTRAINT "OtpToken_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebActivity" ADD CONSTRAINT "WebActivity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
