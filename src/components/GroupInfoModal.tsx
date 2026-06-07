'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChatType, ParticipantRole, type ChatDTO, type PublicUserDTO } from '@signalix/contracts';
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
  const uploadGroupAvatar = useChatStore((s) => s.uploadGroupAvatar);
  const removeGroupAvatar = useChatStore((s) => s.removeGroupAvatar);
  const transferGroupOwnership = useChatStore((s) => s.transferGroupOwnership);

  // Title editing
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title ?? '');
  const [renaming_saving, setRenamingSaving] = useState(false);

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(chat.description ?? '');
  const [descSaving, setDescSaving] = useState(false);

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Add members
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<PublicUserDTO[]>([]);
  const [addSearched, setAddSearched] = useState(false);
  const [adding, startAdding] = useTransition();
  const [savingAdd, setSavingAdd] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<PublicUserDTO[]>([]);

  // Per-member actions
  const [removing, setRemoving] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [memberMenuFor, setMemberMenuFor] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const myRole = chat.participants.find((p) => p.userId === currentUserId)?.role;
  const isOwner = myRole === ParticipantRole.OWNER;
  const canManage = isOwner || myRole === ParticipantRole.ADMIN;

  const existingIds = new Set(chat.participants.map((p) => p.userId));

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function handler(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarMenuOpen]);

  // Re-sync local edit buffers when the chat prop refreshes from the store
  // (e.g. another admin renamed the group while this modal was open).
  useEffect(() => {
    if (!renaming) setRenameValue(chat.title ?? '');
  }, [chat.title, renaming]);
  useEffect(() => {
    if (!editingDesc) setDescValue(chat.description ?? '');
  }, [chat.description, editingDesc]);

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

  function toggleSelect(user: PublicUserDTO) {
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
    setMemberMenuFor(null);
    setRemoving(userId);
    try { await removeGroupMember(chat.id, userId); }
    catch { /* ignore */ }
    setRemoving(null);
  }

  async function handleTransfer(userId: string) {
    if (transferring) return;
    setMemberMenuFor(null);
    setTransferring(userId);
    try { await transferGroupOwnership(chat.id, userId); }
    catch { /* ignore */ }
    setTransferring(null);
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
      await updateGroupChat(chat.id, { title: trimmed });
      setRenaming(false);
    } catch { /* ignore */ }
    setRenamingSaving(false);
  }

  async function handleDescriptionSave() {
    const trimmed = descValue.trim();
    if (trimmed === (chat.description ?? '') || descSaving) {
      setEditingDesc(false);
      return;
    }
    setDescSaving(true);
    try {
      await updateGroupChat(chat.id, { description: trimmed === '' ? null : trimmed });
      setEditingDesc(false);
    } catch { /* ignore */ }
    setDescSaving(false);
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await uploadGroupAvatar(chat.id, file);
    } catch (err) {
      setAvatarError((err as Error).message ?? 'Could not upload avatar.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarMenuOpen(false);
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await removeGroupAvatar(chat.id);
    } catch (err) {
      setAvatarError((err as Error).message ?? 'Could not remove avatar.');
    } finally {
      setAvatarBusy(false);
    }
  }

  if (chat.type !== ChatType.GROUP) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white/75 dark:bg-[#1f1f28]/75 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/55 dark:bg-white/[0.06] text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Hero — avatar + (editable) title + member count */}
        <div className="flex flex-col items-center pt-10 pb-4 px-6 bg-gradient-to-b from-white/30 dark:from-white/[0.03] to-transparent flex-shrink-0">
          <div className="relative" ref={avatarMenuRef}>
            <Avatar
              name={chat.title ?? 'Group'}
              seed={chat.id}
              avatarUrl={chat.avatarUrl}
              size="xl"
            />
            {avatarBusy && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
                <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              </div>
            )}
            {canManage && !avatarBusy && (
              <button
                type="button"
                onClick={() => setAvatarMenuOpen((v) => !v)}
                aria-label="Change group photo"
                className="absolute -bottom-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white shadow-glass-sm hover:scale-[1.05] active:scale-[0.95] transition-transform duration-200"
              >
                <CameraIcon />
              </button>
            )}

            {avatarMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-44 rounded-2xl bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden z-20 py-1">
                <button
                  type="button"
                  onClick={() => { setAvatarMenuOpen(false); fileInputRef.current?.click(); }}
                  className="w-full text-left px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors"
                >
                  {chat.avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {chat.avatarUrl && (
                  <>
                    <div className="mx-4 border-t border-white/50 dark:border-white/[0.05]" />
                    <button
                      type="button"
                      onClick={() => void handleAvatarRemove()}
                      className="w-full text-left px-4 py-2.5 text-[14px] text-red-500 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/15 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarFile}
          />

          {avatarError && (
            <p className="text-[12px] text-red-500 mt-2 max-w-[240px] text-center">{avatarError}</p>
          )}

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
                  <button onClick={() => { setRenameValue(chat.title ?? ''); setRenaming(true); }} aria-label="Rename group" className="text-[#007aff] dark:text-[#0a84ff] hover:opacity-70 transition-opacity">
                    <PencilIcon />
                  </button>
                )}
              </div>
            )}
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-0.5">{chat.participants.length} members</p>
          </div>
        </div>

        {/* Description */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] uppercase tracking-wide">Description</p>
            {canManage && !editingDesc && (
              <button
                type="button"
                onClick={() => { setDescValue(chat.description ?? ''); setEditingDesc(true); }}
                className="text-[12px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity"
              >
                {chat.description ? 'Edit' : 'Add'}
              </button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setEditingDesc(false); setDescValue(chat.description ?? ''); } }}
                placeholder="What's this group about?"
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 rounded-2xl bg-white/55 dark:bg-white/[0.06] border border-white/60 dark:border-white/[0.06] text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none focus:bg-white/75 dark:focus:bg-white/[0.08] resize-none transition-all duration-200"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setEditingDesc(false); setDescValue(chat.description ?? ''); }}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] bg-white/55 dark:bg-white/[0.06] hover:bg-white/70 dark:hover:bg-white/[0.08] transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDescriptionSave()}
                  disabled={descSaving}
                  className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] disabled:opacity-40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {descSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] whitespace-pre-wrap [overflow-wrap:anywhere] min-h-[18px]">
              {chat.description
                ? chat.description
                : <span className="italic text-[#8e8e93] dark:text-[#9a9aa3]">No description{canManage ? ' yet.' : '.'}</span>}
            </p>
          )}
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <p className="px-2 py-2 text-[11px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] uppercase tracking-wide">Members</p>

          {chat.participants.map((p) => {
            const isMe = p.userId === currentUserId;
            const isRowOwner = p.role === ParticipantRole.OWNER;
            const name = p.user?.displayName ?? p.user?.username ?? 'Unknown';
            const canRemove = canManage && !isMe && !isRowOwner;
            const canTransfer = isOwner && !isMe && !isRowOwner;
            const hasMenu = canRemove || canTransfer;
            const menuOpen = memberMenuFor === p.userId;

            return (
              <div key={p.userId} className="relative flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-white/45 dark:hover:bg-white/[0.04] transition-colors">
                <Avatar name={name} seed={p.userId} avatarUrl={p.user?.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{name}{isMe ? ' (you)' : ''}</p>
                  {p.user?.username && <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">@{p.user.username}</p>}
                </div>
                {isRowOwner && (
                  <span className="text-[10px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] bg-white/55 dark:bg-white/[0.08] px-2 py-0.5 rounded-full flex-shrink-0">Owner</span>
                )}
                {p.role === ParticipantRole.ADMIN && !isRowOwner && (
                  <span className="text-[10px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] bg-white/45 dark:bg-white/[0.06] px-2 py-0.5 rounded-full flex-shrink-0">Admin</span>
                )}
                {transferring === p.userId && (
                  <span className="text-[10px] text-[#8e8e93] dark:text-[#9a9aa3]">Transferring…</span>
                )}
                {hasMenu && transferring !== p.userId && (
                  <button
                    onClick={() => setMemberMenuFor(menuOpen ? null : p.userId)}
                    disabled={removing === p.userId}
                    className="flex-shrink-0 p-1 text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 transition-colors"
                    aria-label={`Actions for ${name}`}
                  >
                    <DotsIcon />
                  </button>
                )}

                {menuOpen && hasMenu && (
                  <div className="absolute right-2 top-full mt-1 w-44 rounded-2xl bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden z-20 py-1">
                    {canTransfer && (
                      <button
                        type="button"
                        onClick={() => void handleTransfer(p.userId)}
                        className="w-full text-left px-4 py-2 text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        Transfer ownership
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => void handleRemove(p.userId)}
                        className="w-full text-left px-4 py-2 text-[13px] text-red-500 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/15 transition-colors"
                      >
                        Remove from group
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add members section */}
        {canManage && (
          <div className="px-3 pb-2 border-t border-white/45 dark:border-white/[0.05] flex-shrink-0">
            {addOpen ? (
              <div className="pt-3">
                <input
                  autoFocus
                  type="text"
                  value={addQuery}
                  onChange={handleSearchChange}
                  placeholder="Search users to add…"
                  className="w-full px-4 py-2 rounded-full bg-white/55 dark:bg-white/[0.06] border border-white/60 dark:border-white/[0.06] text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none focus:bg-white/75 dark:focus:bg-white/[0.08] transition-all duration-200"
                />
                {adding && <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] mt-1 px-1">Searching…</p>}
                {!adding && addSearched && addResults.length === 0 && (
                  <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] mt-1 px-1">No users found</p>
                )}
                <div className="mt-1 max-h-36 overflow-y-auto space-y-0.5">
                  {addResults.map((u) => {
                    const isSelected = selectedToAdd.some((s) => s.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleSelect(u)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left transition-all duration-200 ${isSelected ? 'bg-white/60 dark:bg-white/[0.08]' : 'hover:bg-white/45 dark:hover:bg-white/[0.05]'}`}
                      >
                        <Avatar name={u.displayName ?? u.username} seed={u.id} avatarUrl={u.avatarUrl} size="xs" />
                        <span className="text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{u.displayName ?? u.username}</span>
                        {isSelected && <span className="ml-auto text-[#007aff] dark:text-[#0a84ff]"><CheckIcon /></span>}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setAddOpen(false); setSelectedToAdd([]); setAddQuery(''); }} className="flex-1 py-2 rounded-full text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] bg-white/55 dark:bg-white/[0.06] hover:bg-white/70 dark:hover:bg-white/[0.08] transition-all duration-200">Cancel</button>
                  <button
                    onClick={() => void handleAddMembers()}
                    disabled={selectedToAdd.length === 0 || savingAdd}
                    className="flex-1 py-2 rounded-full text-[13px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] disabled:opacity-40 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                  >
                    {savingAdd ? 'Adding…' : `Add ${selectedToAdd.length > 0 ? `(${selectedToAdd.length})` : ''}`}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-3 text-[14px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:bg-white/50 dark:hover:bg-white/[0.06] rounded-2xl transition-all duration-200"
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
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-[14px] font-medium text-red-500 dark:text-red-400 bg-red-50/70 dark:bg-red-500/[0.10] hover:bg-red-100/80 dark:hover:bg-red-500/[0.15] disabled:opacity-40 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h2l1.5-2h3L13 5h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <circle cx="10" cy="11" r="3" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
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
      <path d="M12 4h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
      <polyline points="8 7 4 10 8 13" />
      <line x1="4" y1="10" x2="13" y2="10" />
    </svg>
  );
}
