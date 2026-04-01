// Badge — generic inline pill.
// Design reference: docs/design/frontend-system.md § Badge / StatusBadge
// Issue: #166

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function Badge({ className = '', children, ...rest }: BadgeProps) {
  const classes = [
    'inline-flex items-center text-caption font-medium',
    'rounded-sm px-2 py-0.5',
    className,
  ].join(' ');

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
