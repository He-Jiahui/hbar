/** Idempotent completion of the artifact portion of the planned schema-23 migration. */
export const CHAT_DATABASE_ARTIFACT_SQL = `
CREATE TABLE IF NOT EXISTS chat_database_device_inventory_proofs (
  deviceId TEXT PRIMARY KEY,
  legacyRequired INTEGER NOT NULL
);
  CREATE TABLE IF NOT EXISTS chat_database_inventory_syncs(deviceId TEXT PRIMARY KEY,inventoryId TEXT NOT NULL,manifestJson TEXT NOT NULL,revision INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_reference_health(id INTEGER PRIMARY KEY CHECK(id=1),draftJournalComplete INTEGER NOT NULL DEFAULT 0,legacySettingsComplete INTEGER NOT NULL DEFAULT 0);
  INSERT OR IGNORE INTO chat_database_reference_health(id) VALUES(1);
  CREATE TABLE IF NOT EXISTS chat_database_event_reference_health(id INTEGER PRIMARY KEY CHECK(id=1),complete INTEGER NOT NULL DEFAULT 1);
  INSERT OR IGNORE INTO chat_database_event_reference_health(id) VALUES(1);
  CREATE TABLE IF NOT EXISTS chat_database_artifact_tombstones(artifactId TEXT PRIMARY KEY,operationId TEXT NOT NULL,deletedAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_artifact_reclaims(operationId TEXT NOT NULL,artifactId TEXT NOT NULL,reclaimedBytes INTEGER NOT NULL,completedAt INTEGER NOT NULL,PRIMARY KEY(operationId,artifactId));
  CREATE TABLE IF NOT EXISTS chat_database_upload_leases(leaseId TEXT PRIMARY KEY,artifactId TEXT NOT NULL,expiresAt INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS chat_database_upload_leases_artifact ON chat_database_upload_leases(artifactId,expiresAt);
  CREATE TABLE IF NOT EXISTS chat_database_upload_reference_revisions(deviceId TEXT NOT NULL,ownerId TEXT NOT NULL,artifactId TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(deviceId,ownerId,artifactId));
  CREATE TABLE IF NOT EXISTS chat_database_artifact_metadata_revisions(artifactId TEXT PRIMARY KEY,revision INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_upload_candidates(artifactId TEXT PRIMARY KEY,dataJson TEXT NOT NULL,deviceId TEXT NOT NULL,replacesOperationId TEXT);
  CREATE TRIGGER IF NOT EXISTS chat_database_reference_claim_guard BEFORE INSERT ON chat_database_artifact_refs
  WHEN EXISTS(SELECT 1 FROM chat_database_artifact_state state WHERE state.artifactId=NEW.artifactId AND state.claimOperationId IS NOT NULL)
  BEGIN SELECT RAISE(ABORT,'CHAT_DATABASE_ARTIFACT_CLAIMED'); END;
  CREATE TRIGGER IF NOT EXISTS chat_database_reference_missing_guard BEFORE INSERT ON chat_database_artifact_refs
  WHEN NEW.source!='upload' AND EXISTS(SELECT 1 FROM chat_database_artifact_tombstones WHERE artifactId=NEW.artifactId)
  BEGIN SELECT RAISE(ABORT,'CHAT_DATABASE_ARTIFACT_DELETED'); END;
`
