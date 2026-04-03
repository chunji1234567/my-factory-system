import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface NavbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'default' | 'outline';
  children: ReactNode;
}

export default function NavbarButton({
  active = false,
  variant = 'default',
  children,
  className = '',
  ...props
}: NavbarButtonProps) {
  const base = 'rounded-full px-4 py-2 text-sm font-medium transition-colors';
  let styles = '';

  if (variant === 'outline') {
    styles = 'border border-slate-200 text-slate-600 hover:bg-slate-50';
  } else if (active) {
    styles = 'bg-slate-900 text-white';
  } else {
    styles = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  }

  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}
