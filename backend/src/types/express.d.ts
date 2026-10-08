import type { Role } from "../generated/prisma/enums";

// The user attached to the request by `authenticate` (never includes the password hash)
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  approvalLevel: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
