import { ApprovalObserved as Fixture } from './approval-observed'
import type { ReferenceFixtureProps } from '../../reference-types'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-approval/agent-approval-3. */
export default function AgentApproval3(props: ReferenceFixtureProps) {
  return <Fixture {...props} variant="agent-approval-3" />
}
