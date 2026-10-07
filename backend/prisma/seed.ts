import bcrypt from "bcryptjs";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { Role } from "../src/generated/prisma/enums";

// Idempotent seed: running it twice leaves the same rows (upsert by natural key, never plain create).
// Dev/test data only; it refuses to run in production.

const BCRYPT_ROUNDS = 10;

// --- Users to create (one shared password from SEED_PASSWORD, never hardcoded) ---
type SeedUser = { email: string; name: string; role: Role; approvalLevel?: number };

const USERS: SeedUser[] = [
  { email: "asha.claimant@example.com", name: "Asha Claimant", role: Role.CLAIMANT },
  { email: "bilal.claimant@example.com", name: "Bilal Claimant", role: Role.CLAIMANT },
  { email: "ravi.l1@example.com", name: "Ravi Approver (L1)", role: Role.APPROVER, approvalLevel: 1 },
  { email: "sana.l1@example.com", name: "Sana Approver (L1)", role: Role.APPROVER, approvalLevel: 1 },
  { email: "meera.l2@example.com", name: "Meera Approver (L2)", role: Role.APPROVER, approvalLevel: 2 },
  { email: "kabir.l2@example.com", name: "Kabir Approver (L2)", role: Role.APPROVER, approvalLevel: 2 },
  { email: "farah.finance@example.com", name: "Farah Finance", role: Role.FINANCE },
];

// --- Who approves each claimant, per level (level -> approver email) ---
// The two claimants get DIFFERENT approvers at every level, so tests can prove an approver
// cannot see the other claimant's claims. Adding a level 3 = one more entry per claimant.
const ASSIGNMENTS: { claimant: string; approverByLevel: Record<number, string> }[] = [
  { claimant: "asha.claimant@example.com", approverByLevel: { 1: "ravi.l1@example.com", 2: "meera.l2@example.com" } },
  { claimant: "bilal.claimant@example.com", approverByLevel: { 1: "sana.l1@example.com", 2: "kabir.l2@example.com" } },
];

async function main() {
  // --- Safety guards ---
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production.");
  }
  if (!env.SEED_PASSWORD) {
    throw new Error("SEED_PASSWORD is not set (add it to backend/.env).");
  }

  // --- Users: hash once, upsert by email ---
  // `update: {}` keeps existing rows untouched on re-runs (e.g. an already-changed password).
  const passwordHash = await bcrypt.hash(env.SEED_PASSWORD, BCRYPT_ROUNDS);
  const idByEmail = new Map<string, { id: string; role: Role; approvalLevel: number | null }>();

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        approvalLevel: u.approvalLevel ?? null,
        passwordHash,
      },
    });
    idByEmail.set(u.email, { id: user.id, role: user.role, approvalLevel: user.approvalLevel });
  }

  // --- Approver assignments: one row per (claimant, level), validated before writing ---
  for (const a of ASSIGNMENTS) {
    const claimant = idByEmail.get(a.claimant);
    if (!claimant || claimant.role !== Role.CLAIMANT) {
      throw new Error(`Assignment claimant is not a seeded CLAIMANT: ${a.claimant}`);
    }

    for (const [levelKey, approverEmail] of Object.entries(a.approverByLevel)) {
      const level = Number(levelKey);
      const approver = idByEmail.get(approverEmail);
      // The approver must be an APPROVER whose approvalLevel equals the level they are assigned to
      if (!approver || approver.role !== Role.APPROVER || approver.approvalLevel !== level) {
        throw new Error(`Invalid approver for ${a.claimant} at level ${level}: ${approverEmail}`);
      }

      await prisma.approverAssignment.upsert({
        where: { claimantId_level: { claimantId: claimant.id, level } },
        update: { approverId: approver.id },
        create: { claimantId: claimant.id, level, approverId: approver.id },
      });
    }
  }

  console.log(`Seeded ${USERS.length} users and ${ASSIGNMENTS.length} claimants' approver assignments.`);
}

// --- Run, always release the DB connection, fail the process on error ---
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
