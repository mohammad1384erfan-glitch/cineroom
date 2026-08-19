import React from 'react';

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  glow?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'secondary',
  glow = false,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider select-none';

  const variants = {
    primary: 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30',
    secondary: 'bg-white/5 text-brand-text-muted border border-glass',
    accent: 'bg-brand-accent/15 text-brand-accent border border-brand-accent/30',
    success: 'bg-green-500/15 text-green-400 border border-green-500/30',
    warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/30',
  };

  const glowStyles = glow ? {
    primary: 'shadow-[0_0_8px_rgba(229,9,20,0.3)]',
    secondary: 'shadow-[0_0_8px_rgba(255,255,255,0.05)]',
    accent: 'shadow-[0_0_8px_rgba(59,130,246,0.3)]',
    success: 'shadow-[0_0_8px_rgba(34,197,94,0.3)]',
    warning: 'shadow-[0_0_8px_rgba(234,179,8,0.3)]',
    danger: 'shadow-[0_0_8px_rgba(239,68,68,0.3)]',
  }[variant] : '';

  return (
    <span
      className={`${baseStyles} ${variants[variant]} ${glowStyles} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
