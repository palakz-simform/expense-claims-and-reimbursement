-- Migration: claim_lock_hardening
--
-- Purpose: close two gaps left by claim_lock_triggers.
--
-- What it adds:
--   1. Trigger on "Claim"  - an APPROVED claim row can no longer be updated or deleted, so it
--      cannot be reopened (e.g. status set back to DRAFT) to get around the line item lock.
--      The final approval (PENDING_APPROVAL -> APPROVED) still passes, because OLD.status
--      is not yet APPROVED at that point.
--   2. FOR SHARE on the status lookups in the LineItem and Receipt trigger functions - the
--      claim row stays share-locked until the editing transaction ends, so a concurrent
--      approval (which needs an exclusive row lock to update the claim) waits for the edit to
--      finish instead of slipping in between the check and the write.
--
-- Details:
--   - CREATE OR REPLACE keeps the existing triggers bound to the functions; only the bodies change.
--   - Blocked statements still fail with the exception message 'CLAIM_LOCKED'.

-- Claim: block update/delete once the claim is APPROVED (read-only means the row too)
CREATE FUNCTION enforce_claim_not_locked() RETURNS trigger AS $$
BEGIN
  -- OLD is the row as it is stored now; if it is already approved, nothing may change it
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'CLAIM_LOCKED';
  END IF;

  -- A BEFORE trigger must return OLD for DELETE, otherwise the row is silently skipped
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Claim_lock"
BEFORE UPDATE OR DELETE ON "Claim"
FOR EACH ROW EXECUTE FUNCTION enforce_claim_not_locked();

-- LineItem: same checks as before, now holding a share lock on the claim row
CREATE OR REPLACE FUNCTION enforce_line_item_claim_not_locked() RETURNS trigger AS $$
DECLARE
  claim_status "ClaimStatus";
BEGIN
  -- UPDATE/DELETE: the row's existing claim (OLD) must not be locked
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO claim_status FROM "Claim" WHERE "id" = OLD."claimId" FOR SHARE;
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  -- INSERT/UPDATE: the claim the row ends up in (NEW) must not be locked either
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO claim_status FROM "Claim" WHERE "id" = NEW."claimId" FOR SHARE;
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Receipt: same, locking only the claim row (FOR SHARE OF c), not the line item
CREATE OR REPLACE FUNCTION enforce_receipt_claim_not_locked() RETURNS trigger AS $$
DECLARE
  claim_status "ClaimStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT c."status" INTO claim_status
    FROM "Claim" c JOIN "LineItem" li ON li."claimId" = c."id"
    WHERE li."id" = OLD."lineItemId"
    FOR SHARE OF c;
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT c."status" INTO claim_status
    FROM "Claim" c JOIN "LineItem" li ON li."claimId" = c."id"
    WHERE li."id" = NEW."lineItemId"
    FOR SHARE OF c;
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
