'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageType } from '@signalix/contracts';
import { uploadMedia, uploadFile } from '../lib/api-client';

const FILE_EXTENSIONS = '.pdf,.docx,.xlsx,.pptx,.txt,.csv,.zip';

interface ReplyingTo {
  messageId: string;
  senderName: string;
  ciphertext: string;
  messageType?: MessageType;
}

interface Props {
  onSend: (text: string, replyToMessageId?: string, messageType?: MessageType) => void;
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

type PendingAttachment =
  | { kind: 'image'; file: File; previewUrl: string }
  | { kind: 'file'; file: File };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getReplyPreview(ciphertext: string, messageType?: MessageType): string {
  if (messageType === MessageType.IMAGE || ciphertext.startsWith('http')) return '📷 Image';
  if (messageType === MessageType.FILE) {
    try {
      const p = JSON.parse(ciphertext) as { name?: string };
      return `📎 ${p.name ?? 'File'}`;
    } catch { return '📎 File'; }
  }
  return ciphertext;
}

export function MessageInput({ onSend, replyingTo, onCancelReply, disabled, onTypingStart, onTypingStop }: Props) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typingActiveRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTypingStopRef = useRef(onTypingStop);
  useEffect(() => { onTypingStopRef.current = onTypingStop; });

  // Send stop on unmount if still typing
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (typingActiveRef.current) onTypingStopRef.current?.();
    };
  }, []);

  function notifyTyping() {
    if (!typingActiveRef.current) {
      onTypingStart?.();
      typingActiveRef.current = true;
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      onTypingStopRef.current?.();
      typingActiveRef.current = false;
    }, 3000);
  }

  function notifyStop() {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (typingActiveRef.current) {
      onTypingStop?.();
      typingActiveRef.current = false;
    }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (attachment) {
      notifyStop();
      setUploading(true);
      setUploadError(null);
      try {
        if (attachment.kind === 'image') {
          const { mediaUrl } = await uploadMedia(attachment.file);
          onSend(mediaUrl, replyingTo?.messageId, MessageType.IMAGE);
          URL.revokeObjectURL(attachment.previewUrl);
        } else {
          const { fileUrl, fileName, fileSize } = await uploadFile(attachment.file);
          const ciphertext = JSON.stringify({ url: fileUrl, name: fileName, size: fileSize });
          onSend(ciphertext, replyingTo?.messageId, MessageType.FILE);
        }
        setAttachment(null);
      } catch (err) {
        setUploadError((err as Error).message ?? 'Upload failed');
      } finally {
        setUploading(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;
    notifyStop();
    onSend(trimmed, replyingTo?.messageId);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as FormEvent);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachment?.kind === 'image') URL.revokeObjectURL(attachment.previewUrl);
    setAttachment({ kind: 'image', file, previewUrl: URL.createObjectURL(file) });
    setUploadError(null);
    e.target.value = '';
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachment?.kind === 'image') URL.revokeObjectURL(attachment.previewUrl);
    setAttachment({ kind: 'file', file });
    setUploadError(null);
    e.target.value = '';
  }

  function clearAttachment() {
    if (attachment?.kind === 'image') URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setUploadError(null);
  }

  const canSend = !disabled && !uploading && (
    (attachment !== null) || text.trim().length > 0
  );

  return (
    <div className="flex-shrink-0 border-t border-black/[0.06] dark:border-white/[0.07] bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-xl">
      {/* Reply preview banner */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
          <div className="flex-1 flex items-start gap-2 pl-3 border-l-2 border-[#007aff] dark:border-[#0a84ff] min-w-0">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#007aff] dark:text-[#0a84ff] truncate">
                {replyingTo.senderName}
              </p>
              <p className="text-[12px] text-[#8e8e93] dark:text-[#636375] truncate">
                {getReplyPreview(replyingTo.ciphertext, replyingTo.messageType)}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex-shrink-0 p-1 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors"
          >
            <XMarkIcon />
          </button>
        </div>
      )}

      {/* Image preview chip */}
      {attachment?.kind === 'image' && (
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-1">
          <div className="relative flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.previewUrl}
              alt=""
              className="h-16 w-16 rounded-xl object-cover border border-black/[0.07] dark:border-white/[0.07]"
            />
            <button
              onClick={clearAttachment}
              aria-label="Remove image"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-md"
            >
              <RemoveIcon />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{attachment.file.name}</p>
            <p className="text-[11px] text-[#8e8e93] dark:text-[#636375]">{formatBytes(attachment.file.size)} · Image</p>
            {uploadError && <p className="text-[11px] text-red-500 mt-0.5 truncate">{uploadError}</p>}
          </div>
        </div>
      )}

      {/* File preview chip */}
      {attachment?.kind === 'file' && (
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-1">
          <div className="relative flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-[#007aff]/[0.09] dark:bg-[#0a84ff]/[0.12] border border-[#007aff]/[0.12] dark:border-[#0a84ff]/[0.15]">
            <FileChipIcon />
            <button
              onClick={clearAttachment}
              aria-label="Remove file"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-md"
            >
              <RemoveIcon />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate font-medium">{attachment.file.name}</p>
            <p className="text-[11px] text-[#8e8e93] dark:text-[#636375]">{formatBytes(attachment.file.size)}</p>
            {uploadError && <p className="text-[11px] text-red-500 mt-0.5 truncate">{uploadError}</p>}
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleImageChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_EXTENSIONS}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Input row */}
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        className="flex items-end gap-1.5 px-3 py-3"
      >
        {/* Image attach button */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="Attach image"
          title="Attach image"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#636375] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-[#007aff] dark:hover:text-[#0a84ff] disabled:opacity-40 transition-all duration-150"
        >
          <ImageIcon />
        </button>

        {/* File attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="Attach file"
          title="Attach file (pdf, docx, xlsx, pptx, txt, csv, zip)"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#636375] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-[#007aff] dark:hover:text-[#0a84ff] disabled:opacity-40 transition-all duration-150"
        >
          <PaperclipIcon />
        </button>

        {/* Input pill */}
        <div className="flex-1 flex items-end rounded-2xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 px-4 py-2 min-h-[40px] border border-black/[0.07] dark:border-white/[0.07] focus-within:border-[#007aff]/30 dark:focus-within:border-[#0a84ff]/25 transition-all duration-150">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); autoResize(); if (e.target.value) notifyTyping(); else notifyStop(); }}
            onKeyDown={handleKeyDown}
            placeholder="Message"
            rows={1}
            disabled={disabled || uploading || !!attachment}
            className="flex-1 min-w-0 bg-transparent text-[15px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] resize-none focus:outline-none disabled:opacity-40 leading-relaxed self-center"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 ${
            canSend
              ? 'bg-[#007aff] dark:bg-[#0a84ff] text-white shadow-md shadow-[#007aff]/25 hover:opacity-90 active:scale-95'
              : 'bg-[#f2f2f7] dark:bg-[#1e1e2a] text-[#c7c7cc] dark:text-[#3c3c44]'
          }`}
        >
          {uploading ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </form>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289z" />
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

function RemoveIcon() {
  return (
    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="2" x2="8" y2="8" />
      <line x1="8" y1="2" x2="2" y2="8" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <circle cx="7" cy="8.5" r="1.5" />
      <path d="M2 14l4-4 3 3 3-3 4 4" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4 9.3 16.6a4.5 4.5 0 0 1-6.364-6.364l7.072-7.07a3 3 0 0 1 4.242 4.242L6.172 15a1.5 1.5 0 0 1-2.122-2.121l7.07-7.073" />
    </svg>
  );
}

function FileChipIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-[#007aff] dark:stroke-[#0a84ff] stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
      <polyline points="12 2 12 6 16 6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[2] animate-spin" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7" strokeOpacity="0.3" />
      <path d="M10 3a7 7 0 0 1 7 7" />
    </svg>
  );
}
