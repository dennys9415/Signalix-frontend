interface Props {
  online: boolean;
  className?: string;
}

export function PresenceIndicator({ online, className = '' }: Props) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-gray-600'} ${className}`}
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}
