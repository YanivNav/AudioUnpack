"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // Close on backdrop click: the native <dialog> fires a "click" on the
  // dialog element itself when the backdrop is clicked, and the click
  // target is the dialog (not a child inside it).
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={ref}
      onClick={handleClick}
      onClose={onClose}
      className="m-auto max-h-[90vh] w-full max-w-2xl rounded-[var(--radius-modal)] border-0 bg-[var(--color-surface)] p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="m-0 text-lg font-semibold text-slate-800">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body — fills remaining space; children manage their own scrolling */}
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        {children}
      </div>

      {/* Sticky footer (outside scroll area) */}
      {footer && (
        <div className="border-t border-slate-200 px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  );
}
