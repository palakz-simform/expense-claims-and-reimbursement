import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { Role } from "../generated/prisma/enums";
import { loginSchema } from "../modules/auth/auth.schemas";
import { claimIdParamsSchema, createClaimSchema, listClaimsQuerySchema } from "../modules/claims/claims.schemas";

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
  security: [{ [bearerAuth.name]: [] }],
  request: { params: claimIdParamsSchema },
  responses: {
    200: { description: "The claim with its line items and computed total", content: { "application/json": { schema: claimResponseSchema } } },
    400: errorResponse("VALIDATION_ERROR (id is not a UUID)"),
    401: errorResponse("Missing, invalid or expired token"),
    403: errorResponse("Not a CLAIMANT"),
    404: errorResponse("No such claim, or it belongs to someone else"),
  },
});

// --- Build the OpenAPI document once at startup ---
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "Expense Claims API", version: "1.0.0" },
  });
}
