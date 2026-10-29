import { afterAll, describe, expect, it } from "vitest";
import { api, authAs, cleanUp, createClaimAs, ensureApprovedClaim, prisma } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// Any well-formed id: authentication and role checks run before the id is looked up
const ID = "00000000-0000-4000-8000-000000000000";

type Method = "get" | "post" | "patch" | "delete";

// Every route except /health and /auth/login, and who may NOT call it (checked below)
const ROUTES: { method: Method; path: string; writes: boolean }[] = [
  { method: "get", path: "/auth/me", writes: false },
  { method: "post", path: "/claims", writes: true },
  { method: "get", path: "/claims", writes: false },
  { method: "get", path: `/claims/${ID}`, writes: false },
  { method: "get", path: `/claims/${ID}/history`, writes: false },
  { method: "patch", path: `/claims/${ID}`, writes: true },
  { method: "delete", path: `/claims/${ID}`, writes: true },
  { method: "post", path: `/claims/${ID}/submit`, writes: true },
  { method: "post", path: `/claims/${ID}/resubmit`, writes: true },
  { method: "post", path: `/claims/${ID}/line-items`, writes: true },
  { method: "patch", path: `/claims/${ID}/line-items/${ID}`, writes: true },
  { method: "delete", path: `/claims/${ID}/line-items/${ID}`, writes: true },
  { method: "get", path: "/approvals", writes: false },
  { method: "post", path: `/approvals/${ID}/approve`, writes: true },
  { method: "post", path: `/approvals/${ID}/reject`, writes: true },
  { method: "post", path: `/line-items/${ID}/receipts`, writes: true },
  { method: "get", path: `/receipts/${ID}`, writes: false },
  { method: "delete", path: `/receipts/${ID}`, writes: true },
  { method: "get", path: "/finance/export", writes: false },
];

describe("authentication", () => {
  it.each(ROUTES)("$method $path is refused without a token (401)", async ({ method, path }) => {
    const res = await api[method](path);
    expect(res.status).toBe(401);
  });
});

describe("finance is read-only", () => {
  const writeRoutes = ROUTES.filter((route) => route.writes);

  it.each(writeRoutes)("finance cannot $method $path (403)", async ({ method, path }) => {
    const res = await api[method](path).set(await authAs("farah"));
    expect(res.status).toBe(403);
  });
});

describe("finance export", () => {
  it("contains approved claims only, and only those in the period", async () => {
    // One approved claim (the permanent fixture) and one that is still pending
    const approved = await ensureApprovedClaim();
    const approvedRow = await prisma.claim.findUniqueOrThrow({ where: { id: approved.id }, select: { approvedAt: true } });
    const day = approvedRow.approvedAt!.toISOString().slice(0, 10);

    const asha = await authAs("asha.claimant");
    const pending = await createClaimAs("asha.claimant", ["50.00"], "[test] pending, not exported");
    await api.post(`/claims/${pending.id}/submit`).set(asha).expect(200);

    const finance = await authAs("farah");
    const inPeriod = await api.get(`/finance/export?from=${day}&to=${day}`).set(finance);
    expect(inPeriod.status).toBe(200);
    expect(inPeriod.headers["content-type"]).toContain("text/csv");
    expect(inPeriod.text).toContain(approved.id);
    expect(inPeriod.text).not.toContain(pending.id);

    // A period long before anything was approved is empty: only the header row is left
    const farPast = await api.get("/finance/export?from=2000-01-01&to=2000-01-02").set(finance);
    expect(farPast.status).toBe(200);
    expect(farPast.text).not.toContain(approved.id);
  });

  it("is for finance only", async () => {
    for (const who of ["asha.claimant", "ravi.l1"] as const) {
      const res = await api.get("/finance/export?from=2000-01-01&to=2000-01-02").set(await authAs(who));
      expect(res.status).toBe(403);
    }
  });

  it("needs both dates", async () => {
    const res = await api.get("/finance/export?from=2000-01-01").set(await authAs("farah"));
    expect(res.status).toBe(400);
  });
});
