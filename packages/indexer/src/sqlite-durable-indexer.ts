import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  LocalDurableIndexer,
  type IndexerSnapshot,
} from "./local-durable-indexer.js";
import type {
  AttesterRecordView,
  AuthorityRotationEvent,
  IdentityStateView,
  IngestResult,
  LocalReceiptRecord,
  ProgramBackedReputationView,
} from "./types.js";

const CREATE_SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS indexer_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const READ_SNAPSHOT_SQL = "SELECT payload FROM indexer_snapshot WHERE id = 1";
const WRITE_SNAPSHOT_SQL = `
  INSERT INTO indexer_snapshot (id, payload, updated_at)
  VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`;
const CLEAR_SNAPSHOT_SQL = "DELETE FROM indexer_snapshot WHERE id = 1";

export interface SqliteDurableIndexerOptions {
  readonly path: string;
  readonly reset?: boolean;
}

const toLocalReceiptRecord = (
  receipt: IndexerSnapshot["receipts"][number],
): LocalReceiptRecord => ({
  receiptId: receipt.receiptId,
  slot: receipt.slot,
  taskId: receipt.taskId,
  actorId: receipt.actorId,
  kind: receipt.kind,
  domain: receipt.domain,
  payload: { ...receipt.payload },
});

export class SqliteDurableIndexer extends LocalDurableIndexer {
  private readonly database: DatabaseSync;

  constructor(options: SqliteDurableIndexerOptions) {
    super();

    mkdirSync(dirname(options.path), { recursive: true });
    this.database = new DatabaseSync(options.path);
    this.database.exec(CREATE_SNAPSHOT_TABLE_SQL);

    if (options.reset) {
      this.database.prepare(CLEAR_SNAPSHOT_SQL).run();
      return;
    }

    const snapshot = this.readSnapshot();
    if (snapshot) {
      this.restoreSnapshot(snapshot);
    }
  }

  close(): void {
    this.database.close();
  }

  override saveSnapshot(path: string): void {
    super.saveSnapshot(path);
    this.persistSnapshot();
  }

  override ingest(receipts: readonly LocalReceiptRecord[]): IngestResult {
    const result = super.ingest(receipts);
    this.persistOnAcceptedWrites(result);
    return result;
  }

  override ingestAuthorityRotations(
    authorityRotations: readonly AuthorityRotationEvent[],
  ): IngestResult {
    const result = super.ingestAuthorityRotations(authorityRotations);
    this.persistOnAcceptedWrites(result);
    return result;
  }

  override ingestIdentityStates(
    identityStates: readonly IdentityStateView[],
  ): IngestResult {
    const result = super.ingestIdentityStates(identityStates);
    this.persistOnAcceptedWrites(result);
    return result;
  }

  override ingestAttesterRecords(
    attesterRecords: readonly AttesterRecordView[],
  ): IngestResult {
    const result = super.ingestAttesterRecords(attesterRecords);
    this.persistOnAcceptedWrites(result);
    return result;
  }

  override ingestProgramReputations(
    reputations: readonly ProgramBackedReputationView[],
  ): IngestResult {
    const result = super.ingestProgramReputations(reputations);
    this.persistOnAcceptedWrites(result);
    return result;
  }

  private persistOnAcceptedWrites(result: IngestResult): void {
    if (result.accepted > 0) {
      this.persistSnapshot();
    }
  }

  private persistSnapshot(): void {
    this.database
      .prepare(WRITE_SNAPSHOT_SQL)
      .run(JSON.stringify(this.snapshot()), new Date().toISOString());
  }

  private readSnapshot(): IndexerSnapshot | null {
    const row = this.database.prepare(READ_SNAPSHOT_SQL).get() as
      | { payload?: string }
      | undefined;
    if (!row?.payload) {
      return null;
    }
    return JSON.parse(row.payload) as IndexerSnapshot;
  }

  private restoreSnapshot(snapshot: IndexerSnapshot): void {
    const restoredSnapshot =
      LocalDurableIndexer.fromSnapshot(snapshot).snapshot();
    if (restoredSnapshot.receipts.length > 0) {
      super.ingest(restoredSnapshot.receipts.map(toLocalReceiptRecord));
    }
    if (restoredSnapshot.authorityRotations?.length) {
      super.ingestAuthorityRotations(restoredSnapshot.authorityRotations);
    }
    if (restoredSnapshot.identityStates?.length) {
      super.ingestIdentityStates(restoredSnapshot.identityStates);
    }
    if (restoredSnapshot.attesterRecords?.length) {
      super.ingestAttesterRecords(restoredSnapshot.attesterRecords);
    }
    if (restoredSnapshot.programReputations?.length) {
      super.ingestProgramReputations(restoredSnapshot.programReputations);
    }
  }
}
