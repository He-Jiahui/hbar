import { ObservedChat as Fixture } from './observed-chat'
import type { ReferenceFixtureProps } from '../../reference-types'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-5. */
export default function AiChat5(props: ReferenceFixtureProps) {
  return <Fixture {...props} variant="ai-chat-5" />
}
