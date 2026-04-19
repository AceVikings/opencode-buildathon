import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

/**
 * Markdown renderer using the Loque design system tokens.
 * Drop-in replacement for <pre>{raw}</pre> anywhere we render AI-generated markdown.
 */

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-playfair text-2xl text-charcoal mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-playfair text-xl text-charcoal mt-6 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-inter text-[11px] uppercase tracking-[0.22em] text-charcoal mt-5 mb-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-inter text-[11px] font-semibold text-charcoal mt-4 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="font-inter text-[13px] text-charcoal/80 leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 last:mb-0 flex flex-col gap-1.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 last:mb-0 flex flex-col gap-1.5 pl-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="font-inter text-[13px] text-charcoal/80 leading-relaxed flex gap-2">
      <span className="text-gold mt-[5px] flex-shrink-0 text-[8px]">◆</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-charcoal">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-charcoal/70">{children}</em>
  ),
  hr: () => (
    <div className="my-5 flex items-center gap-3">
      <div className="flex-1 h-px bg-charcoal/10" />
      <div className="w-1.5 h-1.5 bg-gold" />
      <div className="flex-1 h-px bg-charcoal/10" />
    </div>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gold pl-4 my-3 italic text-charcoal/60 font-inter text-[13px]">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="font-mono text-[11px] bg-charcoal/5 text-charcoal px-1.5 py-0.5 rounded-sm">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="font-mono text-[11px] bg-charcoal/5 text-charcoal p-4 overflow-x-auto my-3 leading-relaxed">
      {children}
    </pre>
  ),
}

interface Props {
  children: string
  className?: string
}

export function Markdown({ children, className = '' }: Props) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
