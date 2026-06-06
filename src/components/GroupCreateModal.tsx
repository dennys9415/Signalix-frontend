'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PublicUserDTO } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { searchUsers } from '../lib/api-client';
import { Avatar } from './Avatar';

interface Props {
  currentUserId: string;
  onCreated: (chatId: string) => void;
  onClose: () => void;
}

export function GroupCreateModal({ currentUserId, onCreated, onClose }: Props) {
  const createGroupChat = useChatStore((s) => s.createGroupChat);

  const [step, setStep] = useState<'members' | 'name'>('members');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const [selectedMembers, setSelectedMembers] = useState<PublicUserDTO[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) { setResults([]); setSearched(false); return; }
    startSearch(async () => {
      try {
        const { users } = await searchUsers(val.trim());
        setResults(users.filter((u) => u.id !== currentUserId));
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
    });
  }

  function toggleMember(user: PublicUserDTO) {
    setSelectedMembers((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  async function handleCreate() {
    const trimmedName = groupName.trim();
    if (!trimmedName || selectedMembers.length < 2 || creating) return;
    setError('');
    setCreating(true);
    try {
      const chatId = await createGroupChat(trimmedName, selectedMembers.map((u) => u.id));
      onCreated(chatId);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create group');
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white/95 dark:bg-[#1c1c24]/95 backdrop-blur-2xl shadow-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <p className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">New Group</p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#f2f2f7]/90 dark:bg-[#16161e]/80 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {step === 'members' ? (
          <>
            {/* Member search */}
            <div className="px-4 pb-2 flex-shrink-0">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={handleSearchChange}
                placeholder="Search people to add…"
                className="w-full px-3 py-2 rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.05] dark:border-white/[0.06] text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] focus:outline-none"
              />
            </div>

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-2 flex-shrink-0">
                {selectedMembers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleMember(u)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#007aff]/[0.10] dark:bg-[#0a84ff]/[0.12] text-[#007aff] dark:text-[#0a84ff] text-[12px] font-medium"
                  >
                    <span>{u.displayName ?? u.username}</span>
                    <XSmallIcon />
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {searching && <p className="text-[12px] text-[#aeaeb2] px-2 py-2">Searching…</p>}
              {!searching && searched && results.length === 0 && (
                <p className="text-[12px] text-[#aeaeb2] px-2 py-4 text-center">No users found</p>
              )}
              {results.map((u) => {
                const isSelected = selectedMembers.some((s) => s.id === u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleMember(u)}
                    className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left transition-colors ${isSelected ? 'bg-[#007aff]/[0.07] dark:bg-[#0a84ff]/[0.09]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'}`}
                  >
                    <Avatar name={u.displayName ?? u.username} seed={u.id} avatarUrl={u.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{u.displayName ?? u.username}</p>
                      <p className="text-[12px] text-[#8e8e93] truncate">@{u.username}</p>
                    </div>
                    {isSelected && <span className="text-[#007aff] dark:text-[#0a84ff] flex-shrink-0"><CheckIcon /></span>}
                  </button>
                );
              })}
            </div>

            {/* Next button */}
            <div className="px-4 pb-5 flex-shrink-0">
              <p className="text-[12px] text-[#8e8e93] text-center mb-2">
                Select at least 2 members · {selectedMembers.length} selected
              </p>
              <button
                onClick={() => setStep('name')}
                disabled={selectedMembers.length < 2}
                className="w-full py-3 rounded-2xl text-[15px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] disabled:opacity-40 transition-opacity"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Group name step */}
            <div className="px-4 pb-3 flex-1">
              {/* Selected members preview */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {selectedMembers.map((u) => (
                  <div key={u.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 text-[12px] text-[#6e6e73] dark:text-[#8e8e93]">
                    <Avatar name={u.displayName ?? u.username} seed={u.id} avatarUrl={u.avatarUrl} size="xs" />
                    <span>{u.displayName ?? u.username}</span>
                  </div>
                ))}
              </div>

              <label className="block text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wide mb-1.5">Group Name</label>
              <input
                autoFocus
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="e.g. Team Alpha"
                maxLength={100}
                className="w-full px-3 py-2.5 rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.05] dark:border-white/[0.06] text-[15px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
              {error && <p className="text-[12px] text-red-500 mt-1.5">{error}</p>}
            </div>

            <div className="flex gap-2 px-4 pb-5 flex-shrink-0">
              <button
                onClick={() => setStep('members')}
                className="flex-1 py-3 rounded-2xl text-[15px] font-medium text-[#007aff] dark:text-[#0a84ff] bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10] transition-opacity"
              >
                Back
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={!groupName.trim() || creating}
                className="flex-1 py-3 rounded-2xl text-[15px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] disabled:opacity-40 transition-opacity"
              >
                {creating ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </>
        )}
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

function XSmallIcon() {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="3" x2="9" y2="9" />
      <line x1="9" y1="3" x2="3" y2="9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 8 6.5 12 13 4" />
    </svg>
  );
}
