// Card — surface container for grouped content.
// Design reference: docs/design/frontend-system.md § Card
// Issue: #166

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  const classes = [
    'bg-surface border border-border rounded-md shadow-sm p-card-pad',
    className,
  ].join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
