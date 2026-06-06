'use client';

import { useEffect, useState, useTransition } from 'react';
import { ChatType, ParticipantRole, type ChatDTO } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { searchUsers } from '../lib/api-client';
import { Avatar } from './Avatar';

interface Props {
  chat: ChatDTO;
  currentUserId: string;
  onClose: () => void;
  onLeave?: () => void;
}

export function GroupInfoModal({ chat, currentUserId, onClose, onLeave }: Props) {
  const addGroupMembers = useChatStore((s) => s.addGroupMembers);
  const removeGroupMember = useChatStore((s) => s.removeGroupMember);
  const updateGroupChat = useChatStore((s) => s.updateGroupChat);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title ?? '');
  const [renaming_saving, setRenamingSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<import('@signalix/contracts').PublicUserDTO[]>([]);
  const [addSearched, setAddSearched] = useState(false);
  const [adding, startAdding] = useTransition();
  const [savingAdd, setSavingAdd] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<import('@signalix/contracts').PublicUserDTO[]>([]);

  const [removing, setRemoving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const myRole = chat.participants.find((p) => p.userId === currentUserId)?.role;
  const canManage = myRole === ParticipantRole.OWNER || myRole === ParticipantRole.ADMIN;

  const existingIds = new Set(chat.participants.map((p) => p.userId));

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setAddQuery(val);
    if (!val.trim()) { setAddResults([]); setAddSearched(false); return; }
    startAdding(async () => {
      try {
        const { users } = await searchUsers(val.trim());
        setAddResults(users.filter((u) => !existingIds.has(u.id)));
        setAddSearched(true);
      } catch {
        setAddResults([]);
        setAddSearched(true);
      }
    });
  }

  function toggleSelect(user: import('@signalix/contracts').PublicUserDTO) {
    setSelectedToAdd((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  async function handleAddMembers() {
    if (selectedToAdd.length === 0 || savingAdd) return;
    setSavingAdd(true);
    try {
      await addGroupMembers(chat.id, selectedToAdd.map((u) => u.id));
      setAddOpen(false);
      setAddQuery('');
      setAddResults([]);
      setSelectedToAdd([]);
    } catch { /* ignore */ }
    setSavingAdd(false);
  }

  async function handleRemove(userId: string) {
    if (removing) return;
    setRemoving(userId);
    try { await removeGroupMember(chat.id, userId); }
    catch { /* ignore */ }
    setRemoving(null);
  }

  async function handleLeave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await removeGroupMember(chat.id, currentUserId);
      onLeave?.();
    } catch {
      setLeaving(false);
    }
  }

  async function handleRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === chat.title || renaming_saving) return;
    setRenamingSaving(true);
    try {
      await updateGroupChat(chat.id, trimmed);
      setRenaming(false);
    } catch { /* ignore */ }
    setRenamingSaving(false);
  }

  if (chat.type !== ChatType.GROUP) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white/95 dark:bg-[#1c1c24]/95 backdrop-blur-2xl shadow-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-[#f2f2f7]/90 dark:bg-[#16161e]/80 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Hero */}
        <div className="flex flex-col items-center pt-10 pb-4 px-6 bg-gradient-to-b from-[#f2f2f7]/60 dark:from-[#16161e]/40 to-transparent flex-shrink-0">
          <Avatar name={chat.title ?? 'Group'} seed={chat.id} size="xl" />
          <div className="mt-3 text-center w-full">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                  className="flex-1 text-center text-[18px] font-bold bg-transparent border-b-2 border-[#007aff] dark:border-[#0a84ff] outline-none text-[#1d1d1f] dark:text-[#f5f5f7]"
                  maxLength={100}
                />
                <button onClick={() => void handleRename()} disabled={renaming_saving || !renameValue.trim()} className="text-[#007aff] dark:text-[#0a84ff] text-[13px] font-semibold disabled:opacity-40">Save</button>
                <button onClick={() => setRenaming(false)} className="text-[#8e8e93] text-[13px]">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{chat.title ?? 'Group'}</p>
                {canManage && (
                  <button onClick={() => { setRenameValue(chat.title ?? ''); setRenaming(true); }} className="text-[#007aff] dark:text-[#0a84ff] hover:opacity-70 transition-opacity">
                    <PencilIcon />
                  </button>
                )}
              </div>
            )}
            <p className="text-[13px] text-[#8e8e93] mt-0.5">{chat.participants.length} members</p>
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <p className="px-2 py-2 text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wide">Members</p>

          {chat.participants.map((p) => {
            const isMe = p.userId === currentUserId;
            const isOwner = p.role === ParticipantRole.OWNER;
            const name = p.user?.displayName ?? p.user?.username ?? 'Unknown';
            const canRemove = canManage && !isMe && !isOwner;
            return (
              <div key={p.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                <Avatar name={name} seed={p.userId} avatarUrl={p.user?.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{name}{isMe ? ' (you)' : ''}</p>
                  {p.user?.username && <p className="text-[12px] text-[#8e8e93] truncate">@{p.user.username}</p>}
                </div>
                {isOwner && (
                  <span className="text-[10px] font-semibold text-[#007aff] dark:text-[#0a84ff] bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10] px-2 py-0.5 rounded-full flex-shrink-0">Owner</span>
                )}
                {p.role === ParticipantRole.ADMIN && !isOwner && (
                  <span className="text-[10px] font-semibold text-[#8e8e93] bg-black/[0.06] dark:bg-white/[0.06] px-2 py-0.5 rounded-full flex-shrink-0">Admin</span>
                )}
                {canRemove && (
                  <button
                    onClick={() => void handleRemove(p.userId)}
                    disabled={removing === p.userId}
                    className="flex-shrink-0 p-1 text-red-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                    aria-label={`Remove ${name}`}
                  >
                    <RemoveIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add members section */}
        {canManage && (
          <div className="px-3 pb-2 border-t border-black/[0.06] dark:border-white/[0.06] flex-shrink-0">
            {addOpen ? (
              <div className="pt-3">
                <input
                  autoFocus
                  type="text"
                  value={addQuery}
                  onChange={handleSearchChange}
                  placeholder="Search users to add…"
                  className="w-full px-3 py-2 rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.05] dark:border-white/[0.06] text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] focus:outline-none"
                />
                {adding && <p className="text-[12px] text-[#aeaeb2] mt-1 px-1">Searching…</p>}
                {!adding && addSearched && addResults.length === 0 && (
                  <p className="text-[12px] text-[#aeaeb2] mt-1 px-1">No users found</p>
                )}
                <div className="mt-1 max-h-36 overflow-y-auto space-y-0.5">
                  {addResults.map((u) => {
                    const isSelected = selectedToAdd.some((s) => s.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleSelect(u)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'}`}
                      >
                        <Avatar name={u.displayName ?? u.username} seed={u.id} avatarUrl={u.avatarUrl} size="xs" />
                        <span className="text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{u.displayName ?? u.username}</span>
                        {isSelected && <span className="ml-auto text-[#007aff] dark:text-[#0a84ff]"><CheckIcon /></span>}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setAddOpen(false); setSelectedToAdd([]); setAddQuery(''); }} className="flex-1 py-2 rounded-xl text-[13px] text-[#8e8e93] bg-black/[0.04] dark:bg-white/[0.04]">Cancel</button>
                  <button
                    onClick={() => void handleAddMembers()}
                    disabled={selectedToAdd.length === 0 || savingAdd}
                    className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] disabled:opacity-40 transition-opacity"
                  >
                    {savingAdd ? 'Adding…' : `Add ${selectedToAdd.length > 0 ? `(${selectedToAdd.length})` : ''}`}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-3 text-[14px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/[0.06] rounded-xl transition-colors"
              >
                <PlusIcon />
                Add Members
              </button>
            )}
          </div>
        )}

        {/* Leave group */}
        <div className="px-3 pb-4 flex-shrink-0">
          <button
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[14px] font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 transition-colors"
          >
            <LeaveIcon />
            {leaving ? 'Leaving…' : 'Leave Group'}
          </button>
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11 2.5Z" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="8" x2="12" y2="8" />
      <circle cx="8" cy="8" r="6.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden="true">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
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

function LeaveIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.7]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 7l3 3-3 3" />
      <path d="M16 10H8" />
      <path d="M8 4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </svg>
  );
}
