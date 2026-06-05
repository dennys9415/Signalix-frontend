'use client';

import { useEffect } from 'react';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { formatLastSeen } from '../lib/presence';

interface Props {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null | undefined;
  isOnline: boolean;
  lastSeenAt?: string;
  onClose: () => void;
}

export function ContactProfileModal({ userId, displayName, username, avatarUrl, isOnline, lastSeenAt, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[300px] rounded-3xl bg-white/95 dark:bg-[#1c1c24]/95 backdrop-blur-2xl shadow-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-[#f2f2f7]/90 dark:bg-[#16161e]/80 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pt-10 pb-5 px-6 bg-gradient-to-b from-[#f2f2f7]/60 dark:from-[#16161e]/40 to-transparent">
          <div className="relative">
            <Avatar name={displayName} seed={userId} avatarUrl={avatarUrl} size="xl" />
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white/80 dark:ring-[#1c1c24]/80">
              <PresenceIndicator online={isOnline} />
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-8 text-center">
          <p className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{displayName}</p>
          <p className="text-[13px] text-[#8e8e93] truncate mt-0.5">@{username}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <PresenceIndicator online={isOnline} size="sm" />
            <span className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93]'}`}>
              {isOnline ? 'Online' : formatLastSeen(lastSeenAt)}
            </span>
          </div>
          <p className="text-[10px] text-[#c7c7cc] dark:text-[#3c3c44] mt-3 font-mono select-all leading-relaxed break-all">{userId}</p>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[2.5]" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}
