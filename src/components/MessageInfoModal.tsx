'use client';

// v0.14.0 — Message Info dialog.
//
// Opened from the message actions menu ("Info"). Shows:
//   • For direct chats: the recipient's status with Sent / Delivered /
//     Read timestamps stacked vertically.
//   • For groups: a Read by / Delivered to / Sent to breakdown with
//     per-participant timestamps, fetched from the new endpoint
//     `GET /messages/:id/recipients/status`.
//
// The component owns its fetch + state; the caller only passes
// messageId + onClose + the chat for participant lookups.

import { useEffect, useState } from 'react';
import { ChatType, MessageStatus, type ChatDTO, type MessageStatusDTO } from '@signalix/contracts';
import { getMessageRecipientsStatus } from '../lib/api-client';
import { Avatar } from './Avatar';

interface Props {
  messageId: string;
  chat: ChatDTO;
  sentAt: string;
  currentUserId: string;
  onClose: () => void;
}

export function MessageInfoModal({ messageId, chat, sentAt, currentUserId, onClose }: Props) {
  const [statuses, setStatuses] = useState<MessageStatusDTO[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatuses(null);
    setError(false);
    (async () => {
      try {
        const res = await getMessageRecipientsStatus(messageId);
        if (!cancelled) setStatuses(res.statuses);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [messageId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const isGroup = chat.type === ChatType.GROUP;
  const otherStatuses = (statuses ?? []).filter((s) => s.userId !== currentUserId);

  // Bucket the per-recipient rows for the group view.
  const read = otherStatuses.filter((s) => s.status === MessageStatus.READ);
  const delivered = otherStatuses.filter((s) => s.status === MessageStatus.DELIVERED);
  const sent = otherStatuses.filter((s) => s.status === MessageStatus.SENT);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[360px] rounded-3xl bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/55 dark:bg-white/[0.06] text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        <div className="px-6 pt-5 pb-2">
          <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Message info</p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {error && (
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Couldn&apos;t load delivery info.</p>
          )}

          {!error && statuses === null && (
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Loading…</p>
          )}

          {/* Direct: one summary row per state (sent → delivered → read). */}
          {!error && statuses !== null && !isGroup && (
            <DirectSummary sentAt={sentAt} statuses={otherStatuses} />
          )}

          {/* Group: bucketed sections, only render the ones with at least one row. */}
          {!error && statuses !== null && isGroup && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-[#8e8e93] dark:text-[#6e6e75]">Sent</p>
              <p className="text-[12px] text-[#1d1d1f] dark:text-[#f5f5f7]">{formatTime(sentAt)}</p>

              {read.length > 0 && (
                <SectionList
                  label={`Read by (${read.length})`}
                  rows={read}
                  chat={chat}
                />
              )}
              {delivered.length > 0 && (
                <SectionList
                  label={`Delivered to (${delivered.length})`}
                  rows={delivered}
                  chat={chat}
                />
              )}
              {sent.length > 0 && (
                <SectionList
                  label={`Sent to (${sent.length})`}
                  rows={sent}
                  chat={chat}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectSummary({ sentAt, statuses }: { sentAt: string; statuses: MessageStatusDTO[] }) {
  const read = statuses.find((s) => s.status === MessageStatus.READ);
  const delivered = statuses.find((s) => s.status === MessageStatus.DELIVERED);
  return (
    <div className="space-y-2">
      <Row label="Sent" timestamp={sentAt} />
      <Row label="Delivered" timestamp={delivered?.timestamp} />
      <Row label="Read" timestamp={read?.timestamp} />
    </div>
  );
}

function Row({ label, timestamp }: { label: string; timestamp?: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-[#8e8e93] dark:text-[#9a9aa3]">{label}</span>
      <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">
        {timestamp ? formatTime(timestamp) : <span className="text-[#aeaeb2] dark:text-[#5a5a65]">—</span>}
      </span>
    </div>
  );
}

function SectionList({ label, rows, chat }: { label: string; rows: MessageStatusDTO[]; chat: ChatDTO }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[#8e8e93] dark:text-[#6e6e75] mb-1.5 mt-3">{label}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const participant = chat.participants.find((p) => p.userId === r.userId);
          const name = participant?.user?.displayName ?? participant?.user?.username ?? r.userId;
          const avatarUrl = participant?.user?.avatarUrl ?? undefined;
          return (
            <li key={r.userId} className="flex items-center gap-2.5">
              <Avatar name={name} seed={r.userId} avatarUrl={avatarUrl} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{name}</p>
                <p className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3]">{formatTime(r.timestamp)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[2.5]" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}
