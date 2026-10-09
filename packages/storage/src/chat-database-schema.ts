import {
  chatDatabaseProjectionSources,
  chatDatabaseRecordValues,
  chatDatabaseReferenceStatements,
  chatDatabaseSqlExpression,
  CHAT_DATABASE_USAGE_CONFLICT,
} from './chat-database-sources'
import { CHAT_DATABASE_ARTIFACT_SQL } from './chat-database-artifact-schema'
import { CHAT_DATABASE_RESOURCE_SQL } from './chat-database-resource-schema'

const recordTriggers = chatDatabaseProjectionSources
  .map((source) => {
    const remove = `DELETE FROM chat_database_usage_records WHERE source='${source.source}' AND recordId=${chatDatabaseSqlExpression(source.id, 'OLD')};
    DELETE FROM chat_database_artifact_refs WHERE source='${source.source}' AND ownerId=${chatDatabaseSqlExpression(source.id, 'OLD')};`
    const insert = `${
      source.usage
        ? `INSERT INTO chat_database_usage_records(source,recordId,sessionId,messageCount,contentBytes,payloadBytes,activityAt)
    VALUES(${chatDatabaseRecordValues(source, 'NEW')}) ${CHAT_DATABASE_USAGE_CONFLICT};`
        : ''
    }
    ${source.json
      .flatMap((json) => chatDatabaseReferenceStatements(source, 'NEW', json, '', ''))
      .map((sql) => `${sql};`)
      .join('\n')}`
    return `CREATE TRIGGER IF NOT EXISTS chat_database_${source.source}_insert AFTER INSERT ON ${source.table} BEGIN ${insert} END;
    CREATE TRIGGER IF NOT EXISTS chat_database_${source.source}_update AFTER UPDATE ON ${source.table} BEGIN ${remove} ${insert} END;
    CREATE TRIGGER IF NOT EXISTS chat_database_${source.source}_delete AFTER DELETE ON ${source.table} BEGIN ${remove} END;`
  })
  .join('\n')

/** Version 23 installs bounded projections and journals for resumable maintenance. */
export const CHAT_DATABASE_SQL = `
  CREATE TABLE IF NOT EXISTS chat_database_usage(sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    messageCount INTEGER NOT NULL DEFAULT 0,contentBytes INTEGER NOT NULL DEFAULT 0,
    logicalBytes INTEGER NOT NULL DEFAULT 0,lastActivityAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_usage_records(source TEXT NOT NULL,recordId TEXT NOT NULL,
    sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,messageCount INTEGER NOT NULL,
    contentBytes INTEGER NOT NULL,payloadBytes INTEGER NOT NULL,activityAt INTEGER NOT NULL,PRIMARY KEY(source,recordId));
  CREATE INDEX IF NOT EXISTS chat_database_usage_records_session ON chat_database_usage_records(sessionId);
  CREATE INDEX IF NOT EXISTS chat_database_logs_session ON session_log_files(sessionId,path);
  CREATE TABLE IF NOT EXISTS chat_database_backfill(source TEXT PRIMARY KEY,afterId TEXT,complete INTEGER NOT NULL DEFAULT 0);
  ${chatDatabaseProjectionSources.map((source) => `INSERT OR IGNORE INTO chat_database_backfill(source) VALUES('${source.source}');`).join('\n')}
  CREATE TABLE IF NOT EXISTS chat_database_artifact_refs(source TEXT NOT NULL,ownerId TEXT NOT NULL,artifactId TEXT NOT NULL,
    sessionId TEXT REFERENCES sessions(id) ON DELETE CASCADE,workspaceId TEXT,deviceId TEXT,PRIMARY KEY(source,ownerId,artifactId));
  CREATE INDEX IF NOT EXISTS chat_database_artifact_refs_artifact ON chat_database_artifact_refs(artifactId);
  CREATE INDEX IF NOT EXISTS chat_database_artifact_refs_session ON chat_database_artifact_refs(sessionId,artifactId);
  CREATE INDEX IF NOT EXISTS chat_database_artifact_refs_workspace ON chat_database_artifact_refs(workspaceId,artifactId);
  CREATE TABLE IF NOT EXISTS chat_database_artifact_state(artifactId TEXT PRIMARY KEY,createdAt INTEGER NOT NULL,
    lastUploadedAt INTEGER NOT NULL,legacyProtected INTEGER NOT NULL DEFAULT 0,claimOperationId TEXT);
  CREATE TABLE IF NOT EXISTS chat_database_draft_owners(deviceId TEXT NOT NULL,ownerId TEXT NOT NULL,revision INTEGER NOT NULL,
    stateJson TEXT NOT NULL,updatedAt INTEGER NOT NULL,PRIMARY KEY(deviceId,ownerId));
  CREATE TABLE IF NOT EXISTS chat_database_device_inventories(deviceId TEXT PRIMARY KEY,complete INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
  INSERT OR IGNORE INTO chat_database_device_inventories SELECT id,0,0 FROM devices;
  CREATE TABLE IF NOT EXISTS chat_database_previews(id TEXT PRIMARY KEY,actorId TEXT NOT NULL,scopeJson TEXT NOT NULL,
    policyRevisionsJson TEXT NOT NULL,kind TEXT NOT NULL,createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,summaryJson TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_preview_items(previewId TEXT NOT NULL REFERENCES chat_database_previews(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,kind TEXT NOT NULL,targetId TEXT NOT NULL,expectedSeq INTEGER,dataJson TEXT NOT NULL,PRIMARY KEY(previewId,position));
  CREATE TABLE IF NOT EXISTS chat_database_operations(id TEXT PRIMARY KEY,actorId TEXT NOT NULL,idempotencyKey TEXT NOT NULL,
    requestHash TEXT NOT NULL,scopeJson TEXT NOT NULL,dataJson TEXT NOT NULL,updatedAt INTEGER NOT NULL,UNIQUE(actorId,idempotencyKey));
  CREATE INDEX IF NOT EXISTS chat_database_operations_updated ON chat_database_operations(updatedAt DESC,id);
  CREATE TABLE IF NOT EXISTS chat_database_deleted_sessions(sessionId TEXT PRIMARY KEY,operationId TEXT NOT NULL,deletedAt INTEGER NOT NULL,dataJson TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_database_schedule_runtime(scopeKey TEXT PRIMARY KEY,scopeJson TEXT NOT NULL,policyRevisionsJson TEXT NOT NULL,
    lastDueAt INTEGER,pendingDueAt INTEGER,lastCapacityAt INTEGER,lastOperationId TEXT,lastResultJson TEXT,updatedAt INTEGER NOT NULL);
  CREATE TRIGGER IF NOT EXISTS chat_database_session_insert AFTER INSERT ON sessions BEGIN
    INSERT INTO chat_database_usage(sessionId,lastActivityAt) SELECT NEW.id,NEW.createdAt
      WHERE NOT EXISTS(SELECT 1 FROM chat_database_usage WHERE sessionId=NEW.id);
  END;
  CREATE TRIGGER IF NOT EXISTS chat_database_usage_record_insert AFTER INSERT ON chat_database_usage_records BEGIN
    INSERT INTO chat_database_usage(sessionId,lastActivityAt) SELECT id,createdAt FROM sessions WHERE id=NEW.sessionId
      AND NOT EXISTS(SELECT 1 FROM chat_database_usage WHERE sessionId=NEW.sessionId);
    UPDATE chat_database_usage SET messageCount=messageCount+NEW.messageCount,contentBytes=contentBytes+NEW.contentBytes,
      logicalBytes=logicalBytes+NEW.payloadBytes,lastActivityAt=MAX(lastActivityAt,NEW.activityAt) WHERE sessionId=NEW.sessionId;
  END;
  CREATE TRIGGER IF NOT EXISTS chat_database_usage_record_delete AFTER DELETE ON chat_database_usage_records BEGIN
    UPDATE chat_database_usage SET messageCount=messageCount-OLD.messageCount,contentBytes=contentBytes-OLD.contentBytes,
      logicalBytes=logicalBytes-OLD.payloadBytes WHERE sessionId=OLD.sessionId;
  END;
  CREATE TRIGGER IF NOT EXISTS chat_database_usage_record_update AFTER UPDATE ON chat_database_usage_records BEGIN
    UPDATE chat_database_usage SET messageCount=messageCount-OLD.messageCount,contentBytes=contentBytes-OLD.contentBytes,
      logicalBytes=logicalBytes-OLD.payloadBytes WHERE sessionId=OLD.sessionId;
    INSERT INTO chat_database_usage(sessionId,lastActivityAt) SELECT id,createdAt FROM sessions WHERE id=NEW.sessionId
      AND NOT EXISTS(SELECT 1 FROM chat_database_usage WHERE sessionId=NEW.sessionId);
    UPDATE chat_database_usage SET messageCount=messageCount+NEW.messageCount,contentBytes=contentBytes+NEW.contentBytes,
      logicalBytes=logicalBytes+NEW.payloadBytes,lastActivityAt=MAX(lastActivityAt,NEW.activityAt) WHERE sessionId=NEW.sessionId;
  END;
  ${recordTriggers}
  ${CHAT_DATABASE_ARTIFACT_SQL}
  ${CHAT_DATABASE_RESOURCE_SQL}
`
