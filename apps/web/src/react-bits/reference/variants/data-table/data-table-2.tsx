import { DataTableObserved as Fixture } from './data-table-observed'
import type { ReferenceFixtureProps } from '../../reference-types'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/data-table/data-table-2. */
export default function DataTable2(props: ReferenceFixtureProps) {
  return <Fixture {...props} variant="data-table-2" />
}
