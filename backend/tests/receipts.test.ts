import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { api, authAs, cleanUp, createClaimAs, pendingStepOf, prisma } from "./helpers";

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

// A real 1x1 PNG (the app checks the first bytes of the file, so the content must be genuine)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

const filesOnDisk = () => readdirSync(env.UPLOAD_DIR).length;

// Upload one receipt as a user to a line item
const upload = async (who: "asha.claimant" | "bilal.claimant", itemId: string, content: Buffer, mime: string, name = "receipt.png") =>
  api.post(`/line-items/${itemId}/receipts`).set(await authAs(who)).attach("file", content, { filename: name, contentType: mime });

describe("receipts", () => {
  it("upload, download and delete work for the owner, and the file is removed with it", async () => {
    const claim = await createClaimAs("asha.claimant", ["40.00"]);
    const itemId = claim.lineItems[0]!.id;

    const created = await upload("asha.claimant", itemId, PNG, "image/png");
    expect(created.status).toBe(201);
    // The stored file name is internal and never shown to the client
    expect(created.body.storedName).toBeUndefined();

    const stored = await prisma.receipt.findUniqueOrThrow({ where: { id: created.body.id }, select: { storedName: true } });
    const filePath = path.join(env.UPLOAD_DIR, stored.storedName);
    expect(existsSync(filePath)).toBe(true);

    const download = await api.get(`/receipts/${created.body.id}`).set(await authAs("asha.claimant"));
    expect(download.status).toBe(200);

    const removed = await api.delete(`/receipts/${created.body.id}`).set(await authAs("asha.claimant"));
    expect(removed.status).toBe(204);
    expect(existsSync(filePath)).toBe(false);
  });

  it("another claimant cannot upload to or download from someone else's claim (404)", async () => {
    const claim = await createClaimAs("asha.claimant", ["40.00"]);
    const itemId = claim.lineItems[0]!.id;
    const created = await upload("asha.claimant", itemId, PNG, "image/png");
    expect(created.status).toBe(201);

    const intruderUpload = await upload("bilal.claimant", itemId, PNG, "image/png");
    expect(intruderUpload.status).toBe(404);
    const intruderDownload = await api.get(`/receipts/${created.body.id}`).set(await authAs("bilal.claimant"));
    expect(intruderDownload.status).toBe(404);

    // Deleting the draft claim also removes its receipt file
    await api.delete(`/claims/${claim.id}`).set(await authAs("asha.claimant")).expect(204);
  });

  it("refuses a wrong type, a fake file, and a file over 5 MB, and leaves no file behind", async () => {
    const claim = await createClaimAs("asha.claimant", ["40.00"]);
    const itemId = claim.lineItems[0]!.id;
    const before = filesOnDisk();

    // Not an allowed type
    const wrongType = await upload("asha.claimant", itemId, Buffer.from("MZ"), "application/x-msdownload", "virus.exe");
    expect(wrongType.status).toBe(415);

    // Says PNG, but the content is text
    const fake = await upload("asha.claimant", itemId, Buffer.from("this is not a png"), "image/png");
    expect(fake.status).toBe(415);

    // Over the 5 MB cap
    const tooBig = await upload("asha.claimant", itemId, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), "image/png");
    expect(tooBig.status).toBe(413);

    expect(filesOnDisk()).toBe(before);
  });

  it("allows at most 5 receipts per line item", async () => {
    const claim = await createClaimAs("asha.claimant", ["40.00"]);
    const itemId = claim.lineItems[0]!.id;

    for (let i = 0; i < 5; i++) {
      const ok = await upload("asha.claimant", itemId, PNG, "image/png");
      expect(ok.status).toBe(201);
    }
    const sixth = await upload("asha.claimant", itemId, PNG, "image/png");
    expect(sixth.status).toBe(422);
    expect(sixth.body.error.code).toBe("RECEIPT_LIMIT_REACHED");

    // Deleting the draft claim removes the 5 files too
    await api.delete(`/claims/${claim.id}`).set(await authAs("asha.claimant")).expect(204);
  });
});

describe("claim history", () => {
  it("records the steps in order, and only the claim's own people can read it", async () => {
    // 15,000 needs two levels: Ravi (L1), then Meera (L2). The claim ends pending so it can be cleaned up.
    const claim = await createClaimAs("asha.claimant", ["15000.00"]);
    const asha = await authAs("asha.claimant");
    await api.post(`/claims/${claim.id}/submit`).set(asha).expect(200);
    await api.post(`/approvals/${await pendingStepOf(claim.id, "ravi.l1")}/approve`).set(await authAs("ravi.l1")).expect(200);

    const res = await api.get(`/claims/${claim.id}/history`).set(asha);
    expect(res.status).toBe(200);
    const actions = res.body.data.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(["CLAIM_CREATED", "CLAIM_SUBMITTED", "APPROVAL_GRANTED"]);

    // Names and roles only: no emails or ids of people
    expect(res.body.data[0].performedBy.email).toBeUndefined();

    // The claim's approver can read it; another claimant and the other approver chain cannot (404)
    const approver = await api.get(`/claims/${claim.id}/history`).set(await authAs("ravi.l1"));
    expect(approver.status).toBe(200);
    const otherClaimant = await api.get(`/claims/${claim.id}/history`).set(await authAs("bilal.claimant"));
    expect(otherClaimant.status).toBe(404);
    const otherApprover = await api.get(`/claims/${claim.id}/history`).set(await authAs("sana.l1"));
    expect(otherApprover.status).toBe(404);
  });
});
