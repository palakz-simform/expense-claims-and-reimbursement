-- Migration: claim_lock_triggers
--
-- Purpose: once a claim is APPROVED it becomes read-only. This migration enforces that
-- at the database level, so even a direct SQL statement or a service bug cannot change
-- an approved claim's line items or receipts (defence in depth; the service layer also
-- rejects these edits with a clear 409 CLAIM_LOCKED error).
--
-- What it adds:
--   1. Trigger on "LineItem"  - blocks INSERT / UPDATE / DELETE when the parent claim is APPROVED
--   2. Trigger on "Receipt"   - same rule, reaching the claim through its line item
--
-- Details:
--   - Blocked statements fail with the exception message 'CLAIM_LOCKED'.
--   - On UPDATE both the old and the new claim are checked, so a line item cannot be moved
--     into or out of an approved claim.
--   - The final-approval transaction only updates "Claim", so it never blocks itself.
--   - Not covered here: a concurrent edit that starts just before an approval commits;
--     the service closes that gap with SELECT ... FOR UPDATE on the claim row.

-- LineItem: block insert/update/delete while the parent claim is APPROVED
CREATE FUNCTION enforce_line_item_claim_not_locked() RETURNS trigger AS $$
DECLARE
  claim_status "ClaimStatus";
BEGIN
  -- UPDATE/DELETE: the row's existing claim (OLD) must not be locked
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO claim_status FROM "Claim" WHERE "id" = OLD."claimId";
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  -- INSERT/UPDATE: the claim the row ends up in (NEW) must not be locked either
  -- (covers moving an item from a draft claim into an approved one)
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO claim_status FROM "Claim" WHERE "id" = NEW."claimId";
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  -- A BEFORE trigger must return OLD for DELETE, otherwise the row is silently skipped
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LineItem_claim_lock"
BEFORE INSERT OR UPDATE OR DELETE ON "LineItem"
FOR EACH ROW EXECUTE FUNCTION enforce_line_item_claim_not_locked();

-- Receipt: same rule, reaching the claim through its line item
CREATE FUNCTION enforce_receipt_claim_not_locked() RETURNS trigger AS $$
DECLARE
  claim_status "ClaimStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT c."status" INTO claim_status
    FROM "Claim" c JOIN "LineItem" li ON li."claimId" = c."id"
    WHERE li."id" = OLD."lineItemId";
    IF claim_status = 'APPROVED' THEN
      RAISE EXCEPTION 'CLAIM_LOCKED';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT c."status" INTO claim_status
    FROM "Claim" c JOIN "LineItem" li ON li."claimId" = c."id"
    WHERE li."id" = NEW."lineItemId";
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

CREATE TRIGGER "Receipt_claim_lock"
BEFORE INSERT OR UPDATE OR DELETE ON "Receipt"
FOR EACH ROW EXECUTE FUNCTION enforce_receipt_claim_not_locked();
