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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[300px] rounded-3xl bg-white/75 dark:bg-[#1f1f28]/75 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/55 dark:bg-white/[0.06] text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pt-10 pb-5 px-6 bg-gradient-to-b from-white/30 dark:from-white/[0.03] to-transparent">
          <div className="relative">
            <Avatar name={displayName} seed={userId} avatarUrl={avatarUrl} size="xl" />
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white/70 dark:ring-[#1f1f28]/70">
              <PresenceIndicator online={isOnline} />
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-8 text-center">
          <p className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{displayName}</p>
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] truncate mt-0.5">@{username}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <PresenceIndicator online={isOnline} size="sm" />
            <span className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>
              {isOnline ? 'Online' : formatLastSeen(lastSeenAt)}
            </span>
          </div>
          <p className="text-[10px] text-[#aeaeb2] dark:text-[#5a5a65] mt-3 font-mono select-all leading-relaxed break-all">{userId}</p>
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
