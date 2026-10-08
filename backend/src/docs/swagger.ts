import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./openapi";

// Interactive API docs at /docs, raw spec at /openapi.json
export function createDocsRouter() {
  const router = Router();
  const document = buildOpenApiDocument();

  router.get("/openapi.json", (_req, res) => {
    res.json(document);
  });
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(document, { swaggerOptions: { persistAuthorization: true } }));

  return router;
}
