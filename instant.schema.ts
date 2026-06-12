// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    projects: i.entity({
      ownerId: i.string().indexed(),
      name: i.string().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().optional(),
      githubInstallationId: i.string().indexed().optional(),
      githubRepositoryId: i.string().indexed().optional(),
      githubRepositoryName: i.string().optional(),
      githubRepositoryFullName: i.string().indexed().optional(),
      githubRepositoryUrl: i.string().optional(),
      branch: i.string().optional(),
    }),
    githubInstallations: i.entity({
      ownerId: i.string().indexed(),
      installationId: i.string().indexed(),
      ownerInstallationKey: i.string().unique().indexed(),
      createdAt: i.date().optional(),
      updatedAt: i.date().optional(),
    }),
    codingAgents: i.entity({
      ownerId: i.string().indexed(),
      provider: i.string().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().optional(),
      deviceAuthUrl: i.string().optional(),
      deviceAuthCode: i.string().optional(),
      deviceAuthStartedAt: i.date().optional(),
      deviceAuthCompletedAt: i.date().optional(),
      setupError: i.string().optional(),
    }),
    agentAuthSecrets: i.entity({
      ownerId: i.string().indexed(),
      valueEncrypted: i.string(),
      createdAt: i.date().optional(),
    }),
    runs: i.entity({
      ownerId: i.string().indexed(),
      prompt: i.string(),
      status: i.string().indexed(),
      createdAt: i.date().optional(),
      completedAt: i.date().optional(),
      responseText: i.string().optional(),
      previewCommand: i.string().optional(),
      previewPort: i.number().optional(),
      previewBaseUrl: i.string().optional(),
      branchName: i.string().optional(),
      pullRequestUrl: i.string().optional(),
      pullRequestNumber: i.number().optional(),
      sandboxId: i.string().optional(),
      parentRunId: i.string().indexed().optional(),
      feedbackRunId: i.string().optional(),
      reviewSubmittedAt: i.date().optional(),
      error: i.string().optional(),
    }),
    events: i.entity({
      ownerId: i.string().indexed(),
      scope: i.string().indexed(),
      sequence: i.number().indexed(),
      type: i.string().indexed(),
      raw: i.string().optional(),
      payload: i.json().optional(),
      createdAt: i.date().optional(),
    }),
    codeChanges: i.entity({
      ownerId: i.string().indexed(),
      title: i.string(),
      summary: i.string().optional(),
      files: i.json().optional(),
      previewPath: i.string().optional(),
      diff: i.string().optional(),
      status: i.string().indexed().optional(),
      comment: i.string().optional(),
      reviewedAt: i.date().optional(),
      commentedAt: i.date().optional(),
      createdAt: i.date().optional(),
    }),
  },
  links: {
    $streams$files: {
      forward: {
        on: "$streams",
        has: "many",
        label: "$files",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "$stream",
        onDelete: "cascade",
      },
    },
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    projectOwner: {
      forward: {
        on: "projects",
        has: "one",
        label: "owner",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "projects",
      },
    },
    projectCodingAgents: {
      forward: {
        on: "projects",
        has: "many",
        label: "codingAgents",
      },
      reverse: {
        on: "codingAgents",
        has: "one",
        label: "project",
        onDelete: "cascade",
      },
    },
    codingAgentAuthSecrets: {
      forward: {
        on: "codingAgents",
        has: "one",
        label: "authSecret",
      },
      reverse: {
        on: "agentAuthSecrets",
        has: "one",
        label: "codingAgent",
        onDelete: "cascade",
      },
    },
    projectRuns: {
      forward: {
        on: "projects",
        has: "many",
        label: "runs",
      },
      reverse: {
        on: "runs",
        has: "one",
        label: "project",
        onDelete: "cascade",
      },
    },
    runCodeChanges: {
      forward: {
        on: "runs",
        has: "many",
        label: "codeChanges",
      },
      reverse: {
        on: "codeChanges",
        has: "one",
        label: "run",
        onDelete: "cascade",
      },
    },
    runTimeline: {
      forward: {
        on: "runs",
        has: "many",
        label: "events",
      },
      reverse: {
        on: "events",
        has: "one",
        label: "run",
        onDelete: "cascade",
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
