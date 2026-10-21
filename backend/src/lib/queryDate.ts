import { z } from "zod";

// A calendar day (YYYY-MM-DD) from a query string, as midnight UTC. A real date is required (2026-02-30 is rejected).
export const queryDateSchema = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));
