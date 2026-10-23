import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, pendingStepOf, prisma } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// MANDATORY TEST 1: "an approver who asks for a claim outside their queue, by its ID, is refused at the query".
// Asha's approvers are Ravi (level 1) and Meera (level 2). Bilal's are Sana and Kabir.
describe("an approver cannot read a claim outside their queue", () => {
  it("only the approver who has a step on the claim can read it; everyone else gets 404", async () => {
    const claim = await createClaimAs("asha.claimant", ["500.00"]); // under 10,000: one level, Ravi only
    await api.post(`/claims/${claim.id}/submit`).set(await authAs("asha.claimant")).expect(200);

    // Ravi has a step on it, so he can read it (and so can the owner)
    await api.get(`/claims/${claim.id}`).set(await authAs("ravi.l1")).expect(200);
    await api.get(`/claims/${claim.id}`).set(await authAs("asha.claimant")).expect(200);

    // Sana is an approver, but for Bilal's claims, not Asha's: the claim is simply "not found"
    const sana = await api.get(`/claims/${claim.id}`).set(await authAs("sana.l1"));
    expect(sana.status).toBe(404);
    expect(sana.body.error.code).toBe("NOT_FOUND");

    // Meera is Asha's level-2 approver, but this claim needs only level 1, so she has no step on it either
    await api.get(`/claims/${claim.id}`).set(await authAs("meera.l2")).expect(404);

    // Another claimant cannot read it either
    await api.get(`/claims/${claim.id}`).set(await authAs("bilal.claimant")).expect(404);

    // The same refusal for its history, and the claim is not in Sana's list
    await api.get(`/claims/${claim.id}/history`).set(await authAs("sana.l1")).expect(404);
    const list = await api.get("/claims?pageSize=100").set(await authAs("sana.l1")).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(claim.id);

    // Finance may read every claim
    await api.get(`/claims/${claim.id}`).set(await authAs("farah")).expect(200);
  });

  it("the refusal looks exactly like a claim that does not exist, so its existence is not revealed", async () => {
    const claim = await createClaimAs("asha.claimant", ["500.00"]);
    const outOfScope = await api.get(`/claims/${claim.id}`).set(await authAs("bilal.claimant"));
    const missing = await api.get("/claims/01a14394-0000-7000-8000-000000000000").set(await authAs("bilal.claimant"));

    expect(outOfScope.status).toBe(missing.status);
    expect(outOfScope.body.error.code).toBe(missing.body.error.code);
    expect(outOfScope.body.error.message).toBe(missing.body.error.message);
  });

  it("an approver cannot decide another approver's step either (404, not 403)", async () => {
    const claim = await createClaimAs("asha.claimant", ["500.00"]);
    await api.post(`/claims/${claim.id}/submit`).set(await authAs("asha.claimant")).expect(200);
    const ravisStep = await pendingStepOf(claim.id, "ravi.l1");

    // Sana tries to approve and to reject Ravi's step
    await api.post(`/approvals/${ravisStep}/approve`).set(await authAs("sana.l1")).expect(404);
    await api.post(`/approvals/${ravisStep}/reject`).set(await authAs("sana.l1")).send({ reason: "no" }).expect(404);

    // Nothing changed: the step is still waiting for Ravi
    const step = await prisma.approval.findUniqueOrThrow({ where: { id: ravisStep } });
    expect(step.status).toBe("PENDING");
  });

  it("a level-2 approver cannot see the claim until level 1 has approved it", async () => {
    const claim = await createClaimAs("asha.claimant", ["12000.00"]); // 10,000 or more: two levels
    await api.post(`/claims/${claim.id}/submit`).set(await authAs("asha.claimant")).expect(200);

    // Meera's step is still waiting for Ravi, so the claim is outside her queue
    await api.get(`/claims/${claim.id}`).set(await authAs("meera.l2")).expect(404);

    // Ravi approves level 1: now it is Meera's turn and she can see it
    await api.post(`/approvals/${await pendingStepOf(claim.id, "ravi.l1")}/approve`).set(await authAs("ravi.l1")).expect(200);
    await api.get(`/claims/${claim.id}`).set(await authAs("meera.l2")).expect(200);

    // End the claim as rejected (an approved claim could never be cleaned up)
    await api.post(`/approvals/${await pendingStepOf(claim.id, "meera.l2")}/reject`).set(await authAs("meera.l2")).send({ reason: "test" }).expect(200);
  });
});
