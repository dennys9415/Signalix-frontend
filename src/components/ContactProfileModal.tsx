'use client';

import { useEffect } from 'react';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';

interface Props {
  userId: string;
  displayName: string;
  username: string;
  isOnline: boolean;
  onClose: () => void;
}

export function ContactProfileModal({ userId, displayName, username, isOnline, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[300px] rounded-3xl bg-white dark:bg-[#2c2c2e] shadow-2xl border border-gray-100/80 dark:border-[#48484a] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-[#f2f2f7] dark:bg-[#3a3a3c] text-[#8e8e93] hover:text-[#636366] dark:hover:text-[#aeaeb2] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pt-10 pb-5 px-6 bg-gradient-to-b from-[#f2f2f7] dark:from-[#3a3a3c]/40 to-transparent">
          <div className="relative">
            <Avatar name={displayName} seed={userId} size="xl" />
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-[#2c2c2e]">
              <PresenceIndicator online={isOnline} />
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-8 text-center">
          <p className="text-[18px] font-bold text-[#1c1c1e] dark:text-[#f5f5f7] truncate">{displayName}</p>
          <p className="text-[13px] text-[#8e8e93] truncate mt-0.5">@{username}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <PresenceIndicator online={isOnline} size="sm" />
            <span className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93]'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-[10px] text-[#c7c7cc] dark:text-[#636366] mt-3 font-mono select-all leading-relaxed break-all">{userId}</p>
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
