import { id, init } from "@instantdb/admin";
import schema from "@/instant.schema";

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;

if (!appId) {
  throw new Error("Missing NEXT_PUBLIC_INSTANT_APP_ID");
}

if (!adminToken) {
  throw new Error("Missing INSTANT_APP_ADMIN_TOKEN");
}

const adminDb = init({ appId, adminToken, schema });

export { id };
export default adminDb;
