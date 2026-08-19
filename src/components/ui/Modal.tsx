import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Dialog container */}
      <div 
        className={`
          relative w-full ${sizes[size]} bg-brand-bg-card border border-glass
          rounded-xl shadow-glass flex flex-col z-10 max-h-[90vh]
          animate-slide-up overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-glass bg-black/10">
          <h3 className="text-base font-semibold text-brand-text-main tracking-wide">
            {title}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 rounded-full text-brand-text-muted hover:text-white">
            <X size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-brand-text-muted leading-relaxed">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4.5 border-t border-glass bg-black/20 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
