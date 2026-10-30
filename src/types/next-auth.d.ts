import type { GlobalRole } from "@/lib/constants";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: GlobalRole;
    };
  }

  interface User {
    id: string;
    role: GlobalRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: GlobalRole;
  }
}
