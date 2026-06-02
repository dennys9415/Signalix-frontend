'use client';

import { FormEvent, useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 p-3 border-t border-gray-800 bg-gray-900"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message…"
        rows={1}
        disabled={disabled}
        className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40"
        style={{ maxHeight: '120px', overflowY: 'auto' }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm font-medium transition-colors"
      >
        Send
      </button>
    </form>
  );
}
