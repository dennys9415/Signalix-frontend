import { MessageLifecycleState } from '@signalix/contracts';

interface Props {
  state: string;
}

export function StatusIcon({ state }: Props) {
  if (state === MessageLifecycleState.READ) {
    return <span className="text-indigo-400 text-xs" title="Read">✓✓</span>;
  }
  if (state === MessageLifecycleState.DELIVERED) {
    return <span className="text-gray-400 text-xs" title="Delivered">✓✓</span>;
  }
  if (state === MessageLifecycleState.SENT) {
    return <span className="text-gray-400 text-xs" title="Sent">✓</span>;
  }
  // CREATED / pending
  return <span className="text-gray-600 text-xs" title="Sending">○</span>;
}
