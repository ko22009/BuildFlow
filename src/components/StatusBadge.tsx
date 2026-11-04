import { STATUS_LABEL, STATUS_TONE, type Status } from '../lib/status'

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge s-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
}
