import { createChatDatabaseCommands, createChatDatabaseStatisticsService, createChatDatabaseMaintenanceService,
  createChatDatabaseArtifactReferenceService, createChatDatabaseResourceService, createChatDatabaseDatabaseService,
  createChatDatabaseScheduler, type SettingsService } from '@hbar/kernel/maintenance'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import { createChatDatabaseFileScanner } from '@hbar/storage'

/** Compatibility composition for explicitly embedded Kernels. Production supplies the owned Maintenance port. */
export function createChatDatabaseHostController(kernel: KernelControllerPort, settings: SettingsService) {
  const statistics = createChatDatabaseStatisticsService(kernel.storage, settings, createChatDatabaseFileScanner(kernel.options.layout))
  const artifacts = createChatDatabaseArtifactReferenceService(kernel.storage, kernel.options.layout.settings)
  const resources = createChatDatabaseResourceService(kernel.storage, kernel.options.layout, artifacts, {
    protectedRoots: () => kernel.plugins.protectedResourceRoots(), remove: input => kernel.removeChatDatabaseResource(input),
  })
  const database = createChatDatabaseDatabaseService(kernel.storage, kernel.options.layout, {
    idle: () => kernel.chatDatabaseIsIdle(), maintain: action => kernel.maintainChatDatabase(action),
  })
  const maintenance = createChatDatabaseMaintenanceService(kernel.storage, settings, statistics, {
    protection: id => kernel.chatDatabaseSessionProtection(id), removeSession: input => kernel.removeChatDatabaseSession(input),
    deleted: (ids, revision) => kernel.notifyChatDatabaseDeleted(ids, revision),
  }, resources, database)
  const scheduler = createChatDatabaseScheduler(kernel.storage, settings, statistics, maintenance)
  const commands = createChatDatabaseCommands(statistics, maintenance, artifacts, scheduler)
  return { ...commands, async dispose() {
    commands.dispose(); await scheduler.close(); await maintenance.close(); await artifacts.close(); await statistics.close()
  } }
}
