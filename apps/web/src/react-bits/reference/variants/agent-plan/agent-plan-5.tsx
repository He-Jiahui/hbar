import { PlanObserved as Fixture } from './plan-observed'
import type { ReferenceFixtureProps } from '../../reference-types'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-plan/agent-plan-5. */
export default function AgentPlan5(props: ReferenceFixtureProps) {
  return <Fixture {...props} variant="agent-plan-5" />
}
