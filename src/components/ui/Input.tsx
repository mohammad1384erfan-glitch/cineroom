import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className={`${fullWidth ? 'w-full' : ''} flex flex-col gap-1.5`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted select-none"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={`
            px-4 py-2.5 rounded-lg text-sm bg-brand-bg-input/60 border border-glass
            text-brand-text-main placeholder-gray-500
            transition-all duration-300 focus:outline-none focus:bg-brand-bg-input/90
            ${error 
              ? 'border-red-500/40 focus:border-red-500 focus:ring-1 focus:ring-red-500/30' 
              : 'focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20 focus:shadow-[0_0_12px_rgb(var(--color-primary-glow)/0.15)]'
            }
            ${fullWidth ? 'w-full' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <span className="text-xs text-red-500 mt-0.5 select-none font-medium">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span className="text-xs text-brand-text-muted mt-0.5 select-none">
          {helperText}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
