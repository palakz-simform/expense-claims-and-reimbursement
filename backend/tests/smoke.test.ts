import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, prisma } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Proves the test setup works: the app answers, authentication is required, and a test can create and read data
describe("test setup", () => {
  it("the health check answers without a token", async () => {
    const res = await api.get("/health");
    expect(res.status).toBe(200);
  });

  it("a request without a token is refused", async () => {
    const res = await api.get("/claims");
    expect(res.status).toBe(401);
  });

  it("a claimant can create a claim and read it back", async () => {
    const claim = await createClaimAs("asha.claimant", ["100.00"]);
    const res = await api.get(`/claims/${claim.id}`).set(await authAs("asha.claimant"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe("100.00");
  });
});
