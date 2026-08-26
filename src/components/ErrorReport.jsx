import { useState } from 'react'

/**
 * Renders the multi-line diagnostic reports built by firebase/errors.js.
 * The whole point of those reports is that they're long — a one-line
 * "Permission denied" is what made the online mode impossible to debug —
 * so this collapses to the headline by default and keeps the full detail
 * one tap away, with a copy button so it can be pasted into a bug report
 * from a phone (where selecting text out of a <pre> is painful).
 */
export default function ErrorReport({ message, className = '' }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!message) return null

  const text = String(message)
  const [headline, ...rest] = text.split('\n')
  const hasDetail = rest.join('\n').trim().length > 0

  return (
    <div className={`rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-left ${className}`}>
      <p className="text-sm font-medium text-red-300">{headline}</p>

      {hasDetail && (
        <>
          {open && (
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/70">
              {rest.join('\n').replace(/^\n+/, '')}
            </pre>
          )}
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium text-gold-light underline underline-offset-2"
            >
              {open ? 'Hide details' : 'Show details'}
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="text-xs font-medium text-white/50 underline underline-offset-2"
            >
              {copied ? 'Copied!' : 'Copy report'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
