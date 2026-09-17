import { useEffect } from 'react';
import type { ReactNode } from 'react';

/** Panel lateral. En móvil ocupa toda la pantalla, que es como se usa en el box. */
export function Drawer({
  open, title, onClose, children, footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-lg flex-col border-l-4 border-primary bg-surface-light shadow-2xl dark:bg-surface-dark"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="font-display text-2xl text-black dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="px-2 text-2xl leading-none text-gray-500 hover:text-primary"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">{footer}</footer>
        )}
      </div>
    </div>
  );
}
