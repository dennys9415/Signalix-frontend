interface Props {
  online: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function PresenceIndicator({ online, className = '', size = 'sm' }: Props) {
  const dim = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';
  return (
    <span
      className={`inline-block ${dim} rounded-full flex-shrink-0 ${
        online
          ? 'bg-emerald-400 shadow-[0_0_0_1.5px_rgba(52,211,153,0.3)]'
          : 'bg-zinc-500 dark:bg-zinc-600'
      } ${className}`}
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}
