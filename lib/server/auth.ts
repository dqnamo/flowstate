import type { User } from "@instantdb/admin";
import adminDb from "@/lib/server/admin-db";

export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    return await adminDb.auth.verifyToken(token);
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
}
