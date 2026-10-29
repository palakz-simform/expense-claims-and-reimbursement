-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLAIMANT', 'APPROVER', 'FINANCE');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('TRAVEL', 'ACCOMMODATION', 'MEALS', 'TRANSPORT', 'OFFICE_SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CLAIM_CREATED', 'CLAIM_UPDATED', 'CLAIM_SUBMITTED', 'APPROVAL_GRANTED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'CLAIM_RESUBMITTED', 'APPROVAL_CHAIN_RESET', 'RECEIPT_ADDED', 'RECEIPT_REMOVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "approvalLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "claimNumber" SERIAL NOT NULL,
    "claimantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "currentApprovalVersion" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" "Category" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "lineItemId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "chainVersion" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'WAITING',
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimHistory" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "performedById" UUID NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimNumber_key" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_claimantId_status_idx" ON "Claim"("claimantId", "status");

-- CreateIndex
CREATE INDEX "Claim_status_approvedAt_idx" ON "Claim"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "Claim_status_submittedAt_idx" ON "Claim"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "LineItem_claimId_idx" ON "LineItem"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_storedName_key" ON "Receipt"("storedName");

-- CreateIndex
CREATE INDEX "Receipt_lineItemId_idx" ON "Receipt"("lineItemId");

-- CreateIndex
CREATE INDEX "Approval_approverId_status_idx" ON "Approval"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_claimId_chainVersion_level_key" ON "Approval"("claimId", "chainVersion", "level");

-- CreateIndex
CREATE INDEX "ClaimHistory_claimId_createdAt_idx" ON "ClaimHistory"("claimId", "createdAt");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimHistory" ADD CONSTRAINT "ClaimHistory_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimHistory" ADD CONSTRAINT "ClaimHistory_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints: the database rejects bad data even if the service has a bug (defence in depth)
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_level_min" CHECK ("level" >= 1);
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_chainVersion_min" CHECK ("chainVersion" >= 1);

-- Only approvers have an approvalLevel; everyone else must have none
ALTER TABLE "User" ADD CONSTRAINT "User_approvalLevel_valid" CHECK (
  ("role" = 'APPROVER' AND "approvalLevel" >= 1)
  OR ("role" <> 'APPROVER' AND "approvalLevel" IS NULL)
);
