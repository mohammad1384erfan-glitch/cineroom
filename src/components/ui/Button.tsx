import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-300 active:scale-98 focus:outline-none focus:ring-2 focus:ring-brand-primary/45 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  const variants = {
    primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-glow hover:shadow-glow-strong border border-white/10 shine-effect',
    secondary: 'bg-brand-bg-card hover:bg-brand-bg-input text-brand-text-main border border-glass hover:border-white/15',
    accent: 'bg-brand-accent hover:bg-brand-accent-hover text-white shadow-md border border-white/5',
    ghost: 'text-brand-text-muted hover:text-brand-text-main hover:bg-white/5',
    outline: 'border border-glass hover:border-brand-primary text-brand-text-muted hover:text-brand-text-main hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.25)] border border-red-500/20',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4.5 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4.5 w-4.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </>
      ) : children}
    </button>
  );
};
