import { prisma } from "../src/db/prisma";

// Runs once before all tests. Safety guard: the tests create and change real rows, so they must never run against dev.
// The test branch is recognised by claims that only exist there; the dev database has the Postman test claims.
export default async function setup() {
  const testMarker = await prisma.claim.count({ where: { title: { startsWith: "[export-check]" } } });
  const devMarker = await prisma.claim.count({ where: { title: "Postman test claim" } });
  await prisma.$disconnect();

  if (testMarker === 0 || devMarker > 0) {
    throw new Error("This does not look like the Neon test branch: refusing to run the tests. Check backend/.env.test.");
  }
}
