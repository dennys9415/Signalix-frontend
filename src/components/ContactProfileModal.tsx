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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pt-10 pb-6 px-6 bg-gradient-to-b from-indigo-50 dark:from-indigo-950/30 to-transparent">
          <div className="relative">
            <Avatar name={displayName} seed={userId} size="xl" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-zinc-900`}
            >
              <PresenceIndicator online={isOnline} />
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-8 text-center space-y-1">
          <p className="text-lg font-bold text-gray-900 dark:text-zinc-100 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">@{username}</p>
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <PresenceIndicator online={isOnline} size="sm" />
            <span className={`text-xs font-medium ${isOnline ? 'text-emerald-500' : 'text-gray-400 dark:text-zinc-500'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-[10px] text-gray-300 dark:text-zinc-700 pt-2 font-mono select-all">{userId}</p>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}
