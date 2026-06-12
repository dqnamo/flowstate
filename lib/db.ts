import { init } from "@instantdb/react";
import schema from "@/instant.schema";

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!appId) {
  throw new Error("Missing NEXT_PUBLIC_INSTANT_APP_ID");
}

const db = init({ appId, schema });

export default db;
