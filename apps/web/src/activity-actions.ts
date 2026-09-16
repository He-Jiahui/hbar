import { createActivityModel } from './activity-model'
import { useConnection, useWorkbench } from './stores'
import { translate } from './locale'
import { getActivityCopy } from './activity-locale'
export const activityModel = createActivityModel({
  identity: () => useConnection.getState().client,
  resetError: () => getActivityCopy(useWorkbench.getState().locale).resync,
  async follow(sessionId, cursor) {
    const connection = useConnection.getState().client
    if (!connection) throw new Error(translate(useWorkbench.getState().locale, 'hostDisconnected'))
    return connection.call('session.follow', { sessionId, cursor })
  },
})
