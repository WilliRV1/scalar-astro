import type { ReactNode } from 'react';

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-primary" />
      <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grunge-border bg-surface-light p-5 dark:bg-surface-dark ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-display text-4xl leading-tight text-black dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grunge-border bg-surface-light px-6 py-14 text-center dark:bg-surface-dark">
      <p className="font-display text-2xl text-gray-400">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-4 border-primary bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
      {children}
    </p>
  );
}

export function Button({
  children,
  type = 'button',
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 px-4 py-3 font-display text-xl tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40';
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-red-700'
      : 'grunge-border text-gray-300 hover:border-primary hover:text-primary';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}
