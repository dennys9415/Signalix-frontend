'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { MessageType } from '@signalix/contracts';
import { uploadMedia, uploadFile, uploadVoice } from '../lib/api-client';

const FILE_EXTENSIONS = '.pdf,.docx,.xlsx,.pptx,.txt,.csv,.zip';
const MAX_RECORD_SECONDS = 5 * 60; // hard cap to avoid runaway recordings

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
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
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

export function MessageInput({ onSend, replyingTo, onCancelReply, disabled, onTypingStart, onTypingStop, scrollContainerRef }: Props) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Voice recording state ───────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canRecord = typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

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

  // Opens a hidden file input without letting the browser scroll or shift the
  // layout. Saves the message-list scrollTop and the currently focused element
  // before the OS dialog opens, then restores both in the next animation frame
  // (which fires after the dialog closes on blocking browsers, or immediately
  // on non-blocking ones — either way undoes any browser-triggered scroll).
  function openPicker(inputRef: React.RefObject<HTMLInputElement | null>) {
    const container = scrollContainerRef?.current ?? null;
    const savedScrollTop = container?.scrollTop ?? 0;
    const prevFocus = document.activeElement as HTMLElement | null;

    inputRef.current?.click();

    requestAnimationFrame(() => {
      if (container) container.scrollTop = savedScrollTop;
      if (prevFocus && prevFocus !== inputRef.current && document.contains(prevFocus)) {
        prevFocus.focus({ preventScroll: true });
      }
    });
  }

  const canSend = !disabled && !uploading && !recording && (
    (attachment !== null) || text.trim().length > 0
  );

  // ── Voice recording ──────────────────────────────────────────────────────

  // Pick the best MIME the browser will actually record. Chrome / Edge / FF
  // do webm+opus; Safari emits audio/mp4 (AAC). Empty string lets the
  // browser pick its default.
  function pickAudioMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  function teardownRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
  }

  // Always release the mic if the component unmounts mid-recording.
  useEffect(() => teardownRecording, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRecording() {
    if (!canRecord || recording || uploading) return;
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = pickAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recordStartRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      recordTimerRef.current = setInterval(() => {
        const next = Math.floor((Date.now() - recordStartRef.current) / 1000);
        setElapsed(next);
        if (next >= MAX_RECORD_SECONDS) void finishRecordingAndSend();
      }, 250);
    } catch (e) {
      const err = e as DOMException;
      setRecordError(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. Allow it in the browser permissions.'
          : err.name === 'NotFoundError'
          ? 'No microphone detected.'
          : err.message || 'Could not start recording.',
      );
      teardownRecording();
    }
  }

  function cancelRecording() {
    teardownRecording();
  }

  async function finishRecordingAndSend() {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder || !stream) return;

    // Snapshot duration before tearing down. Use Math.max(1, …) so the
    // shortest possible bubble still renders a non-zero duration.
    const durationSec = Math.max(1, Math.floor((Date.now() - recordStartRef.current) / 1000));

    // Wait for the recorder to flush its last chunk before we read the blob.
    const blob = await new Promise<Blob>((resolve) => {
      const mime = recorder.mimeType || 'audio/webm';
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mime }));
      try { recorder.stop(); } catch { resolve(new Blob([], { type: mime })); }
    });

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    stream.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);

    if (blob.size === 0) {
      setRecordError('Recording was empty.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const ext = blob.type.includes('mp4') ? '.m4a' : blob.type.includes('ogg') ? '.ogg' : '.webm';
      const filename = `voice-${Date.now()}${ext}`;
      const { voiceUrl } = await uploadVoice(blob, filename);
      const ciphertext = JSON.stringify({ url: voiceUrl, duration: durationSec, size: blob.size });
      onSend(ciphertext, replyingTo?.messageId, MessageType.AUDIO);
    } catch (err) {
      setUploadError((err as Error).message ?? 'Voice upload failed');
    } finally {
      setUploading(false);
    }
  }

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div
      className="flex-shrink-0 border-t border-white/40 dark:border-white/[0.05] bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Reply preview banner */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
          <div className="flex-1 flex items-start gap-2 pl-3 border-l-2 border-[#007aff]/70 dark:border-[#0a84ff]/60 min-w-0">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                {replyingTo.senderName}
              </p>
              <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">
                {getReplyPreview(replyingTo.ciphertext, replyingTo.messageType)}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex-shrink-0 p-1 text-[#8e8e93] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors"
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
              className="h-16 w-16 rounded-2xl object-cover border border-white/60 dark:border-white/[0.08]"
            />
            <button
              onClick={clearAttachment}
              aria-label="Remove image"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-glass-sm"
            >
              <RemoveIcon />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{attachment.file.name}</p>
            <p className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3]">{formatBytes(attachment.file.size)} · Image</p>
            {uploadError && <p className="text-[11px] text-red-500 mt-0.5 truncate">{uploadError}</p>}
          </div>
        </div>
      )}

      {/* File preview chip */}
      {attachment?.kind === 'file' && (
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-1">
          <div className="relative flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl border border-white/60 dark:border-white/[0.08]">
            <FileChipIcon />
            <button
              onClick={clearAttachment}
              aria-label="Remove file"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-glass-sm"
            >
              <RemoveIcon />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#1d1d1f] dark:text-[#f5f5f7] truncate font-medium">{attachment.file.name}</p>
            <p className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3]">{formatBytes(attachment.file.size)}</p>
            {uploadError && <p className="text-[11px] text-red-500 mt-0.5 truncate">{uploadError}</p>}
          </div>
        </div>
      )}

      {/* Hidden file inputs. position:fixed moves them out of layout flow.
          top/left at -9999px ensures that even if the browser briefly tries to
          scroll to the focused element, it scrolls to a point that is
          unreachable and has no visible effect. 1px size (not 0) avoids
          browser bugs that suppress .click() on truly zero-size inputs. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        onChange={handleImageChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_EXTENSIONS}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        onChange={handleFileChange}
      />

      {/* Mic-permission error surfaces above the input row so the user can
          actually read it without it being eaten by an attachment chip. */}
      {recordError && (
        <p className="px-4 pt-2 text-[12px] text-red-500">{recordError}</p>
      )}

      {/* Input row — morphs into a recording bar while we have an active
          MediaRecorder. The composer is hidden in that case so the user's
          attention is fully on the recording state. */}
      {recording ? (
        <div className="flex items-center gap-2 px-3 py-3">
          {/* Cancel: discards the take without sending. */}
          <button
            type="button"
            onClick={cancelRecording}
            aria-label="Cancel recording"
            title="Cancel"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/55 dark:hover:bg-white/[0.06] hover:text-red-500 dark:hover:text-red-400 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          >
            <XMarkIcon />
          </button>

          {/* Recording indicator + timer pill. */}
          <div className="flex-1 flex items-center gap-3 rounded-full bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl px-5 py-2 min-h-[40px] border border-white/60 dark:border-white/[0.06] shadow-glass-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums">
              {formatElapsed(elapsed)}
            </span>
            <span className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">Recording…</span>
          </div>

          {/* Send: stops the recorder, uploads, and emits the AUDIO message. */}
          <button
            type="button"
            onClick={() => void finishRecordingAndSend()}
            disabled={uploading}
            aria-label="Send voice message"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white shadow-glass-sm hover:scale-[1.04] active:scale-[0.95] transition-all duration-200 disabled:opacity-60"
          >
            {uploading ? <SpinnerIcon /> : <SendIcon />}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          className="flex items-end gap-1.5 px-3 py-3"
        >
          {/* Image attach button */}
          <button
            type="button"
            onClick={() => openPicker(imageInputRef)}
            disabled={disabled || uploading}
            aria-label="Attach image"
            title="Attach image"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/55 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          >
            <ImageIcon />
          </button>

          {/* File attach button */}
          <button
            type="button"
            onClick={() => openPicker(fileInputRef)}
            disabled={disabled || uploading}
            aria-label="Attach file"
            title="Attach file (pdf, docx, xlsx, pptx, txt, csv, zip)"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/55 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
          >
            <PaperclipIcon />
          </button>

          {/* Input pill — floating glass, Apple Messages style */}
          <div className="flex-1 flex items-end rounded-full bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl px-5 py-2 min-h-[40px] border border-white/60 dark:border-white/[0.06] focus-within:bg-white/75 dark:focus-within:bg-white/[0.09] focus-within:border-white/80 dark:focus-within:border-white/[0.10] transition-all duration-200 shadow-glass-sm">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); autoResize(); if (e.target.value) notifyTyping(); else notifyStop(); }}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              rows={1}
              disabled={disabled || uploading || !!attachment}
              className="flex-1 min-w-0 bg-transparent text-[15px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] resize-none focus:outline-none disabled:opacity-40 leading-relaxed self-center"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
          </div>

          {/* Mic when composer is empty, Send otherwise. The two share the
              same dimensions so the layout never reflows on keystroke. */}
          {canSend ? (
            <button
              type="submit"
              aria-label="Send message"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white shadow-glass-sm hover:scale-[1.04] active:scale-[0.95] transition-all duration-200"
            >
              {uploading ? <SpinnerIcon /> : <SendIcon />}
            </button>
          ) : canRecord ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={disabled || uploading || !!attachment}
              aria-label="Record voice message"
              title="Record voice message"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/55 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
            >
              <MicIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled
              aria-label="Send message"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-white/40 dark:bg-white/[0.04] text-[#c7c7cc] dark:text-[#4a4a55]"
            >
              <SendIcon />
            </button>
          )}
        </form>
      )}
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

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0" />
      <line x1="10" y1="15" x2="10" y2="18" />
      <line x1="7" y1="18" x2="13" y2="18" />
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
