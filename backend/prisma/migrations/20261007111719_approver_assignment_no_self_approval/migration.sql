-- This is an empty migration.
-- A user cannot be their own approver (defence in depth; roles already make this impossible)
ALTER TABLE "ApproverAssignment"
  ADD CONSTRAINT "ApproverAssignment_no_self_approval" CHECK ("claimantId" <> "approverId");
