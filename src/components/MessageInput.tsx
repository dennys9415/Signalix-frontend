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
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
      className="flex items-end gap-2.5 px-4 py-3 border-t border-gray-200/80 dark:border-[#38383a] bg-white dark:bg-[#1c1c1e] flex-shrink-0"
    >
      {/* Input pill */}
      <div className="flex-1 flex items-end rounded-full bg-[#f2f2f7] dark:bg-[#2c2c2e] px-4 py-2 min-h-[40px] border border-gray-200/60 dark:border-transparent focus-within:border-[#007aff]/30 dark:focus-within:border-[#0a84ff]/20 transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder="iMessage"
          rows={1}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent text-[15px] text-[#1c1c1e] dark:text-[#f5f5f7] placeholder-[#8e8e93] resize-none focus:outline-none disabled:opacity-40 leading-relaxed self-center"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
      </div>

      {/* Send button */}
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-150 ${
          canSend
            ? 'bg-[#007aff] dark:bg-[#0a84ff] text-white shadow-sm hover:opacity-90 active:scale-95'
            : 'bg-[#e5e5ea] dark:bg-[#2c2c2e] text-[#c7c7cc] dark:text-[#48484a]'
        }`}
      >
        <SendIcon />
      </button>
    </form>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289z" />
    </svg>
  );
}
