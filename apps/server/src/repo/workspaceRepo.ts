import Database from "better-sqlite3";
import {
  applyWorkspaceOp,
  createEmptyWorkspaceDoc,
  parseWorkspaceDoc,
  stableStringify,
  type WorkspaceDoc,
  type WorkspaceOp,
} from "@gm/shared";
import { createOpRepo } from "./opRepo";

export type WorkspaceRepo = ReturnType<typeof createWorkspaceRepo>;

export type WorkspaceAcl = {
  workspaceId: string;
  ownerId: string;
  editors: string[];
  viewers: string[];
};

export function createWorkspaceRepo(opts: { dbPath: string }) {
  const db = new Database(opts.dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      doc_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_acl (
      workspace_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      editors_json TEXT NOT NULL,
      viewers_json TEXT NOT NULL
    );
  `);

  const stmtInsert = db.prepare(
    `INSERT INTO workspaces (workspace_id, version, created_at, updated_at, doc_json)
     VALUES (@workspace_id, @version, @created_at, @updated_at, @doc_json)`
  );

  const stmtGet = db.prepare(
    `SELECT doc_json FROM workspaces WHERE workspace_id = ?`
  );
  const stmtGetVersion = db.prepare(
    `SELECT version, doc_json FROM workspaces WHERE workspace_id = ?`
  );

  const stmtUpdate = db.prepare(
    `UPDATE workspaces
     SET version = @version, updated_at = @updated_at, doc_json = @doc_json
     WHERE workspace_id = @workspace_id`
  );

  const opRepo = createOpRepo(db);

  const stmtInsertAcl = db.prepare(
    `INSERT INTO workspace_acl (workspace_id, owner_id, editors_json, viewers_json)
     VALUES (@workspace_id, @owner_id, @editors_json, @viewers_json)`
  );

  const stmtGetAcl = db.prepare(
    `SELECT owner_id, editors_json, viewers_json FROM workspace_acl WHERE workspace_id = ?`
  );

  function createWorkspace(args: {
    workspaceId: string;
    now: string;
    ownerId: string;
  }): { workspaceId: string; doc: WorkspaceDoc } {
    const doc = createEmptyWorkspaceDoc({
      workspaceId: args.workspaceId,
      now: args.now,
    });
    return createWorkspaceWithDoc({
      workspaceId: args.workspaceId,
      now: args.now,
      ownerId: args.ownerId,
      doc,
    });
  }

  function createWorkspaceWithDoc(args: {
    workspaceId: string;
    now: string;
    ownerId: string;
    doc: WorkspaceDoc;
  }): { workspaceId: string; doc: WorkspaceDoc } {
    const doc: WorkspaceDoc = {
      ...args.doc,
      workspaceId: args.workspaceId,
      version: 0,
      createdAt: args.now,
      updatedAt: args.now,
      selection: [],
    };
    const docJson = stableStringify(doc);
    stmtInsert.run({
      workspace_id: args.workspaceId,
      version: doc.version,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt,
      doc_json: docJson,
    });
    stmtInsertAcl.run({
      workspace_id: args.workspaceId,
      owner_id: args.ownerId,
      editors_json: JSON.stringify([]),
      viewers_json: JSON.stringify([]),
    });
    return { workspaceId: args.workspaceId, doc };
  }

  function getWorkspace(workspaceId: string): WorkspaceDoc | null {
    const row = stmtGet.get(workspaceId) as { doc_json: string } | undefined;
    if (!row) return null;
    return parseWorkspaceDoc(row.doc_json);
  }

  function getWorkspaceAcl(workspaceId: string): WorkspaceAcl | null {
    const row = stmtGetAcl.get(workspaceId) as
      | { owner_id: string; editors_json: string; viewers_json: string }
      | undefined;
    if (!row) return null;
    return {
      workspaceId,
      ownerId: row.owner_id,
      editors: JSON.parse(row.editors_json) as string[],
      viewers: JSON.parse(row.viewers_json) as string[],
    };
  }

  function canEditWorkspace(acl: WorkspaceAcl, viewerId: string): boolean {
    if (viewerId === acl.ownerId) return true;
    return acl.editors.includes(viewerId);
  }

  function saveWorkspace(args: {
    workspaceId: string;
    expectedVersion: number;
    doc: WorkspaceDoc;
    now: string;
  }):
    | { type: "ok"; saved: WorkspaceDoc }
    | { type: "not_found" }
    | { type: "version_conflict"; current: WorkspaceDoc } {
    const row = stmtGetVersion.get(args.workspaceId) as
      | { version: number; doc_json: string }
      | undefined;
    if (!row) return { type: "not_found" };

    if (row.version !== args.expectedVersion) {
      return {
        type: "version_conflict",
        current: parseWorkspaceDoc(row.doc_json),
      };
    }

    const saved: WorkspaceDoc = {
      ...args.doc,
      version: row.version + 1,
      updatedAt: args.now,
    };
    const docJson = stableStringify(saved);
    stmtUpdate.run({
      workspace_id: args.workspaceId,
      version: saved.version,
      updated_at: saved.updatedAt,
      doc_json: docJson,
    });
    return { type: "ok", saved };
  }

  function applyAndAppendOp(args: {
    workspaceId: string;
    op: WorkspaceOp;
    now: string;
  }):
    | { type: "ok"; serverSeq: number; doc: WorkspaceDoc; op: WorkspaceOp }
    | { type: "not_found" } {
    const current = getWorkspace(args.workspaceId);
    if (!current) return { type: "not_found" };

    const updated = applyWorkspaceOp(current, args.op);
    const appended = opRepo.appendOp({
      workspaceId: args.workspaceId,
      op: args.op,
      createdAt: args.now,
    });

    // Persist snapshot every op for now (simple); later we can compact every N ops.
    const saved: WorkspaceDoc = {
      ...updated,
      version: appended.serverSeq,
      updatedAt: args.now,
    };

    stmtUpdate.run({
      workspace_id: args.workspaceId,
      version: saved.version,
      updated_at: saved.updatedAt,
      doc_json: stableStringify(saved),
    });

    return {
      type: "ok",
      serverSeq: appended.serverSeq,
      doc: saved,
      op: appended.op,
    };
  }

  function getOpsSince(workspaceId: string, afterSeq: number) {
    return opRepo.getOpsSince(workspaceId, afterSeq);
  }

  function getLatestSeq(workspaceId: string) {
    return opRepo.getLatestSeq(workspaceId);
  }

  return {
    createWorkspace,
    createWorkspaceWithDoc,
    getWorkspace,
    getWorkspaceAcl,
    canEditWorkspace,
    saveWorkspace,
    applyAndAppendOp,
    getOpsSince,
    getLatestSeq,
  };
}
