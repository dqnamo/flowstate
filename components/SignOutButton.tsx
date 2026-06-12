"use client";

import { Button } from "@/components/Button";
import db from "@/lib/db";

export default function SignOutButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        void db.auth.signOut();
      }}
    >
      Sign out
    </Button>
  );
}
