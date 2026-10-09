const byteLength = (value: string) => `length(CAST(COALESCE(${value},'') AS BLOB))`
export interface ChatDatabaseProjectionSource {
  readonly source: string
  readonly table: string
  readonly id: string
  readonly session: string
  readonly workspace: string
  readonly content: string
  readonly payload: string
  readonly activity: string
  readonly messages: number
  readonly json: readonly string[]
  readonly usage: boolean
}
export const chatDatabaseProjectionSources: readonly ChatDatabaseProjectionSource[] = [
  {
    source: 'message',
    table: 'messages',
    id: 'item.id',
    session: 'item.sessionId',
    workspace: '(SELECT workspaceId FROM sessions WHERE id=item.sessionId)',
    content: byteLength('item.content'),
    payload: `${byteLength('item.content')}+${byteLength('item.providerData')}`,
    activity: 'item.createdAt',
    messages: 1,
    json: ['item.content', 'item.providerData'],
    usage: true,
  },
  {
    source: 'event',
    table: 'events',
    id: 'item.eventId',
    session: 'item.sessionId',
    workspace: '(SELECT workspaceId FROM sessions WHERE id=item.sessionId)',
    content: '0',
    payload: byteLength('item.data'),
    activity:
      "CASE WHEN item.type='message.committed' OR item.type LIKE 'run.%' OR item.type LIKE 'user_input.%' THEN item.time ELSE 0 END",
    messages: 0,
    json: ['item.data'],
    usage: true,
  },
  {
    source: 'run',
    table: 'runs',
    id: 'item.id',
    session: 'item.sessionId',
    workspace: '(SELECT workspaceId FROM sessions WHERE id=item.sessionId)',
    content: '0',
    payload: `${byteLength('item.input')}+${byteLength('item.error')}+${byteLength('item.failure')}`,
    activity: 'MAX(item.createdAt,COALESCE(item.startedAt,0),COALESCE(item.endedAt,0))',
    messages: 0,
    json: ['item.input'],
    usage: true,
  },
  {
    source: 'approval',
    table: 'approvals',
    id: 'item.id',
    session: 'item.sessionId',
    workspace: '(SELECT workspaceId FROM sessions WHERE id=item.sessionId)',
    content: '0',
    payload: `${byteLength('item.args')}+${byteLength('item.feedback')}`,
    activity: '0',
    messages: 0,
    json: ['item.args'],
    usage: true,
  },
  {
    source: 'compaction',
    table: 'compactions',
    id: "item.sessionId||':'||item.eventSeq",
    session: 'item.sessionId',
    workspace: '(SELECT workspaceId FROM sessions WHERE id=item.sessionId)',
    content: '0',
    payload: byteLength('item.summary'),
    activity: '0',
    messages: 0,
    json: [],
    usage: true,
  },
  {
    source: 'settings',
    table: 'settings_layers',
    id: 'item.id',
    session: "CASE WHEN item.kind='session' THEN item.targetId END",
    workspace:
      "CASE WHEN item.kind='workspace' THEN item.targetId WHEN item.kind='session' THEN (SELECT workspaceId FROM sessions WHERE id=item.targetId) END",
    content: '0',
    payload: '0',
    activity: '0',
    messages: 0,
    json: ['item.valuesJson'],
    usage: false,
  },
  {
    source: 'schedule',
    table: 'schedules',
    id: 'item.id',
    session: 'NULL',
    workspace: 'item.workspaceId',
    content: '0',
    payload: '0',
    activity: '0',
    messages: 0,
    json: ['item.data'],
    usage: false,
  },
]
export const chatDatabaseSqlExpression = (value: string, owner: string) => value.replaceAll('item.', `${owner}.`)
export function chatDatabaseRecordValues(source: ChatDatabaseProjectionSource, owner: string): string {
  return `'${source.source}',${chatDatabaseSqlExpression(source.id, owner)},${chatDatabaseSqlExpression(source.session, owner)},${source.messages},
    ${chatDatabaseSqlExpression(source.content, owner)},${chatDatabaseSqlExpression(source.payload, owner)},${chatDatabaseSqlExpression(source.activity, owner)}`
}
export const CHAT_DATABASE_USAGE_CONFLICT = `ON CONFLICT(source,recordId) DO UPDATE SET sessionId=excluded.sessionId,messageCount=excluded.messageCount,
  contentBytes=excluded.contentBytes,payloadBytes=excluded.payloadBytes,activityAt=excluded.activityAt`

/** Only schema-shaped ArtifactRefs and theme asset IDs count as references. */
export function chatDatabaseReferenceStatements(
  source: ChatDatabaseProjectionSource,
  owner: string,
  json: string,
  from: string,
  where: string,
): readonly string[] {
  const value = chatDatabaseSqlExpression(json, owner)
  const object = "CASE WHEN tree.type='object' THEN tree.value ELSE '{}' END"
  const id = `json_extract(${object},'$.id')`
  const session = chatDatabaseSqlExpression(source.session, owner)
  const workspace = chatDatabaseSqlExpression(source.workspace, owner)
  const ownerId = chatDatabaseSqlExpression(source.id, owner)
  const tree = `json_tree(CASE WHEN json_valid(${value}) THEN ${value} ELSE '{}' END) tree`
  return [
    `INSERT INTO chat_database_artifact_refs(source,ownerId,artifactId,sessionId,workspaceId,deviceId)
     SELECT DISTINCT '${source.source}',${ownerId},${id},${session},${workspace},NULL FROM ${from}${tree}
     WHERE ${where} tree.type='object' AND json_type(${object},'$.id')='text'
       AND length(${id})=64 AND ${id} NOT GLOB '*[^a-f0-9]*'
       AND json_type(${object},'$.mime')='text' AND json_type(${object},'$.name')='text'
       AND json_type(${object},'$.size') IN ('integer','real')
       AND NOT EXISTS(SELECT 1 FROM chat_database_artifact_refs existing
         WHERE existing.source='${source.source}' AND existing.ownerId=${ownerId} AND existing.artifactId=${id})`,
    `INSERT INTO chat_database_artifact_refs(source,ownerId,artifactId,sessionId,workspaceId,deviceId)
     SELECT DISTINCT '${source.source}',${ownerId},tree.value,${session},${workspace},NULL FROM ${from}${tree}
     WHERE ${where} tree.key='backgroundAsset' AND tree.type='text'
       AND length(tree.value)=64 AND tree.value NOT GLOB '*[^a-f0-9]*'
       AND NOT EXISTS(SELECT 1 FROM chat_database_artifact_refs existing
         WHERE existing.source='${source.source}' AND existing.ownerId=${ownerId} AND existing.artifactId=tree.value)`,
  ]
}
