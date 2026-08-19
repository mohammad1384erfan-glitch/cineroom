import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  glowOnHover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  glow = false,
  glowOnHover = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`
        bg-brand-bg-card/45 backdrop-blur-md rounded-xl border border-glass shadow-glass
        transition-all duration-500
        ${glow ? 'shadow-glow border-brand-primary/20' : ''}
        ${glowOnHover ? 'hover:shadow-glow hover:border-brand-primary/25' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`px-6 py-4.5 border-b border-glass ${className}`} {...props}>
    {children}
  </div>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-6 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`px-6 py-4 border-t border-glass bg-black/10 ${className}`} {...props}>
    {children}
  </div>
);
