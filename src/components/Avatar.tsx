import { getInitials, getAvatarColor } from '../lib/avatar';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
} as const;

interface Props {
  name: string;
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, seed, size = 'md', className = '' }: Props) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white select-none flex-shrink-0 ${SIZES[size]} ${className}`}
      style={{ backgroundColor: getAvatarColor(seed) }}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
}
