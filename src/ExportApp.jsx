import { useCallback, useEffect, useId, useRef } from 'react'

import App from './App.jsx'

/**
 * The popup shell: scrim, dialog, close button.
 *
 * Everything the host page is entitled to expect from a modal it did not build
 * lives here — Escape closes, the page behind stops scrolling, focus moves off
 * the host page — so the host only has to call mount().
 *
 * @param {string}   [props.title]           dialog heading
 * @param {string}   [props.tagline]         line under the heading
 * @param {string}   [props.apiBase]         API origin, no trailing slash
 * @param {Function} [props.onClose]         called on Escape / backdrop / ✕
 * @param {boolean}  [props.closeOnBackdrop] set false to require the ✕
 */
export default function ExportApp({
  title,
  tagline,
  apiBase,
  onClose,
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()

  const close = useCallback(() => onClose?.(), [onClose])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      // The host may have its own Escape handler bound to document; ours is the
      // topmost surface, so it takes the key rather than sharing it.
      event.stopPropagation()
      close()
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore rather than clear: the host may have been locking scroll itself.
      document.body.style.overflow = previousOverflow
    }
  }, [close])

  // Without this, Tab walks the host page sitting behind the scrim.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  // mousedown rather than click: a drag that starts inside the dialog and
  // releases over the backdrop (selecting text, mostly) must not close it.
  function onBackdropMouseDown(event) {
    if (closeOnBackdrop && event.target === event.currentTarget) close()
  }

  return (
    <div className="clm-root clm-overlay" onMouseDown={onBackdropMouseDown}>
      <div
        ref={dialogRef}
        className="clm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="clm-close" onClick={close} aria-label="Close">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <App title={title} tagline={tagline} titleId={titleId} apiBase={apiBase} />
      </div>
    </div>
  )
}
