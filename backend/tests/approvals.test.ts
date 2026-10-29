import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, pendingStepOf, prisma, type Who } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Small helpers so each test reads like the story it tells
const submit = async (claimId: string) => api.post(`/claims/${claimId}/submit`).set(await authAs("asha.claimant")).expect(200);
const approve = async (stepId: string, who: Who) => api.post(`/approvals/${stepId}/approve`).set(await authAs(who));
const reject = async (stepId: string, who: Who, reason = "test") => api.post(`/approvals/${stepId}/reject`).set(await authAs(who)).send({ reason });
const detail = async (claimId: string) => (await api.get(`/claims/${claimId}`).set(await authAs("asha.claimant")).expect(200)).body;
const chain = (claim: { approvals: { level: number; status: string }[] }) => claim.approvals.map((a) => `L${a.level} ${a.status}`);

describe("the approval chain", () => {
  it("₹8,000 needs one level; ₹15,000 needs two, and level 2 waits until level 1 has approved", async () => {
    // One level
    const small = await createClaimAs("asha.claimant", ["8000.00"]);
    await submit(small.id);
    expect(chain(await detail(small.id))).toEqual(["L1 PENDING"]);

    // Two levels: level 2 is WAITING, not yet pending
    const big = await createClaimAs("asha.claimant", ["15000.00"]);
    await submit(big.id);
    expect(chain(await detail(big.id))).toEqual(["L1 PENDING", "L2 WAITING"]);

    // Meera (level 2) cannot decide her step yet
    const meerasStep = await prisma.approval.findFirstOrThrow({ where: { claimId: big.id, level: 2 }, select: { id: true } });
    const tooEarly = await approve(meerasStep.id, "meera.l2");
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe("APPROVAL_NOT_PENDING");

    // Ravi approves level 1: level 2 becomes pending, but the claim is NOT approved yet
    await approve(await pendingStepOf(big.id, "ravi.l1"), "ravi.l1").then((r) => expect(r.status).toBe(200));
    const afterLevelOne = await detail(big.id);
    expect(chain(afterLevelOne)).toEqual(["L1 APPROVED", "L2 PENDING"]);
    expect(afterLevelOne.status).toBe("PENDING_APPROVAL");

    // Ravi cannot approve the same step twice
    const twice = await approve(await prisma.approval.findFirstOrThrow({ where: { claimId: big.id, level: 1 }, select: { id: true } }).then((s) => s.id), "ravi.l1");
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("APPROVAL_NOT_PENDING");

    // End both claims as rejected (an approved claim could never be cleaned up)
    await reject(await pendingStepOf(big.id, "meera.l2"), "meera.l2");
    await reject(await pendingStepOf(small.id, "ravi.l1"), "ravi.l1");
  });

  it("two simultaneous approvals of the same step: one succeeds, the other is refused", async () => {
    const claim = await createClaimAs("asha.claimant", ["15000.00"]);
    await submit(claim.id);
    const step = await pendingStepOf(claim.id, "ravi.l1");
    const headers = await authAs("ravi.l1");

    const results = await Promise.all([
      api.post(`/approvals/${step}/approve`).set(headers),
      api.post(`/approvals/${step}/approve`).set(headers),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const refused = results.find((r) => r.status === 409)!;
    expect(refused.body.error.code).toBe("APPROVAL_NOT_PENDING");

    await reject(await pendingStepOf(claim.id, "meera.l2"), "meera.l2");
  });

  it("changing the amount during approval voids every decision and starts a new chain", async () => {
    const claim = await createClaimAs("asha.claimant", ["15000.00"]);
    await submit(claim.id);
    await approve(await pendingStepOf(claim.id, "ravi.l1"), "ravi.l1").then((r) => expect(r.status).toBe(200));

    // The claimant changes the amount: 15,000 becomes 16,000
    const itemId = (await detail(claim.id)).lineItems[0].id;
    await api.patch(`/claims/${claim.id}/line-items/${itemId}`).set(await authAs("asha.claimant")).send({ amount: "16000.00" }).expect(200);

    // The old chain (version 1) is voided, including Ravi's approval; a new chain (version 2) starts from level 1
    const rows = await prisma.approval.findMany({ where: { claimId: claim.id }, orderBy: [{ chainVersion: "asc" }, { level: "asc" }], select: { chainVersion: true, level: true, status: true } });
    expect(rows.filter((r) => r.chainVersion === 1).map((r) => r.status)).toEqual(["INVALIDATED", "INVALIDATED"]);
    expect(rows.filter((r) => r.chainVersion === 2).map((r) => `L${r.level} ${r.status}`)).toEqual(["L1 PENDING", "L2 WAITING"]);
    expect(chain(await detail(claim.id))).toEqual(["L1 PENDING", "L2 WAITING"]); // the claim shows only the live chain

    // The history says what happened, with the old and new total
    const history = await api.get(`/claims/${claim.id}/history`).set(await authAs("asha.claimant")).expect(200);
    const reset = history.body.data.find((e: { action: string }) => e.action === "APPROVAL_CHAIN_RESET");
    expect(reset.metadata.oldTotal).toBe("15000.00");
    expect(reset.metadata.newTotal).toBe("16000.00");

    await reject(await pendingStepOf(claim.id, "ravi.l1"), "ravi.l1");
  });

  it("reject, edit, resubmit: the rejection is kept and a new chain begins", async () => {
    const claim = await createClaimAs("asha.claimant", ["500.00"]);
    await submit(claim.id);
    await reject(await pendingStepOf(claim.id, "ravi.l1"), "ravi.l1", "Receipt is missing").then((r) => expect(r.status).toBe(200));
    expect((await detail(claim.id)).status).toBe("REJECTED");

    // The claimant fixes the claim and sends it again
    const itemId = (await detail(claim.id)).lineItems[0].id;
    await api.patch(`/claims/${claim.id}/line-items/${itemId}`).set(await authAs("asha.claimant")).send({ description: "now with details" }).expect(200);
    await api.post(`/claims/${claim.id}/resubmit`).set(await authAs("asha.claimant")).expect(200);

    // Back in approval with a NEW chain, but the earlier rejection and its reason are still visible
    const after = await detail(claim.id);
    expect(after.status).toBe("PENDING_APPROVAL");
    expect(chain(after)).toEqual(["L1 PENDING"]);
    expect(after.lastRejection.reason).toBe("Receipt is missing");
    expect(after.lastRejection.rejectedBy).toMatch(/Ravi/);
    const versions = await prisma.approval.findMany({ where: { claimId: claim.id }, select: { chainVersion: true } });
    expect(new Set(versions.map((v) => v.chainVersion))).toEqual(new Set([1, 2]));

    await reject(await pendingStepOf(claim.id, "ravi.l1"), "ravi.l1");
  });
});
