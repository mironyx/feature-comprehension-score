// Button — primary / secondary / destructive / ghost variants, sizes sm / md.
// Design reference: docs/design/frontend-system.md § Button variants
// Issue: #166

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-background hover:bg-accent-hover',
  secondary: 'bg-transparent text-text-primary border border-border hover:bg-surface-raised',
  destructive: 'bg-destructive text-white hover:opacity-90',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5',
  md: 'h-9 px-3.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center',
    'rounded-sm text-label font-medium',
    'transition-colors cursor-pointer',
    'disabled:opacity-50 disabled:pointer-events-none',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].join(' ');

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
