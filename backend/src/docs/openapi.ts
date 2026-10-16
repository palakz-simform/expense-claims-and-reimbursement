import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { Role } from "../generated/prisma/enums";
import { approvalIdParamsSchema, listApprovalsQuerySchema, rejectApprovalSchema } from "../modules/approvals/approvals.schemas";
import { loginSchema } from "../modules/auth/auth.schemas";
import {
  claimIdParamsSchema,
  createClaimSchema,
  lineItemParamsSchema,
  lineItemSchema,
  listClaimsQuerySchema,
  updateClaimSchema,
  updateLineItemSchema,
} from "../modules/claims/claims.schemas";

// Concept: single source of truth. Request bodies reuse the real Zod schemas the controllers
// validate with, so the docs cannot drift from the code. Only responses are described here.
const registry = new OpenAPIRegistry();

// --- Security scheme: JWT in the Authorization header (the "Authorize" button in the UI) ---
const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// --- Shared response shapes ---
// `requestId` matches the X-Request-Id response header and the server log line for that request.
// `details` appears on validation errors only: one entry per invalid field.
const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z
      .array(z.object({ in: z.enum(["body", "query", "params"]), path: z.string(), message: z.string() }))
      .optional(),
  }),
});

const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum(Object.values(Role) as [Role, ...Role[]]),
  approvalLevel: z.number().int().nullable(),
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorSchema } },
});

// --- Routes (add each new module's paths here as it is built) ---
registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness check",
  responses: {
    200: {
      description: "API is up",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in with email and password",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    200: {
      description: "Signed JWT and the user",
      content: { "application/json": { schema: z.object({ token: z.string(), user: userSchema }) } },
    },
    400: errorResponse("VALIDATION_ERROR or INVALID_JSON"),
    401: errorResponse("INVALID_CREDENTIALS (same error for wrong email and wrong password)"),
    429: errorResponse("Too many login attempts (rate limited)"),
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Current user",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "The authenticated user", content: { "application/json": { schema: z.object({ user: userSchema }) } } },
    401: errorResponse("Missing, invalid or expired token"),
  },
});

// --- Claims ---
// Money is a string with 2 decimals (never a JSON number); the total is computed by the database, never accepted as input.
const claimResponseSchema = z.object({
  id: z.string(),
  claimNumber: z.number().int(),
  title: z.string(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "REJECTED", "APPROVED"]),
  total: z.string(),
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lineItems: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      category: z.string(),
      amount: z.string(),
      description: z.string(),
    }),
  ),
});

registry.registerPath({
  method: "post",
  path: "/claims",
  tags: ["Claims"],
  summary: "Create a draft claim with 0 to 100 line items (CLAIMANT only)",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createClaimSchema } } } },
  responses: {
    201: { description: "The new draft claim with its computed total", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (including unknown fields such as `total`)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
  },
});

// GET /claims/{id} also says why the claim was last rejected (kept after a resubmit; null if never rejected)
const claimWithRejectionSchema = claimResponseSchema.extend({
  lastRejection: z
    .object({
      reason: z.string().nullable(),
      level: z.number().int(),
      rejectedAt: z.string().nullable(),
      rejectedBy: z.string(),
    })
    .nullable(),
});

// A claim in a list: no line items, just how many there are
const claimSummarySchema = claimResponseSchema.omit({ lineItems: true }).extend({ lineItemCount: z.number().int() });

registry.registerPath({
  method: "get",
  path: "/claims",
  tags: ["Claims"],
  summary: "List your own claims, newest first, one page at a time (CLAIMANT only)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listClaimsQuerySchema },
  responses: {
    200: {
      description: "One page of claims (without line items) and the pagination info",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(claimSummarySchema),
            pagination: z.object({
              page: z.number().int(),
              pageSize: z.number().int(),
              totalItems: z.number().int(),
              totalPages: z.number().int(),
            }),
          }),
        },
      },
    },
    400: errorResponse("VALIDATION_ERROR (page below 1, pageSize above 100, unknown query field)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
  },
});

registry.registerPath({
  method: "get",
  path: "/claims/{id}",
  tags: ["Claims"],
  summary: "Get one of your own claims (CLAIMANT only)",
  description:
    "lastRejection is set whenever the claim has ever been rejected (even after a resubmit), and null otherwise.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: claimIdParamsSchema },
  responses: {
    200: { description: "The claim with its line items, computed total and last rejection", content: { "application/json": { schema: claimWithRejectionSchema } } },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/claims/{id}",
  tags: ["Claims"],
  summary: "Change your claim's title (any status except APPROVED; the total does not change, so no approval reset)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: claimIdParamsSchema,
    body: { content: { "application/json": { schema: updateClaimSchema } } },
  },
  responses: {
    200: { description: "The updated claim", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (missing or blank title, unknown field such as `status` or `total`)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
    409: errorResponse("CLAIM_LOCKED (approved)"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/claims/{id}",
  tags: ["Claims"],
  summary: "Delete your DRAFT claim and its line items (a submitted claim can never be deleted)",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: claimIdParamsSchema },
  responses: {
    204: { description: "Deleted (no body)" },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
    409: errorResponse("CLAIM_NOT_DELETABLE (submitted: pending or rejected) or CLAIM_LOCKED (approved)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/claims/{id}/submit",
  tags: ["Claims"],
  summary: "Submit your DRAFT claim for approval (builds the approval chain from its total)",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: claimIdParamsSchema },
  responses: {
    200: { description: "The claim, now PENDING_APPROVAL with submittedAt set", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
    409: errorResponse("CLAIM_NOT_SUBMITTABLE (not a draft) or CLAIM_LOCKED (approved)"),
    422: errorResponse("NO_LINE_ITEMS (nothing to approve) or NO_APPROVER_AVAILABLE (no valid approver at a required level)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/claims/{id}/resubmit",
  tags: ["Claims"],
  summary: "Send your REJECTED claim back to approval (starts a new approval chain)",
  description:
    "The claim returns to PENDING_APPROVAL and a new chain starts from level 1 with the same approvers. Earlier approvals, the rejection and the original submittedAt are kept; the resubmit is recorded in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: claimIdParamsSchema },
  responses: {
    200: { description: "The claim, now PENDING_APPROVAL", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
    409: errorResponse("CLAIM_NOT_RESUBMITTABLE (not rejected) or CLAIM_LOCKED (approved)"),
    422: errorResponse("NO_LINE_ITEMS (the claim has no items) or NO_APPROVER_AVAILABLE (no valid approver at a required level)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/claims/{id}/line-items",
  tags: ["Claims"],
  summary: "Add ONE line item to your claim (any status except APPROVED)",
  description:
    "On a claim awaiting approval, a changed total voids every approval so far: the approval chain restarts from level 1 (same approvers, new chainVersion). Edits to a submitted claim are recorded in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: claimIdParamsSchema,
    body: { content: { "application/json": { schema: lineItemSchema } } },
  },
  responses: {
    201: { description: "The claim with the added item and recomputed total", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (bad item, unknown field)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
    409: errorResponse("CLAIM_LOCKED (approved)"),
    422: errorResponse("LINE_ITEM_LIMIT_REACHED (the claim already has 100 items)"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/claims/{id}/line-items/{itemId}",
  tags: ["Claims"],
  summary: "Change some fields of ONE line item (any status except APPROVED)",
  description:
    "On a claim awaiting approval, a changed total (not a description, date or category change) voids every approval so far: the approval chain restarts from level 1 (same approvers, new chainVersion). Edits to a submitted claim are recorded in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: lineItemParamsSchema,
    body: { content: { "application/json": { schema: updateLineItemSchema } } },
  },
  responses: {
    200: { description: "The claim with the changed item and recomputed total", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (empty body, bad value, unknown field)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim or line item, or the claim belongs to someone else"),
    409: errorResponse("CLAIM_LOCKED (approved)"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/claims/{id}/line-items/{itemId}",
  tags: ["Claims"],
  summary: "Remove ONE line item (any status except APPROVED)",
  description:
    "On a claim awaiting approval, removing an item changes the total, so the approval chain restarts from level 1 (same approvers, new chainVersion). The last item of a claim awaiting approval cannot be removed. Edits to a submitted claim are recorded in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: lineItemParamsSchema },
  responses: {
    200: { description: "The claim without that item and with the recomputed total", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (an id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim or line item, or the claim belongs to someone else"),
    409: errorResponse("CLAIM_LOCKED (approved)"),
    422: errorResponse("NO_LINE_ITEMS (it is the last item of a claim awaiting approval)"),
  },
});

// --- Approvals ---
// One approval is one approver's step in a claim's chain. The queue lists only the steps that wait for the caller now.
const approvalQueueItemSchema = z.object({
  id: z.string(),
  level: z.number().int(),
  status: z.literal("PENDING"),
  claim: z.object({
    id: z.string(),
    claimNumber: z.number().int(),
    title: z.string(),
    total: z.string(),
    submittedAt: z.string().nullable(),
    claimantName: z.string(),
  }),
});

registry.registerPath({
  method: "get",
  path: "/approvals",
  tags: ["Approvals"],
  summary: "Your approval queue: the steps waiting for YOUR decision now, oldest submission first (APPROVER only)",
  description:
    "A level-2 step appears only after level 1 has approved. A step that was voided (the claim was edited or rejected) or already decided is not listed. You only ever see your own steps.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listApprovalsQuerySchema },
  responses: {
    200: {
      description: "One page of pending approvals, each with a summary of its claim, and the pagination info",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(approvalQueueItemSchema),
            pagination: z.object({
              page: z.number().int(),
              pageSize: z.number().int(),
              totalItems: z.number().int(),
              totalPages: z.number().int(),
            }),
          }),
        },
      },
    },
    400: errorResponse("VALIDATION_ERROR (page below 1, pageSize above 100, unknown query field)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not an APPROVER"),
  },
});

registry.registerPath({
  method: "post",
  path: "/approvals/{id}/approve",
  tags: ["Approvals"],
  summary: "Approve your step of a claim's approval chain (APPROVER only)",
  description:
    "If a higher level exists, its step becomes PENDING and the claim stays PENDING_APPROVAL. If this was the last level, the claim becomes APPROVED (and locked). Both are recorded in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: approvalIdParamsSchema },
  responses: {
    200: {
      description: "The decided step and the claim's status after it",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            level: z.number().int(),
            status: z.literal("APPROVED"),
            decidedAt: z.string(),
            claim: z.object({
              id: z.string(),
              status: z.enum(["PENDING_APPROVAL", "APPROVED"]),
              approvedAt: z.string().nullable(),
            }),
          }),
        },
      },
    },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not an APPROVER"),
    404: errorResponse("No such approval, or it belongs to another approver"),
    409: errorResponse("APPROVAL_NOT_PENDING (already decided, not your turn yet, or voided because the claim changed)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/approvals/{id}/reject",
  tags: ["Approvals"],
  summary: "Reject your step of a claim's approval chain, with a reason (APPROVER only)",
  description:
    "The claim becomes REJECTED and goes back to the claimant, who can edit it. Approvals already granted stay as they were; the open steps (waiting or pending) become INVALIDATED. The reason is stored on the step and in the claim history.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: approvalIdParamsSchema,
    body: { content: { "application/json": { schema: rejectApprovalSchema } } },
  },
  responses: {
    200: {
      description: "The decided step, the reason, and the claim's new status",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            level: z.number().int(),
            status: z.literal("REJECTED"),
            decidedAt: z.string(),
            reason: z.string(),
            claim: z.object({ id: z.string(), status: z.literal("REJECTED") }),
          }),
        },
      },
    },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID, reason missing or blank or over 500 characters, unknown field)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not an APPROVER"),
    404: errorResponse("No such approval, or it belongs to another approver"),
    409: errorResponse("APPROVAL_NOT_PENDING (already decided, not your turn yet, or voided because the claim changed)"),
  },
});

// --- Build the OpenAPI document once at startup ---
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "Expense Claims API", version: "1.0.0" },
  });
}
