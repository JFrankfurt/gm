import Database from 'better-sqlite3';
import { type WorkspaceOp, zWorkspaceOp } from '@gm/shared';

export type OpRepo = ReturnType<typeof createOpRepo>;

export function createOpRepo(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_ops (
      workspace_id TEXT NOT NULL,
      server_seq INTEGER NOT NULL,
      op_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, server_seq)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_ops_workspace_id ON workspace_ops(workspace_id);
  `);

  const stmtGetLatestSeq = db.prepare(
    `SELECT server_seq FROM workspace_ops WHERE workspace_id = ? ORDER BY server_seq DESC LIMIT 1`,
  );

  const stmtInsertOp = db.prepare(
    `INSERT INTO workspace_ops (workspace_id, server_seq, op_json, created_at)
     VALUES (@workspace_id, @server_seq, @op_json, @created_at)`,
  );

  const stmtGetOpsSince = db.prepare(
    `SELECT server_seq, op_json FROM workspace_ops
     WHERE workspace_id = ? AND server_seq > ?
     ORDER BY server_seq ASC`,
  );

  function getLatestSeq(workspaceId: string): number {
    const row = stmtGetLatestSeq.get(workspaceId) as { server_seq: number } | undefined;
    return row?.server_seq ?? 0;
  }

  function appendOp(args: { workspaceId: string; op: WorkspaceOp; createdAt: string }): { serverSeq: number; op: WorkspaceOp } {
    // Server assigns monotonic seq per workspace.
    const serverSeq = getLatestSeq(args.workspaceId) + 1;
    // Validate shape defensively before persisting.
    const parsed = zWorkspaceOp.parse(args.op);
    stmtInsertOp.run({
      workspace_id: args.workspaceId,
      server_seq: serverSeq,
      op_json: JSON.stringify(parsed),
      created_at: args.createdAt,
    });
    return { serverSeq, op: parsed };
  }

  function getOpsSince(workspaceId: string, afterSeq: number): Array<{ serverSeq: number; op: WorkspaceOp }> {
    const rows = stmtGetOpsSince.all(workspaceId, afterSeq) as Array<{ server_seq: number; op_json: string }>;
    return rows.map((r) => ({ serverSeq: r.server_seq, op: zWorkspaceOp.parse(JSON.parse(r.op_json)) }));
  }

  return { getLatestSeq, appendOp, getOpsSince };
}
