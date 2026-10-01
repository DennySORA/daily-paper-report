import {
  Check,
  CircleAlert,
  Copy,
  ExternalLink as ExternalIcon,
  Inbox,
  RotateCw,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
export const ICON_SM = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

export type Tone =
  'info' | 'success' | 'warning' | 'danger' | 'entity' | 'file' | 'accent' | 'neutral'

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone
  children: ReactNode
  title?: string
}) {
  return (
    <span className="badge" data-tone={tone === 'neutral' ? undefined : tone} title={title}>
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/** Horizontal 0–1 magnitude meter. The numeric value is always rendered as text beside it. */
export function Meter({ value, className = '' }: { value: number | null; className?: string }) {
  const width = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100
  return (
    <span className={`meter ${className}`} aria-hidden="true">
      <span style={{ inlineSize: `${width}%` }} />
    </span>
  )
}

export function ExternalLink({
  href,
  children,
  className = '',
  primary = false,
}: {
  href: string
  children: ReactNode
  className?: string
  primary?: boolean
}) {
  return (
    <a
      className={`btn ${primary ? 'btn-primary' : ''} ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalIcon {...ICON_SM} />
      <span className="sr-only">（在新分頁開啟）</span>
    </a>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

/** Copies text with visible, timed feedback; failure is reported, never hidden. */
export function CopyButton({
  text,
  label,
  copiedLabel = '已複製',
  quiet = false,
}: {
  text: string
  label: string
  copiedLabel?: string
  quiet?: boolean
}) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = window.setTimeout(() => setState('idle'), 1800)
  }

  return (
    <button type="button" className={`btn ${quiet ? 'btn-quiet' : ''}`} onClick={copy}>
      {state === 'copied' ? (
        <Check {...ICON_SM} className="text-success" />
      ) : state === 'failed' ? (
        <CircleAlert {...ICON_SM} className="text-danger" />
      ) : (
        <Copy {...ICON_SM} />
      )}
      <span>
        {state === 'copied' ? copiedLabel : state === 'failed' ? '無法存取剪貼簿' : label}
      </span>
      <span className="sr-only" role="status">
        {state === 'copied' ? copiedLabel : state === 'failed' ? '複製失敗' : ''}
      </span>
    </button>
  )
}

export function StateMessage({
  icon = 'empty',
  title,
  children,
  actions,
}: {
  icon?: 'empty' | 'error'
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  const Icon = icon === 'error' ? CircleAlert : Inbox
  return (
    <div
      className="flex flex-col items-start gap-3 px-5 py-8"
      role={icon === 'error' ? 'alert' : undefined}
    >
      <Icon
        size={20}
        strokeWidth={1.75}
        aria-hidden
        className={icon === 'error' ? 'text-danger' : 'text-fg-3'}
      />
      <div className="flex flex-col gap-1">
        <p className="text-heading font-semibold text-fg">{title}</p>
        {children ? <div className="text-ui text-fg-2">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function ErrorMessage({
  error,
  onRetry,
  what,
}: {
  error: Error
  onRetry: () => void
  what: string
}) {
  return (
    <StateMessage
      icon="error"
      title={`${what}載入失敗`}
      actions={
        <button type="button" className="btn" onClick={onRetry}>
          <RotateCw {...ICON_SM} />
          重試
        </button>
      }
    >
      <p className="mono text-meta break-all text-fg-3">{error.message}</p>
    </StateMessage>
  )
}

/** Placeholder rows with the same geometry as real rows, so content does not jump. */
export function LoadingRows({ count = 8, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-1 p-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md px-3 py-3">
          <span className="block h-3.5 w-11/12 rounded-sm bg-elevated" />
          <span className="block h-3 w-7/12 rounded-sm bg-elevated/70" />
        </div>
      ))}
    </div>
  )
}
