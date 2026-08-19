import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden flex flex-col justify-end">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div 
        className="
          relative w-full bg-brand-bg-card border-t border-glass
          rounded-t-2xl shadow-glass flex flex-col z-10 max-h-[85vh]
          animate-slide-up overflow-hidden
        "
      >
        {/* IOS style drag handlebar */}
        <div className="w-full flex justify-center py-2 bg-black/10 select-none">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1 border-b border-glass bg-black/10">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-brand-text-main">
            {title}
          </h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose} 
            className="p-1.5 rounded-full text-brand-text-muted hover:text-white"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {children}
        </div>
      </div>
    </div>
  );
};
