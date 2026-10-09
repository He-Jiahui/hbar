/** Filesystem receipts and scope attribution supplement schema-23's rebuildable projections. */
export const CHAT_DATABASE_RESOURCE_SQL = `
  CREATE TABLE IF NOT EXISTS chat_database_resource_receipts(operationId TEXT NOT NULL,kind TEXT NOT NULL,targetId TEXT NOT NULL,dataJson TEXT NOT NULL,PRIMARY KEY(operationId,kind,targetId));
  CREATE TABLE IF NOT EXISTS chat_database_resource_pending(operationId TEXT NOT NULL,kind TEXT NOT NULL,targetId TEXT NOT NULL,dataJson TEXT NOT NULL,PRIMARY KEY(operationId,kind,targetId));
  CREATE TABLE IF NOT EXISTS chat_database_artifact_orphan_causes(artifactId TEXT NOT NULL,workspaceId TEXT NOT NULL,sessionId TEXT NOT NULL,operationId TEXT NOT NULL,lostAt INTEGER NOT NULL,PRIMARY KEY(artifactId,sessionId,operationId));
  CREATE INDEX IF NOT EXISTS chat_database_orphans_workspace ON chat_database_artifact_orphan_causes(workspaceId,artifactId);
  CREATE INDEX IF NOT EXISTS chat_database_orphans_session ON chat_database_artifact_orphan_causes(sessionId,artifactId);
  CREATE TRIGGER IF NOT EXISTS chat_database_orphan_new_reference AFTER INSERT ON chat_database_artifact_refs
  BEGIN DELETE FROM chat_database_artifact_orphan_causes WHERE artifactId=NEW.artifactId; END;
`
