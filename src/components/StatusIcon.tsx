import { MessageLifecycleState } from '@signalix/contracts';

interface Props {
  state: string;
  light?: boolean;
}

export function StatusIcon({ state, light = false }: Props) {
  const c = light
    ? { read: 'text-white/80', tick: 'text-white/50', clock: 'text-white/30' }
    : { read: 'text-[#007aff] dark:text-white/70', tick: 'text-[#aeaeb2] dark:text-white/40', clock: 'text-[#c7c7cc] dark:text-white/20' };

  if (state === MessageLifecycleState.READ) {
    return <span title="Read" className={`inline-flex ${c.read}`}><DoubleCheckIcon /></span>;
  }
  if (state === MessageLifecycleState.DELIVERED) {
    return <span title="Delivered" className={`inline-flex ${c.tick}`}><DoubleCheckIcon /></span>;
  }
  if (state === MessageLifecycleState.SENT) {
    return <span title="Sent" className={`inline-flex ${c.tick}`}><SingleCheckIcon /></span>;
  }
  return <span title="Sending" className={`inline-flex ${c.clock}`}><ClockIcon /></span>;
}

function SingleCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2.5 8 6 11.5 13.5 4.5" />
    </svg>
  );
}

function DoubleCheckIcon() {
  return (
    <svg viewBox="0 0 20 16" className="w-4 h-3.5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 8 4.5 11.5 12 4.5" />
      <polyline points="8 8 11.5 11.5 19 4.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 5 8 8 10 9.5" />
    </svg>
  );
}
