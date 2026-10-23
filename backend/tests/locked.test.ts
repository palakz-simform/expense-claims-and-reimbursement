import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, ensureApprovedClaim, prisma } from "./helpers";

let claim: Awaited<ReturnType<typeof ensureApprovedClaim>>;

beforeAll(async () => {
  claim = await ensureApprovedClaim(); // created once, then reused
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Once a claim is APPROVED nothing about it may change. Two layers enforce that:
// the API (409 CLAIM_LOCKED) and, as a backstop, database triggers that refuse even raw SQL.
describe("an approved claim is locked", () => {
  it("every change through the API is refused with 409 CLAIM_LOCKED", async () => {
    const asha = await authAs("asha.claimant");
    const itemId = claim.lineItems[0].id;
    // Each attempt is a small function, so the request is only built at the moment it is sent
    const attempts = [
      () => api.post(`/claims/${claim.id}/line-items`).set(asha).send({ date: "2026-01-01", category: "MEALS", amount: "5.00", description: "x" }),
      () => api.patch(`/claims/${claim.id}/line-items/${itemId}`).set(asha).send({ amount: "1.00" }),
      () => api.delete(`/claims/${claim.id}/line-items/${itemId}`).set(asha),
      () => api.patch(`/claims/${claim.id}`).set(asha).send({ title: "changed" }),
      () => api.delete(`/claims/${claim.id}`).set(asha),
      () => api.post(`/claims/${claim.id}/submit`).set(asha),
    ];

    for (const attempt of attempts) {
      const res = await attempt();
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CLAIM_LOCKED");
    }

    // And nothing changed
    const after = (await api.get(`/claims/${claim.id}`).set(asha).expect(200)).body;
    expect(after.status).toBe("APPROVED");
    expect(after.total).toBe("123.00");
  });

  it("the database itself refuses raw SQL changes (the trigger backstop)", async () => {
    // Each statement runs inside a transaction that is always rolled back, so even if a trigger were missing nothing would change
    const refused = (statement: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>) =>
      prisma.$transaction(async (tx) => {
        await statement(tx);
        throw new Error("NOT REFUSED: the statement was allowed");
      });

    await expect(refused((tx) => tx.$executeRaw`UPDATE "LineItem" SET "amount" = "amount" WHERE "claimId" = ${claim.id}::uuid`)).rejects.toThrow(/CLAIM_LOCKED/);
    await expect(refused((tx) => tx.$executeRaw`DELETE FROM "LineItem" WHERE "claimId" = ${claim.id}::uuid`)).rejects.toThrow(/CLAIM_LOCKED/);
    await expect(refused((tx) => tx.$executeRaw`UPDATE "Claim" SET "status" = 'DRAFT' WHERE "id" = ${claim.id}::uuid`)).rejects.toThrow(/CLAIM_LOCKED/);
    await expect(refused((tx) => tx.$executeRaw`DELETE FROM "Claim" WHERE "id" = ${claim.id}::uuid`)).rejects.toThrow(/CLAIM_LOCKED/);
  });
});
