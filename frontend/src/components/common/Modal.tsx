import { ReactNode } from 'react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}

export default function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            关闭
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
