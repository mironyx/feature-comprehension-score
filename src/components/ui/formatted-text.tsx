import ReactMarkdown from 'react-markdown';

interface FormattedTextProps {
  readonly content: string;
  readonly className?: string;
}

/** Renders LLM-generated text with basic markdown formatting. */
export function FormattedText({ content, className }: FormattedTextProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-surface-raised px-1 py-0.5 text-[0.85em]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded bg-surface-raised p-3 text-sm">{children}</pre>
          ),
          h1: ({ children }) => <p className="mb-2 font-bold">{children}</p>,
          h2: ({ children }) => <p className="mb-2 font-bold">{children}</p>,
          h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
