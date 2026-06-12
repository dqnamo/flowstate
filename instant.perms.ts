// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  projects: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.ownerId",
    },
  },
  githubInstallations: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  codingAgents: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.ownerId",
    },
  },
  agentAuthSecrets: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  runs: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.ownerId",
    },
  },
  events: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.ownerId",
    },
  },
  codeChanges: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.ownerId",
    },
  },
} satisfies InstantRules;

export default rules;
