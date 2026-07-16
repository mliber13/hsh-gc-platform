import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type Props = {
  markdown: string
  className?: string
}

/**
 * Shared markdown preview for custom scope of work.
 * Used by the quote-stage editor preview and the crew project detail view.
 * Safe by default (no rehype-raw / no raw HTML).
 */
export function ScopeMarkdownPreview({ markdown, className }: Props) {
  const text = String(markdown ?? '')
  if (!text.trim()) {
    return (
      <p className={cn('text-sm text-muted-foreground italic', className)}>No scope entered</p>
    )
  }

  return (
    <div className={cn('text-sm text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children }) => <span>{children}</span>,
          blockquote: ({ children }) => (
            <div className="mb-2 last:mb-0">{children}</div>
          ),
          code: ({ children }) => <span className="font-mono text-[0.9em]">{children}</span>,
          pre: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
          img: () => null,
          table: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
          thead: ({ children }) => <>{children}</>,
          tbody: ({ children }) => <>{children}</>,
          tr: ({ children }) => <div className="mb-1">{children}</div>,
          th: ({ children }) => <span className="font-semibold">{children} </span>,
          td: ({ children }) => <span>{children} </span>,
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
