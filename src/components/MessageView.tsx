'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatType, MessageType, type ChatDTO, type InChatSearchMatchDTO, type LinkPreviewDTO, type MessageDTO } from '@signalix/contracts';
import { useChatStore, type TempMessage, type StoredMessage } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { downloadFileAttachment, searchInChat } from '../lib/api-client';
import { DECRYPT_FAILED_PLACEHOLDER } from '../lib/crypto/crypto.service';
import { wsClient } from '../lib/ws-client';
import { formatLastSeen } from '../lib/presence';
import { useSidebar } from '../lib/sidebar-context';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { StatusIcon } from './StatusIcon';
import { MessageInput } from './MessageInput';
import { ContactProfileModal } from './ContactProfileModal';
import { GroupInfoModal } from './GroupInfoModal';
import { VoiceBubble } from './VoiceBubble';

const EMPTY_MESSAGES: StoredMessage[] = [];
const EMPTY_TYPING: string[] = [];

interface FileInfo { url: string; name: string; size: number }

function parseFileInfo(ciphertext: string): FileInfo | null {
  try {
    const p = JSON.parse(ciphertext) as { url?: unknown; name?: unknown; size?: unknown };
    if (typeof p.url === 'string' && typeof p.name === 'string' && typeof p.size === 'number') {
      return { url: p.url, name: p.name, size: p.size };
    }
  } catch { /* ignore */ }
  return null;
}

interface VoiceInfo { url: string; duration: number }

function parseVoiceInfo(ciphertext: string): VoiceInfo | null {
  try {
    const p = JSON.parse(ciphertext) as { url?: unknown; duration?: unknown };
    if (typeof p.url === 'string' && typeof p.duration === 'number') {
      return { url: p.url, duration: p.duration };
    }
  } catch { /* ignore */ }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Wraps every case-insensitive occurrence of `term` inside `text` in a
 * `<mark>` element so the in-chat search bar's matches are visible inside
 * each TEXT bubble. Returns a React fragment so it can be rendered in
 * place of the raw string.
 */
function highlightMatches(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const tl = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(tl);
  let key = 0;
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark
        key={`m-${key++}`}
        className="bg-amber-300/60 dark:bg-amber-400/40 text-inherit rounded-[3px] px-0.5"
      >
        {text.slice(idx, idx + term.length)}
      </mark>,
    );
    last = idx + term.length;
    idx = lower.indexOf(tl, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function getReplyPreviewText(ciphertext: string, messageType?: MessageType): string {
  if (messageType === MessageType.AUDIO) return '🎙️ Voice message';
  if (messageType === MessageType.IMAGE || ciphertext.startsWith('http')) return '📷 Image';
  if (messageType === MessageType.FILE) {
    const f = parseFileInfo(ciphertext);
    return f ? `📎 ${f.name}` : '📎 File';
  }
  return ciphertext;
}

interface Props {
  chat: ChatDTO;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

/* ─── Quick-react emojis ──────────────────────────────────────────────────── */

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];

/* ─── Forward modal ──────────────────────────────────────────────────────── */

interface ForwardModalProps {
  ciphertext: string;
  chats: ChatDTO[];
  currentUserId: string;
  onForward: (chatId: string) => void;
  onClose: () => void;
}

function ForwardModal({ ciphertext, chats, currentUserId, onForward, onClose }: ForwardModalProps) {
  const [query, setQuery] = useState('');

  function getChatName(c: ChatDTO) {
    if (c.type === ChatType.GROUP) return c.title ?? 'Group';
    const other = c.participants.find((p) => p.userId !== currentUserId);
    return other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  }

  const filtered = chats.filter((c) =>
    getChatName(c).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#1c1c24]/95 backdrop-blur-2xl shadow-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Forward Message</p>
          <button onClick={onClose} className="p-1 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors">
            <XMarkIcon />
          </button>
        </div>
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.05] dark:border-white/[0.06]">
          <p className="text-[13px] text-[#8e8e93] truncate">{getReplyPreviewText(ciphertext)}</p>
        </div>
        <div className="px-4 pb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full px-3 py-2 rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.05] dark:border-white/[0.06] text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto pb-2">
          {filtered.length === 0 && (
            <p className="text-center text-[13px] text-[#8e8e93] py-6">No conversations found.</p>
          )}
          {filtered.map((c) => {
            const isGroup = c.type === ChatType.GROUP;
            const name = getChatName(c);
            const other = isGroup ? undefined : c.participants.find((p) => p.userId !== currentUserId);
            const seed = isGroup ? c.id : (other?.userId ?? c.id);
            const avatarUrl = isGroup ? (c.avatarUrl ?? null) : (other?.user?.avatarUrl ?? null);
            return (
              <button
                key={c.id}
                onClick={() => onForward(c.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
              >
                <Avatar name={name} seed={seed} avatarUrl={avatarUrl} size="sm" />
                <span className="text-[15px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Message bubble ─────────────────────────────────────────────────────── */

interface BubbleProps {
  m: MessageDTO | TempMessage;
  currentUserId: string;
  chatId: string;
  isGroup: boolean;
  getSenderName: (userId: string) => string;
  onReply: (m: MessageDTO) => void;
  onForward: (m: MessageDTO) => void;
  /** Highlight every occurrence of this string inside TEXT bubbles. */
  searchTerm?: string;
  /** This message is one of the in-chat search matches. */
  isMatch?: boolean;
  /** This message is the currently focused match — auto-scrolls into view. */
  isActiveMatch?: boolean;
}

function MessageBubble({ m, currentUserId, chatId, isGroup, getSenderName, onReply, onForward, searchTerm, isMatch, isActiveMatch }: BubbleProps) {
  const deleteMessageForMe = useChatStore((s) => s.deleteMessageForMe);
  const deleteMessageForEveryone = useChatStore((s) => s.deleteMessageForEveryone);
  const editMessage = useChatStore((s) => s.editMessage);
  const setReaction = useChatStore((s) => s.setReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);

  const [deleting, setDeleting] = useState(false);
  const [deletingForEveryone, setDeletingForEveryone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<'main' | 'delete'>('main');

  const editRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isMine = 'senderId' in m ? m.senderId === currentUserId : true;
  const isDeletedForEveryone = 'deletedAt' in m && !!m.deletedAt;
  const isEdited = 'editedAt' in m && !!m.editedAt;
  const isForwarded = 'isForwarded' in m && !!m.isForwarded;
  const replyTo = 'replyTo' in m ? m.replyTo : undefined;
  const reactions = ('reactions' in m && m.reactions) ? m.reactions : [];
  const myReaction = reactions.find((r) => r.userIds.includes(currentUserId));
  const text = 'ciphertext' in m ? m.ciphertext : '';
  const time = 'createdAt' in m
    ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const isPending = 'pending' in m && m.pending;
  const state = 'state' in m ? m.state : 'created';
  const messageId = 'id' in m ? m.id : null;
  const messageType = ('messageType' in m ? m.messageType : MessageType.TEXT) as MessageType;
  const isImage = messageType === MessageType.IMAGE && !isDeletedForEveryone;
  const isFile = messageType === MessageType.FILE && !isDeletedForEveryone;
  const isAudio = messageType === MessageType.AUDIO && !isDeletedForEveryone;

  // Auto-scroll the focused in-chat search match into view.
  useEffect(() => {
    if (!isActiveMatch) return;
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isActiveMatch]);

  useEffect(() => {
    if (!menuOpen && !reactOpen) return;
    function handler(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setReactOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, reactOpen]);

  useEffect(() => {
    if (!menuOpen && !reactOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenuOpen(false); setReactOpen(false); }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen, reactOpen]);

  function openMenu() {
    setMenuMode('main');
    setReactOpen(false);
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuMode('main');
  }

  function handleReact(emoji: string) {
    if (!messageId) return;
    setReactOpen(false);
    if (myReaction?.emoji === emoji) removeReaction(chatId, messageId);
    else setReaction(chatId, messageId, emoji);
  }

  async function handleDelete() {
    if (!messageId || deleting) return;
    closeMenu();
    setDeleting(true);
    try { await deleteMessageForMe(chatId, messageId); }
    catch { setDeleting(false); }
  }

  function handleDeleteForEveryone() {
    if (!messageId || deletingForEveryone) return;
    closeMenu();
    setDeletingForEveryone(true);
    deleteMessageForEveryone(chatId, messageId);
  }

  function handleCopy() {
    if (text) void navigator.clipboard.writeText(text);
    closeMenu();
  }

  function startEditing() {
    closeMenu();
    setEditText(text);
    setEditing(true);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.selectionStart = editRef.current.value.length;
      }
    }, 0);
  }

  function cancelEditing() { setEditing(false); setEditText(''); }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); }
    if (e.key === 'Escape') cancelEditing();
  }

  async function saveEdit() {
    if (!messageId || saving) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === text) { cancelEditing(); return; }
    setSaving(true);
    editMessage(chatId, messageId, trimmed);
    setEditing(false);
    setEditText('');
    setSaving(false);
  }

  const showActions = messageId && !isDeletedForEveryone && !editing;

  const actionColumn = showActions ? (
    <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-0.5 flex-shrink-0 mb-1">
      <button
        onClick={() => { setMenuOpen(false); setReactOpen((v) => !v); }}
        aria-label="React"
        className={`p-1 transition-colors ${reactOpen ? 'text-amber-400' : 'text-[#c7c7cc] dark:text-[#3c3c44] hover:text-amber-400'}`}
      >
        <EmojiSmileIcon />
      </button>
      <div className="relative">
        <button
          onClick={openMenu}
          aria-label="Message actions"
          className={`p-1 transition-colors ${menuOpen ? 'text-[#007aff] dark:text-[#0a84ff]' : 'text-[#c7c7cc] dark:text-[#3c3c44] hover:text-[#8e8e93] dark:hover:text-[#8e8e93]'}`}
        >
          <ChevronDownIcon />
        </button>

        {menuOpen && (
          <div className={`absolute z-30 bottom-full mb-1 w-44 rounded-2xl shadow-glass bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl border border-white/60 dark:border-white/[0.06] overflow-hidden py-1 ${isMine ? 'right-0' : 'left-0'}`}>
            {menuMode === 'main' ? (
              <>
                <MenuItem icon={<EmojiSmileMenuIcon />} label="React" onClick={() => { closeMenu(); setReactOpen(true); }} />
                <MenuItem icon={<ReplyIcon />} label="Reply" onClick={() => { closeMenu(); if ('id' in m) onReply(m as MessageDTO); }} />
                <MenuItem icon={<ForwardIcon />} label="Forward" onClick={() => { closeMenu(); if ('id' in m) onForward(m as MessageDTO); }} />
                {!isImage && !isFile && <MenuItem icon={<CopyIcon />} label="Copy" onClick={handleCopy} />}
                {isMine && !isImage && !isFile && <MenuItem icon={<PencilMenuIcon />} label="Edit" onClick={startEditing} />}
                <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.06]" />
                <MenuItem icon={<TrashMenuIcon />} label="Delete" danger onClick={() => setMenuMode('delete')} />
              </>
            ) : (
              <>
                <MenuItem icon={<TrashMenuIcon />} label="Delete for me" danger onClick={handleDelete} />
                {isMine && <MenuItem icon={<TrashEveryoneMenuIcon />} label="Delete for everyone" danger onClick={handleDeleteForEveryone} />}
                <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.06]" />
                <MenuItem icon={<ChevronLeftIcon />} label="Cancel" onClick={closeMenu} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const reactPopover = reactOpen && (
    <div className={`absolute bottom-full mb-1.5 z-20 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] ${isMine ? 'right-0' : 'left-0'}`}>
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => handleReact(e)}
          className={`text-[20px] leading-none hover:scale-125 transition-transform px-0.5 ${myReaction?.emoji === e ? 'scale-110' : ''}`}
          aria-label={`React with ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );

  /* Bubble style — liquid glass surfaces. Outgoing is darker graphite glass,
     incoming is lighter glass. No purple tint. Asymmetric tail corners. */
  const bubbleClass = isDeletedForEveryone
    ? 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-xl border border-white/50 dark:border-white/[0.06]'
    : isMine
    ? 'bg-[#1d1d1f]/[0.85] dark:bg-white/[0.10] backdrop-blur-xl text-white dark:text-[#f5f5f7] rounded-br-[8px] shadow-glass-sm'
    : 'bg-white/65 dark:bg-white/[0.06] backdrop-blur-xl border border-white/55 dark:border-white/[0.05] rounded-bl-[8px]';

  const textClass = isDeletedForEveryone || isMine
    ? ''
    : 'text-[#1d1d1f] dark:text-[#f5f5f7]';

  return (
    <div
      ref={rowRef}
      data-message-id={messageId ?? undefined}
      className={`group flex items-end gap-1.5 w-full ${isMine ? 'justify-end' : 'justify-start'} transition-shadow duration-500 ${
        isActiveMatch
          ? 'signalix-search-active'
          : isMatch
          ? 'signalix-search-match'
          : ''
      }`}
    >
      {!isMine && actionColumn}

      {/* max-w percentages resolve against the row (w-full) so they're always
          relative to the actual panel width, not fixed pixels that can overflow
          narrow windows. min-w-0 lets the column shrink below its content size. */}
      <div className={`flex flex-col min-w-0 max-w-[82%] sm:max-w-[65%] ${isMine ? 'items-end' : 'items-start'}`}>
        {isGroup && !isMine && !isDeletedForEveryone && 'senderId' in m && (
          <p className="text-[11px] font-semibold text-[#007aff] dark:text-[#0a84ff] mb-0.5 ml-1 max-w-full truncate">
            {getSenderName(m.senderId)}
          </p>
        )}
        <div className="relative min-w-0">
          {reactPopover}

          <div
            className={`rounded-[24px] ${(isImage || isFile || isAudio) ? 'overflow-hidden' : 'px-4 py-2.5'} ${bubbleClass} ${textClass} ${(isPending || deleting || deletingForEveryone) && !isDeletedForEveryone ? 'opacity-55' : ''}`}
          >
            {isDeletedForEveryone ? (
              <div>
                <p className="text-[14px] italic text-[#aeaeb2] dark:text-[#636375]">
                  {isMine ? 'You deleted this message.' : 'This message was deleted.'}
                </p>
                {time && <span className="text-[11px] text-[#c7c7cc] dark:text-[#3c3c44] mt-0.5 block">{time}</span>}
              </div>
            ) : editing ? (
              <div className="flex flex-col gap-2 min-w-[180px]">
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  rows={Math.min(6, Math.max(1, editText.split('\n').length))}
                  className="w-full bg-transparent text-[15px] leading-relaxed resize-none outline-none placeholder:text-[#6e6e73] dark:placeholder:text-[#8e8e93]"
                  placeholder="Edit message…"
                  disabled={saving}
                />
                <div className="flex items-center justify-end gap-2">
                  <button onClick={cancelEditing} className="text-[12px] text-[#8e8e93] hover:text-[#6e6e73] dark:hover:text-[#aeaeb2] transition-colors px-1.5 py-0.5 rounded">Cancel</button>
                  <button onClick={() => void saveEdit()} disabled={!editText.trim() || saving} className="text-[12px] font-semibold bg-[#1d1d1f]/[0.08] dark:bg-[#f5f5f7]/[0.10] hover:bg-[#1d1d1f]/[0.14] dark:hover:bg-[#f5f5f7]/[0.18] disabled:opacity-40 px-2.5 py-0.5 rounded-full transition-colors">Save</button>
                </div>
              </div>
            ) : (
              <>
                {(isForwarded || replyTo) && (
                  <div className={(isImage || isFile) ? 'px-3.5 pt-2.5' : ''}>
                    {isForwarded && (
                      <div className="flex items-center gap-1 mb-1.5 text-[#8e8e93] dark:text-[#636375]">
                        <ForwardedIcon />
                        <span className="text-[11px] italic">Forwarded</span>
                      </div>
                    )}
                    {replyTo && (
                      <div className={`mb-2 pl-2.5 border-l-2 ${isMine ? 'border-[#007aff]/30 dark:border-[#0a84ff]/25' : 'border-[#007aff]/40 dark:border-[#0a84ff]/35'}`}>
                        <p className="text-[11px] font-semibold mb-0.5 text-[#007aff] dark:text-[#0a84ff]">
                          {getSenderName(replyTo.senderId)}
                        </p>
                        <p className="text-[12px] line-clamp-2 text-[#6e6e73] dark:text-[#8e8e93]">
                          {getReplyPreviewText(replyTo.ciphertext)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {isImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={text} alt="" className="block w-full max-h-[300px] object-cover" draggable={false} />
                    <div className={`flex items-center gap-1 px-3 py-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[11px] ${isMine ? 'text-white/60 dark:text-white/50' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>{time}</span>
                      {isMine && <StatusIcon state={state} />}
                    </div>
                  </>
                ) : isFile ? (
                  <FileCard fileInfo={parseFileInfo(text)} time={time} isMine={isMine} state={state} messageId={messageId} />
                ) : isAudio ? (
                  <VoiceBubbleSection text={text} time={time} isMine={isMine} state={state} />
                ) : text === DECRYPT_FAILED_PLACEHOLDER ? (
                  <>
                    <p className={`text-[14px] italic leading-relaxed flex items-center gap-1.5 ${isMine ? 'text-white/70 dark:text-white/60' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>
                      <LockOpenIcon />
                      Unable to decrypt message
                    </p>
                    <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[11px] ${isMine ? 'text-white/60 dark:text-white/50' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>{time}</span>
                      {isMine && <StatusIcon state={state} />}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {searchTerm ? highlightMatches(text, searchTerm) : text}
                    </p>
                    {'linkPreview' in m && m.linkPreview && m.linkPreview.title && (
                      <LinkPreviewCard preview={m.linkPreview as LinkPreviewDTO} />
                    )}
                    <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {isEdited && <span className={`text-[11px] ${isMine ? 'text-white/55 dark:text-white/45' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>Edited ·</span>}
                      <span className={`text-[11px] ${isMine ? 'text-white/60 dark:text-white/50' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>{time}</span>
                      {isMine && <StatusIcon state={state} />}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Reaction chips */}
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {reactions.map((r) => {
              const ismine = r.userIds.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  onClick={() => {
                    if (!messageId) return;
                    if (ismine) removeReaction(chatId, messageId);
                    else setReaction(chatId, messageId, r.emoji);
                  }}
                  className={`inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full border transition-all duration-150 ${
                    ismine
                      ? 'bg-[#007aff]/[0.08] border-[#007aff]/25 text-[#007aff] dark:text-[#0a84ff]'
                      : 'bg-white dark:bg-[#1e1e2a] border-black/[0.07] dark:border-white/[0.08] text-[#6e6e73] dark:text-[#8e8e93] hover:border-[#007aff]/30'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium text-[12px]">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isMine && actionColumn}
    </div>
  );
}

/* ─── Dropdown menu item ─────────────────────────────────────────────────── */

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors text-left ${
        danger
          ? 'text-red-500 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/15'
          : 'text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06]'
      }`}
    >
      <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ─── Main view ──────────────────────────────────────────────────────────── */

export function MessageView({ chat }: Props) {
  const session = useAuthStore((s) => s.session);
  const messages = useChatStore((s) => s.messages[chat.id] ?? EMPTY_MESSAGES);
  const chats = useChatStore((s) => s.chats);
  const presence = useChatStore((s) => s.presence);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markRead = useChatStore((s) => s.markRead);
  const deleteChatForMe = useChatStore((s) => s.deleteChatForMe);
  const removeDraftChat = useChatStore((s) => s.removeDraftChat);
  const typingUserIds = useChatStore((s) => s.typing[chat.id] ?? EMPTY_TYPING);
  // Compute other-participant ID from prop+session so we can use it in the selector below.
  const _otherUserId = chat.participants.find((p) => p.userId !== (session?.userId ?? ''))?.userId;
  const otherLastSeen = useChatStore((s) => _otherUserId ? s.lastSeenAt[_otherUserId] : undefined);
  const { setOpen } = useSidebar();

  const router = useRouter();
  const searchParams = useSearchParams();
  const targetMessageId = searchParams?.get('m') ?? null;
  // Track whether we've already focused this target so we don't re-scroll
  // on every message-list update.
  const focusedTargetRef = useRef<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ messageId: string; senderName: string; ciphertext: string; messageType?: MessageType } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<MessageDTO | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setActiveChatId = useChatStore((s) => s.setActiveChatId);
  const markChatRead = useChatStore((s) => s.markChatRead);

  const currentUserId = session?.userId ?? '';
  const isDraft = chat.id.startsWith('draft:');
  const isGroup = chat.type === ChatType.GROUP;
  const other = isGroup ? undefined : getOtherParticipant(chat, currentUserId);
  const otherName = isGroup
    ? (chat.title ?? 'Group')
    : (other?.user?.displayName ?? other?.user?.username ?? 'Unknown');
  const otherUsername = other?.user?.username ?? '';
  const otherSeed = isGroup ? chat.id : (other?.userId ?? chat.id);
  const otherAvatarUrl = isGroup ? chat.avatarUrl : other?.user?.avatarUrl;
  const isOnline = !isGroup && other ? (presence[other.userId] ?? 'offline') === 'online' : false;

  function getSenderName(userId: string): string {
    if (userId === currentUserId) return 'You';
    const p = chat.participants.find((pt) => pt.userId === userId);
    return p?.user?.displayName ?? p?.user?.username ?? 'Unknown';
  }

  useEffect(() => {
    setActiveChatId(chat.id);
    markChatRead(chat.id);
    return () => setActiveChatId(null);
  }, [chat.id, setActiveChatId, markChatRead]);

  useEffect(() => { loadMessages(chat.id); }, [chat.id, loadMessages]);

  useEffect(() => {
    const lastUnread = [...messages]
      .reverse()
      .find((m): m is MessageDTO => 'id' in m && m.senderId !== currentUserId && m.state !== 'read');
    if (lastUnread) markRead(chat.id, lastUnread.id);
  }, [messages, currentUserId, chat.id, markRead]);

  useEffect(() => {
    // When the user came in via a search-result click (`?m=<id>`), skip
    // the auto-scroll-to-bottom for that target. The dedicated effect
    // below scrolls + highlights instead.
    if (targetMessageId && focusedTargetRef.current !== targetMessageId) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, targetMessageId]);

  // Scroll-to + highlight a specific message when arriving via search.
  // Runs once the target's row mounts (after messages load).
  useEffect(() => {
    if (!targetMessageId) return;
    if (focusedTargetRef.current === targetMessageId) return;
    if (!listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(targetMessageId)}"]`);
    if (!row) return; // not in the loaded page yet — give up silently for now
    focusedTargetRef.current = targetMessageId;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Transient highlight ring; cleared after ~2 s.
    row.classList.add('signalix-search-hit');
    const t = window.setTimeout(() => row.classList.remove('signalix-search-hit'), 2200);
    return () => window.clearTimeout(t);
  }, [targetMessageId, messages]);

  // Reset our "focused" memo when the user navigates to a different target
  // or away from the search context entirely.
  useEffect(() => {
    if (!targetMessageId) focusedTargetRef.current = null;
  }, [targetMessageId]);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  async function handleDeleteChat() {
    if (deletingChat) return;
    setMenuOpen(false);
    setDeletingChat(true);
    try {
      await deleteChatForMe(chat.id);
      setOpen(true);
      router.push('/chats');
    } catch {
      setDeletingChat(false);
    }
  }

  function handleSend(text: string, replyToMessageId?: string, messageType?: MessageType) {
    if (isDraft) {
      const recipientUsername = other?.user?.username;
      if (!recipientUsername) return;
      sendMessage({ chatId: chat.id, recipientUsername, ciphertext: text, replyToMessageId, messageType });
    } else {
      sendMessage({ chatId: chat.id, ciphertext: text, replyToMessageId, messageType });
    }
    setReplyingTo(null);
  }

  // Draft chats have no real chatId yet — suppress typing WS events.
  function handleTypingStart() { if (!isDraft) wsClient.sendTypingStart({ chatId: chat.id }); }
  function handleTypingStop() { if (!isDraft) wsClient.sendTypingStop({ chatId: chat.id }); }

  // Resolve typing user IDs to display names (exclude self, just in case)
  const typingLabel = typingUserIds
    .filter((id) => id !== currentUserId)
    .map((id) => {
      const p = chat.participants.find((pt) => pt.userId === id);
      return p?.user?.displayName ?? p?.user?.username ?? null;
    })
    .filter(Boolean)
    .join(', ');

  function handleReply(m: MessageDTO) {
    setReplyingTo({ messageId: m.id, senderName: getSenderName(m.senderId), ciphertext: m.ciphertext, messageType: m.messageType });
  }

  function handleForward(m: MessageDTO) {
    setForwardingMessage(m);
  }

  function handleForwardTo(targetChatId: string) {
    if (!forwardingMessage) return;
    sendMessage({ chatId: targetChatId, ciphertext: forwardingMessage.ciphertext, messageType: forwardingMessage.messageType, isForwarded: true });
    setForwardingMessage(null);
  }

  // ── In-chat search ───────────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<InChatSearchMatchDTO[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Sequence number used to ignore stale responses if the user kept typing.
  const searchSeqRef = useRef(0);

  function openSearch() {
    setSearchMode(true);
    setMenuOpen(false);
    // Focus on next tick so the input is mounted.
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function closeSearch() {
    setSearchMode(false);
    setSearchQuery('');
    setSearchMatches([]);
    setActiveMatchIdx(0);
    setSearchLoading(false);
  }

  // Debounced fetch when the query changes. Draft chats don't have a real
  // chatId yet, so we skip them entirely.
  useEffect(() => {
    if (!searchMode) return;
    const q = searchQuery.trim();
    if (q.length < 2 || isDraft) {
      setSearchMatches([]);
      setActiveMatchIdx(0);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const seq = ++searchSeqRef.current;
    const handle = window.setTimeout(async () => {
      try {
        const res = await searchInChat(chat.id, q, { limit: 100 });
        if (searchSeqRef.current !== seq) return; // stale
        setSearchMatches(res.matches);
        setActiveMatchIdx(0);
      } catch {
        if (searchSeqRef.current === seq) setSearchMatches([]);
      } finally {
        if (searchSeqRef.current === seq) setSearchLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [searchQuery, searchMode, chat.id, isDraft]);

  function gotoNextMatch() {
    if (searchMatches.length === 0) return;
    setActiveMatchIdx((i) => (i + 1) % searchMatches.length);
  }
  function gotoPrevMatch() {
    if (searchMatches.length === 0) return;
    setActiveMatchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) gotoPrevMatch();
      else gotoNextMatch();
    }
  }

  // Build the lookup structures for the bubbles. Memoising avoids rebuilding
  // a Set on every render when matches haven't changed.
  const matchIdSet = useRef<Set<string>>(new Set());
  matchIdSet.current = new Set(searchMatches.map((m) => m.messageId));
  const activeMatchId = searchMatches[activeMatchIdx]?.messageId ?? null;
  // The query we want bubbles to inline-highlight. Empty string disables it.
  const inlineHighlight = searchMode && searchQuery.trim().length >= 2 ? searchQuery.trim() : '';

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ──
          When in-chat search is active the entire header morphs into a
          search bar. iMessage / Telegram-style "X of Y" navigation with
          ↑/↓ buttons and a close (✕) that restores the normal header. */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-3 border-b border-white/40 dark:border-white/[0.05] bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl flex-shrink-0">
        {searchMode ? (
          <>
            <button
              onClick={closeSearch}
              aria-label="Close search"
              title="Close search"
              className="flex items-center justify-center w-9 h-9 -ml-1 rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
            >
              <XMarkIcon />
            </button>

            <div className="flex-1 flex items-center rounded-full bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl px-4 py-1.5 border border-white/60 dark:border-white/[0.06] focus-within:bg-white/75 dark:focus-within:bg-white/[0.09] focus-within:border-white/80 transition-all duration-200">
              <span className="flex-shrink-0 text-[#8e8e93] dark:text-[#9a9aa3] mr-2">
                <SearchIcon />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={isGroup ? 'Search this group…' : 'Search this chat…'}
                className="flex-1 min-w-0 bg-transparent text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none"
              />
              {/* Match counter */}
              {searchQuery.trim().length >= 2 && (
                <span className="flex-shrink-0 ml-2 text-[12px] tabular-nums text-[#8e8e93] dark:text-[#9a9aa3]">
                  {searchLoading
                    ? '…'
                    : searchMatches.length === 0
                    ? 'No matches'
                    : `${activeMatchIdx + 1} of ${searchMatches.length}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={gotoPrevMatch}
                disabled={searchMatches.length === 0}
                aria-label="Previous match"
                title="Previous (Shift+Enter)"
                className="w-9 h-9 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
              >
                <ChevronUpIcon />
              </button>
              <button
                onClick={gotoNextMatch}
                disabled={searchMatches.length === 0}
                aria-label="Next match"
                title="Next (Enter)"
                className="w-9 h-9 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
              >
                <ChevronDownHeaderIcon />
              </button>
            </div>
          </>
        ) : (
          <>
        {/* Mobile back */}
        <button
          onClick={() => {
            // Explicitly remove the draft on back so the sidebar item disappears
            // immediately rather than waiting for the deferred cleanup timer.
            if (isDraft) removeDraftChat(chat.id);
            setOpen(true);
            router.replace('/chats');
          }}
          className="md:hidden flex items-center justify-center w-9 h-9 -ml-1 rounded-2xl text-[#007aff] dark:text-[#0a84ff] hover:bg-white/50 dark:hover:bg-white/[0.06] transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          aria-label="Back"
        >
          <BackArrowIcon />
        </button>

        <Avatar name={otherName} seed={otherSeed} avatarUrl={otherAvatarUrl} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{otherName}</p>
          {isGroup ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3]">{chat.participants.length} members</p>
              {/* v0.10.0 — group E2EE beta pill. Text-only; media/files/voice
                  in this chat continue to flow unencrypted. */}
              {!isDraft && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007aff] dark:text-[#0a84ff] bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10] px-1.5 py-0.5 rounded-full"
                  title="Group text messages are encrypted end-to-end per-recipient (beta). Media, files, and voice notes are not encrypted."
                >
                  <LockIcon />
                  End-to-end encrypted beta
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <PresenceIndicator online={isOnline} size="sm" />
              <p className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>
                {isOnline ? 'Online' : formatLastSeen(otherLastSeen)}
              </p>
              {/* v0.9.0 E2EE indicator. Only shown for direct, real-id
                  chats (drafts haven't published keys yet either way). */}
              {!isDraft && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007aff] dark:text-[#0a84ff] bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10] px-1.5 py-0.5 rounded-full"
                  title="Direct text messages are encrypted end-to-end (beta)"
                >
                  <LockIcon />
                  End-to-end encrypted beta
                </span>
              )}
            </div>
          )}
        </div>

        {/* Header action icons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setProfileOpen(true)}
            title={isGroup ? 'Group info' : 'View profile'}
            className="w-9 h-9 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          >
            <UserCircleIcon />
          </button>
          <button
            onClick={openSearch}
            disabled={isDraft}
            title={isDraft ? 'Send a message first' : 'Search in chat'}
            aria-label="Search in chat"
            className="w-9 h-9 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          >
            <SearchIcon />
          </button>

          {/* ⋮ Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`w-9 h-9 flex items-center justify-center rounded-2xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] ${menuOpen ? 'text-[#1d1d1f] dark:text-[#f5f5f7] bg-white/55 dark:bg-white/[0.08]' : 'text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/50 dark:hover:bg-white/[0.06]'}`}
              aria-label="Chat options"
            >
              <DotsVerticalIcon />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl shadow-glass bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl border border-white/60 dark:border-white/[0.06] z-[200] overflow-hidden py-1">
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors text-left"
                  onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                >
                  <UserCircleIcon />
                  <span>{isGroup ? 'Group Info' : 'View Profile'}</span>
                </button>
                <div className="my-1 border-t border-white/50 dark:border-white/[0.05]" />
                {!isGroup && (
                  <button
                    onClick={() => void handleDeleteChat()}
                    disabled={deletingChat}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-red-500 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/15 disabled:opacity-40 transition-colors text-left"
                  >
                    <TrashOutlineIcon />
                    <span>{deletingChat ? 'Deleting…' : 'Delete Chat'}</span>
                  </button>
                )}
                {!isGroup && (
                  <button
                    disabled
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#c7c7cc] dark:text-[#4a4a55] cursor-not-allowed text-left"
                  >
                    <BlockIcon />
                    <span>Block User</span>
                    <span className="ml-auto text-[10px] text-[#c7c7cc] dark:text-[#4a4a55]">soon</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* ── Message list ── */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-2.5 bg-transparent">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
            <Avatar name={otherName} seed={otherSeed} avatarUrl={otherAvatarUrl} size="xl" />
            <div>
              <p className="text-[16px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{otherName}</p>
              {isGroup
                ? <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-0.5">{chat.participants.length} members</p>
                : otherUsername && <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-0.5">@{otherUsername}</p>
              }
            </div>
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-1">Start the conversation.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const id = 'id' in m ? m.id : undefined;
          const isMatch = id ? matchIdSet.current.has(id) : false;
          const isActiveMatch = id ? id === activeMatchId : false;
          return (
            <MessageBubble
              key={'id' in m ? m.id : `tmp-${i}`}
              m={m}
              currentUserId={currentUserId}
              chatId={chat.id}
              isGroup={isGroup}
              getSenderName={getSenderName}
              onReply={handleReply}
              onForward={handleForward}
              searchTerm={isMatch ? inlineHighlight : ''}
              isMatch={isMatch}
              isActiveMatch={isActiveMatch}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typingLabel && (
        <div className="px-4 py-1 text-[12px] text-[#8e8e93] dark:text-[#636375] select-none">
          <span className="animate-pulse">{typingLabel} is typing…</span>
        </div>
      )}

      <MessageInput
        onSend={handleSend}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        scrollContainerRef={listRef}
      />

      {profileOpen && !isGroup && other && (
        <ContactProfileModal
          userId={other.userId}
          displayName={otherName}
          username={otherUsername}
          avatarUrl={otherAvatarUrl}
          isOnline={isOnline}
          lastSeenAt={otherLastSeen}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {profileOpen && isGroup && (
        <GroupInfoModal
          chat={chat}
          currentUserId={currentUserId}
          onClose={() => setProfileOpen(false)}
          onLeave={() => {
            setProfileOpen(false);
            setOpen(true);
            router.push('/chats');
          }}
        />
      )}

      {forwardingMessage && (
        <ForwardModal
          ciphertext={forwardingMessage.ciphertext}
          chats={chats}
          currentUserId={currentUserId}
          onForward={handleForwardTo}
          onClose={() => setForwardingMessage(null)}
        />
      )}
    </div>
  );
}

/* ─── Link preview card ─────────────────────────────────────────────────── */

function LinkPreviewCard({ preview }: { preview: LinkPreviewDTO }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block mt-2 rounded-xl overflow-hidden border border-black/[0.09] dark:border-white/[0.09] hover:opacity-90 transition-opacity bg-white/60 dark:bg-[#16161e]/60"
    >
      {preview.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.imageUrl}
          alt=""
          className="w-full h-28 object-cover"
          draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-medium text-[#007aff] dark:text-[#0a84ff] uppercase tracking-wide truncate mb-0.5">
          {preview.domain}
        </p>
        {preview.title && (
          <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] line-clamp-2 leading-snug">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-[11px] text-[#6e6e73] dark:text-[#8e8e93] line-clamp-2 mt-0.5 leading-snug">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="12 4 6 10 12 16" />
    </svg>
  );
}

function DotsVerticalIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-current" aria-hidden="true">
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M2.5 18a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 3.5 3.5" />
    </svg>
  );
}

function TrashOutlineIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M16 6l-1 11H5L4 6" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="4.7" y1="4.7" x2="15.3" y2="15.3" />
    </svg>
  );
}

function EmojiSmileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 9.5s.833 1.5 2.5 1.5 2.5-1.5 2.5-1.5" />
      <circle cx="6" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EmojiSmileMenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 9.5s.833 1.5 2.5 1.5 2.5-1.5 2.5-1.5" />
      <circle cx="6" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 5 8 11 13 5" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 11 8 5 13 11" />
    </svg>
  );
}

function ChevronDownHeaderIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 5 8 11 13 5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V4.75a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V4.75a2.5 2.5 0 0 1 4.5-1.5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="10 3 4 8 10 13" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 4L2 7.5l3.5 3.5" />
      <path d="M2 7.5h7a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 4L14 7.5l-3.5 3.5" />
      <path d="M14 7.5H7a4 4 0 0 0-4 4v1" />
    </svg>
  );
}

function ForwardedIcon() {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 3L10.5 5.5 7.5 8" />
      <path d="M10.5 5.5H5a3 3 0 0 0-3 3v0.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5v5.5a1.5 1.5 0 0 0 1.5 1.5H5.5" />
    </svg>
  );
}

function PencilMenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" />
    </svg>
  );
}

function TrashMenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
    </svg>
  );
}

function TrashEveryoneMenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[1.4]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 1.5a2 2 0 0 1 4 0" />
      <path d="M4.5 1.5a3.5 3.5 0 0 1 7 0" />
      <path d="M2.5 4.5h11M5.5 4.5V3.5h5v1M6 4.5l.5 8h3l.5-8" />
    </svg>
  );
}

function XMarkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

/* ─── File card ──────────────────────────────────────────────────────────── */

interface FileCardProps {
  fileInfo: FileInfo | null;
  time: string;
  isMine: boolean;
  state: string;
  messageId: string | null;
}

function FileCard({ fileInfo, time, isMine, state, messageId }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!messageId || !fileInfo || downloading) return;
    setDownloading(true);
    try {
      await downloadFileAttachment(messageId, fileInfo.name);
    } finally {
      setDownloading(false);
    }
  }

  if (!fileInfo) {
    return (
      <div className="px-3.5 py-2.5">
        <p className="text-[13px] text-[#aeaeb2] dark:text-[#636375] italic">File unavailable</p>
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] text-[#8e8e93] dark:text-[#636375]">{time}</span>
          {isMine && <StatusIcon state={state} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-[#007aff]/[0.10] dark:bg-[#0a84ff]/[0.12]">
          <FileDocIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium truncate text-[#1d1d1f] dark:text-[#f5f5f7]">{fileInfo.name}</p>
          <p className="text-[12px] text-[#8e8e93] dark:text-[#636375]">{formatBytes(fileInfo.size)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
          disabled={!messageId || downloading}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/[0.08] dark:hover:bg-[#0a84ff]/[0.10] disabled:opacity-40 transition-colors"
          aria-label={`Download ${fileInfo.name}`}
        >
          <DownloadIcon />
        </button>
      </div>
      <div className={`flex items-center gap-1 px-3.5 pb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <span className="text-[11px] text-[#8e8e93] dark:text-[#636375]">{time}</span>
        {isMine && <StatusIcon state={state} />}
      </div>
    </div>
  );
}

interface VoiceBubbleSectionProps {
  text: string;
  time: string;
  isMine: boolean;
  state: string;
}

function VoiceBubbleSection({ text, time, isMine, state }: VoiceBubbleSectionProps) {
  const info = parseVoiceInfo(text);
  if (!info) {
    return (
      <div className="px-3.5 py-2.5">
        <p className="text-[13px] text-[#aeaeb2] dark:text-[#636375] italic">Voice message unavailable</p>
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[11px] ${isMine ? 'text-white/60 dark:text-white/50' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>{time}</span>
          {isMine && <StatusIcon state={state} />}
        </div>
      </div>
    );
  }
  return (
    <div>
      <VoiceBubble url={info.url} durationSec={info.duration} isMine={isMine} />
      <div className={`flex items-center gap-1 px-3.5 pb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <span className={`text-[11px] ${isMine ? 'text-white/60 dark:text-white/50' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>{time}</span>
        {isMine && <StatusIcon state={state} />}
      </div>
    </div>
  );
}

function FileDocIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-[#007aff] dark:stroke-[#0a84ff] stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
      <polyline points="12 2 12 6 16 6" />
      <line x1="7" y1="11" x2="13" y2="11" />
      <line x1="7" y1="14" x2="11" y2="14" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3v10M6 9l4 4 4-4" />
      <path d="M4 16h12" />
    </svg>
  );
}
