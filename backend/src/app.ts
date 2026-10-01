import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

// Middleware
app.use(helmet()); // sets secure HTTP headers
app.use(cors()); // allows cross-origin requests from the frontend
app.use(express.json()); // parses JSON request bodies into req.body

// Routes
// Health check: lets Docker/monitoring confirm the API is up
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
