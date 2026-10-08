import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { Role } from "../generated/prisma/enums";
import { loginSchema } from "../modules/auth/auth.schemas";

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
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

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

// --- Build the OpenAPI document once at startup ---
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "Expense Claims API", version: "1.0.0" },
  });
}
