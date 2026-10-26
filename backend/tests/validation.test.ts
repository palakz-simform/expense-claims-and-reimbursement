import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, lineItem, prisma, rememberForCleanUp } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Bad input is refused with 400 VALIDATION_ERROR and a list of the fields that are wrong
describe("invalid input is refused", () => {
  const badItems: [string, object][] = [
    ["a negative amount", { ...lineItem("10.00"), amount: "-5.00" }],
    ["a date in the future", { ...lineItem("10.00"), date: "2999-01-01" }],
  ];

  for (const [name, item] of badItems) {
    it(`a line item with ${name} is 400`, async () => {
      const res = await api.post("/claims").set(await authAs("asha.claimant")).send({ title: "[test] invalid", lineItems: [item] });
      if (res.body.id) rememberForCleanUp(res.body.id); // only happens if the rule is broken
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  }

  // Mass assignment: the client can never set the total (or any other field the API does not accept)
  it("a claim body with a total is refused (400)", async () => {
    const res = await api.post("/claims").set(await authAs("asha.claimant")).send({ title: "[test] mass assignment", total: "1.00", lineItems: [] });
    if (res.body.id) rememberForCleanUp(res.body.id); // only happens if the rule is broken
    expect(res.status).toBe(400);
  });

  it("a claim with no line items cannot be submitted (422 NO_LINE_ITEMS)", async () => {
    const claim = await createClaimAs("asha.claimant", []); // a draft may be empty
    const res = await api.post(`/claims/${claim.id}/submit`).set(await authAs("asha.claimant"));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_LINE_ITEMS");

    // It is still a draft
    const after = await api.get(`/claims/${claim.id}`).set(await authAs("asha.claimant")).expect(200);
    expect(after.body.status).toBe("DRAFT");
  });
});
