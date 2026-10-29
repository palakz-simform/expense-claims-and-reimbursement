-- CreateTable
CREATE TABLE "ApproverAssignment" (
    "id" UUID NOT NULL,
    "claimantId" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproverAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApproverAssignment_approverId_idx" ON "ApproverAssignment"("approverId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproverAssignment_claimantId_level_key" ON "ApproverAssignment"("claimantId", "level");

-- AddForeignKey
ALTER TABLE "ApproverAssignment" ADD CONSTRAINT "ApproverAssignment_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproverAssignment" ADD CONSTRAINT "ApproverAssignment_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint: levels start at 1 and have no upper bound
ALTER TABLE "ApproverAssignment" ADD CONSTRAINT "ApproverAssignment_level_min" CHECK ("level" >= 1);
