import { z } from "zod";

// .strict() rejects unknown keys (mass-assignment protection); email is normalised so
// "Asha@Example.com " matches the stored lowercase address.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200), // max length avoids hashing huge inputs
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
