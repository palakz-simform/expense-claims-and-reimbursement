import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";

// The app itself, called without starting a server
export const api = request(app);

// The seeded users the tests act as: first part of their email address
export type Who = "asha.claimant" | "bilal.claimant" | "ravi.l1" | "sana.l1" | "meera.l2" | "kabir.l2" | "farah";

// An Authorization header for a seeded user. The token is signed the same way the login endpoint signs it.
export async function authAs(who: Who) {
  const user = await prisma.user.findFirstOrThrow({ where: { email: { startsWith: who } }, select: { id: true } });
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "10m" });
  return { Authorization: `Bearer ${token}` };
}

export async function userId(who: Who) {
  const user = await prisma.user.findFirstOrThrow({ where: { email: { startsWith: who } }, select: { id: true } });
  return user.id;
}

// A valid line item for a request body
export const lineItem = (amount: string, description = "test item") => ({
  date: new Date().toISOString().slice(0, 10),
  category: "MEALS",
  amount,
  description,
});

// Claims created by a test are remembered here so they can be removed afterwards.
// Approved claims are locked by database triggers and cannot be deleted, so tests must end their claims pending or rejected.
const createdClaimIds: string[] = [];

// For a claim a test did NOT expect to create (for example when a rule it checks is broken): still remove it afterwards
export function rememberForCleanUp(claimId: string) {
  createdClaimIds.push(claimId);
}

export async function createClaimAs(who: Who, amounts: string[], title = "[test] claim") {
  const res = await api.post("/claims").set(await authAs(who)).send({ title, lineItems: amounts.map((a) => lineItem(a)) });
  if (res.status !== 201) throw new Error(`Could not create the test claim: ${res.status} ${JSON.stringify(res.body)}`);
  createdClaimIds.push(res.body.id);
  return res.body as { id: string; lineItems: { id: string }[] };
}

// A claim that is already APPROVED, for the tests of locked claims. An approved claim can never be deleted, so it is
// created ONCE (through the real flow: create, submit, approve) and reused by every later run.
const APPROVED_FIXTURE_TITLE = "[test fixture] locked claim";

export async function ensureApprovedClaim() {
  const find = () => prisma.claim.findFirst({ where: { title: APPROVED_FIXTURE_TITLE, status: "APPROVED" }, select: { id: true, lineItems: { select: { id: true } } } });
  const existing = await find();
  if (existing) return existing;

  const asha = await authAs("asha.claimant");
  const created = await api.post("/claims").set(asha).send({ title: APPROVED_FIXTURE_TITLE, lineItems: [lineItem("123.00")] }).expect(201);
  await api.post(`/claims/${created.body.id}/submit`).set(asha).expect(200);
  await api.post(`/approvals/${await pendingStepOf(created.body.id, "ravi.l1")}/approve`).set(await authAs("ravi.l1")).expect(200);
  return (await find())!;
}

// The id of the approval step an approver can decide right now for a claim
export async function pendingStepOf(claimId: string, approver: Who) {
  const step = await prisma.approval.findFirstOrThrow({ where: { claimId, approverId: await userId(approver), status: "PENDING" }, select: { id: true } });
  return step.id;
}

// Remove everything the tests created (child rows first, because of the foreign keys)
export async function cleanUp() {
  if (createdClaimIds.length === 0) return;
  const ids = createdClaimIds.splice(0);
  const items = (await prisma.lineItem.findMany({ where: { claimId: { in: ids } }, select: { id: true } })).map((i) => i.id);
  await prisma.receipt.deleteMany({ where: { lineItemId: { in: items } } });
  await prisma.claimHistory.deleteMany({ where: { claimId: { in: ids } } });
  await prisma.approval.deleteMany({ where: { claimId: { in: ids } } });
  await prisma.lineItem.deleteMany({ where: { claimId: { in: ids } } });
  await prisma.claim.deleteMany({ where: { id: { in: ids } } });
}

export { prisma };
