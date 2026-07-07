import { handlers } from "@/lib/auth";

// Node runtime: credential checks run scrypt via node:crypto.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
