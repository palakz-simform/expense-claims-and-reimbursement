import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, lineItem, prisma, rememberForCleanUp } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Add up the amounts of the line items in cents, so the check itself has no decimal rounding problems
const sumInCents = (items: { amount: string }[]) => items.reduce((sum, item) => sum + Math.round(parseFloat(item.amount) * 100), 0);
const asCents = (total: string) => Math.round(parseFloat(total) * 100);

// MANDATORY TEST 2: "the claim total can never be out of step with its line items".
// The total is never stored: it is always the database's SUM of the line items.
describe("the claim total cannot desynchronise from its line items", () => {
  it("a client cannot send a total", async () => {
    const asha = await authAs("asha.claimant");

    // On create
    const create = await api.post("/claims").set(asha).send({ title: "[test] with total", total: "1.00", lineItems: [lineItem("10.00")] });
    if (create.body.id) rememberForCleanUp(create.body.id); // only happens if the rule is broken: do not leave the claim behind
    expect(create.status).toBe(400);
    expect(create.body.error.code).toBe("VALIDATION_ERROR");

    // On edit
    const claim = await createClaimAs("asha.claimant", ["10.00"]);
    await api.patch(`/claims/${claim.id}`).set(asha).send({ total: "999.00" }).expect(400);
  });

  it("the returned total always equals the sum of the line items, to the cent", async () => {
    const asha = await authAs("asha.claimant");
    const claim = await createClaimAs("asha.claimant", ["10.10", "20.20"]); // 0.1 + 0.2 is the classic floating-point trap
    const check = async () => {
      const res = await api.get(`/claims/${claim.id}`).set(asha).expect(200);
      expect(asCents(res.body.total)).toBe(sumInCents(res.body.lineItems));
      return res.body;
    };

    expect((await check()).total).toBe("30.30");

    // Add an item
    await api.post(`/claims/${claim.id}/line-items`).set(asha).send(lineItem("0.05")).expect(201);
    expect((await check()).total).toBe("30.35");

    // Change an amount
    const firstItem = (await check()).lineItems[0].id;
    await api.patch(`/claims/${claim.id}/line-items/${firstItem}`).set(asha).send({ amount: "100.00" }).expect(200);
    expect((await check()).total).toBe("120.25");

    // Remove an item
    await api.delete(`/claims/${claim.id}/line-items/${firstItem}`).set(asha).expect(200);
    expect((await check()).total).toBe("20.25");
  });

  it("a change that is refused leaves the items and the total exactly as they were", async () => {
    const asha = await authAs("asha.claimant");
    const claim = await createClaimAs("asha.claimant", ["40.00"]);
    await api.post(`/claims/${claim.id}/submit`).set(asha).expect(200);
    const before = (await api.get(`/claims/${claim.id}`).set(asha).expect(200)).body;

    // A claim awaiting approval must keep at least one item, so removing the last one is refused
    const refused = await api.delete(`/claims/${claim.id}/line-items/${before.lineItems[0].id}`).set(asha);
    expect(refused.status).toBe(422);

    // An invalid amount is refused too
    await api.patch(`/claims/${claim.id}/line-items/${before.lineItems[0].id}`).set(asha).send({ amount: "-5.00" }).expect(400);

    const after = (await api.get(`/claims/${claim.id}`).set(asha).expect(200)).body;
    expect(after.total).toBe(before.total);
    expect(after.lineItems).toEqual(before.lineItems);
  });

  it("there is no total column in the database to fall out of step", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Claim' AND table_schema = current_schema()`;
    const names = columns.map((c) => c.column_name);

    expect(names.length).toBeGreaterThan(5); // the query really found the table
    expect(names.filter((n) => /total|amount/i.test(n))).toEqual([]);
  });
});
