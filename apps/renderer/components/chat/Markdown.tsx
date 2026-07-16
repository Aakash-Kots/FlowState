'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightToHtml, langForFence } from '@/lib/highlight';
import { cn } from '../ui/cn';

/**
 * Assistant-message markdown styled onto the app's dark tokens. Pure
 * client-side rendering — safe for the static export.
 *
 * `variant="plan"` bumps heading sizes into a document-style type hierarchy
 * (larger title + section headers) so a proposed plan reads like a document —
 * the default keeps the compact heading sizes used everywhere else.
 */
export const Markdown = memo(function Markdown({
  children,
  variant = 'default',
}: {
  children: string;
  variant?: 'default' | 'plan';
}) {
  const isPlan = variant === 'plan';
  const h1Class = cn(
    'pt-1 font-semibold text-neutral-100',
    isPlan ? 'text-2xl font-bold leading-tight' : 'text-base',
  );
  const h2Class = cn('pt-1 font-semibold text-neutral-100', isPlan ? 'text-lg' : 'text-sm');
  const h3Class = cn('pt-1 font-semibold text-neutral-100', isPlan ? 'text-base' : 'text-sm');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-neutral-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-white"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h1 className={h1Class}>{children}</h1>,
          h2: ({ children }) => <h2 className={h2Class}>{children}</h2>,
          h3: ({ children }) => <h3 className={h3Class}>{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            // Fenced blocks arrive wrapped in <pre>; inline code has no language class.
            const isBlock = /language-/.test(className ?? '');
            if (!isBlock) {
              return (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-neutral-100">
                  {children}
                </code>
              );
            }
            // Syntax-highlight the block in the user's chosen code theme; fall back
            // to plain text for unknown languages. Prism escapes the markup it emits.
            const raw = String(children).replace(/\n$/, '');
            const html = highlightToHtml(raw, langForFence(className));
            return html !== null ? (
              <code className={className} dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre
              className="code-hl overflow-x-auto rounded-md border border-border p-3 font-mono text-xs leading-relaxed"
              style={{ backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)' }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <table className="w-full border-collapse text-xs">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          hr: () => <hr className="border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
