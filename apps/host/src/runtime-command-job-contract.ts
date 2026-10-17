import {
  commandJobIdentitySchema,
  commandJobWatchSchema,
  commandJobReadSchema,
  commandJobChunkSchema,
  commandJobSnapshotSchema,
} from '@hbar/commands/jobs'

export const RUNTIME_COMMAND_JOB_CONTROLS = [
  'command.jobs.get',
  'command.jobs.read',
  'command.jobs.cancel',
  'command.jobs.acknowledge',
]
export const RUNTIME_COMMAND_JOB_SCHEMAS = [
  commandJobIdentitySchema,
  commandJobWatchSchema,
  commandJobReadSchema,
  commandJobChunkSchema,
  commandJobSnapshotSchema,
]
