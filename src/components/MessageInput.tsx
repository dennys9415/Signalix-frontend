'use client';

import { FormEvent, useRef, useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  const canSend = !disabled && text.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0"
    >
      <div className="flex-1 flex items-end gap-2 rounded-2xl bg-gray-100 dark:bg-zinc-800 px-4 py-2 border border-gray-200 dark:border-zinc-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 resize-none focus:outline-none disabled:opacity-40 leading-relaxed"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
      </div>
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all ${
          canSend
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm active:scale-95'
            : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600'
        }`}
      >
        <SendIcon />
      </button>
    </form>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-current" aria-hidden="true">
      <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289z" />
    </svg>
  );
}
