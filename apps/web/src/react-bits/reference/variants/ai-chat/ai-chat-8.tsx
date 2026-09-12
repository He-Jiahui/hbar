import { ObservedChat as Fixture } from './observed-chat'
import type { ReferenceFixtureProps } from '../../reference-types'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-8. */
export default function AiChat8(props: ReferenceFixtureProps) {
  return <Fixture {...props} variant="ai-chat-8" />
}
