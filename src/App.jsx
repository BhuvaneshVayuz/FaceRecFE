import { useEffect, useMemo, useRef, useState } from 'react'

// Fallback only. The host page passes `apiBase` as a prop now, because a bundle
// dropped onto someone else's page cannot be rebuilt just to repoint the API.
// Vite still inlines VITE_* at BUILD time, so this is what a standalone build
// (npm run dev / npm run build) uses when no prop is given.
const ENV_API_BASE = import.meta.env.VITE_API_BASE ?? ''

// Mirrors settings.max_upload_bytes on the backend. Checked here purely so an
// oversized photo fails instantly instead of after uploading 40MB over mobile
// data; the server enforces the real limit regardless.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const GENDERS = [
  { value: 'any', label: 'Anyone' },
  { value: 'female', label: 'Women' },
  { value: 'male', label: 'Men' },
]

/** Pull FastAPI's `detail` out of an error response, whatever shape it took. */
async function detailFrom(response) {
  try {
    const body = await response.json()
    // Our own errors: {code, message}. The code is the stable contract, the
    // message is the copy to show — see REASON_MESSAGE in api.py.
    if (body?.detail?.message) return body.detail.message
    if (typeof body?.detail === 'string') return body.detail
    // 422s raised by FastAPI's own validation carry a list instead of a string.
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return body.detail[0].msg
  } catch {
    // Not JSON — a proxy error page, most likely.
  }
  return `The server returned ${response.status}. Please try again.`
}

/**
 * The look-alike experience itself. Renders the dialog's head/body/foot but not
 * the dialog — ExportApp owns the popup chrome, so this stays reusable if a
 * host ever wants it inline.
 */
export default function App({
  title = 'Celebrity Look-Alike',
  tagline = 'Upload a photo and meet the five celebrities you most resemble.',
  titleId,
  apiBase,
}) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [gender, setGender] = useState('any')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [health, setHealth] = useState(null)
  const inputRef = useRef(null)

  // Trailing slash trimmed so no URL becomes "//api".
  const base = useMemo(() => (apiBase ?? ENV_API_BASE).replace(/\/+$/, ''), [apiBase])

  // Doubles as the wake-up call: a free Render instance sleeps after inactivity,
  // and this fires while the visitor is still choosing a photo, so the cold
  // start overlaps with them rather than with their first upload.
  useEffect(() => {
    let cancelled = false
    fetch(`${base}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => !cancelled && setHealth(h))
      .catch(() => { })
    return () => {
      cancelled = true
    }
  }, [base])

  // Object URLs leak until revoked, and this one is replaced on every pick.
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const match = useMemo(
    () => (results ? results[Math.min(selected, results.length - 1)] : null),
    [results, selected],
  )

  function pick(event) {
    const chosen = event.target.files?.[0] ?? null
    setResults(null)
    setError(null)
    if (chosen && chosen.size > MAX_UPLOAD_BYTES) {
      setFile(null)
      setError(
        `That photo is ${(chosen.size / (1 << 20)).toFixed(1)}MB. Please pick one under 10MB.`,
      )
      return
    }
    setFile(chosen)
  }

  async function submit(event) {
    event.preventDefault()
    if (!file || busy) return

    setBusy(true)
    setError(null)
    setResults(null)
    // Only mention the cold start if it is actually being slow.
    const slowTimer = setTimeout(() => setSlow(true), 4000)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('gender', gender)

      const response = await fetch(`${base}/api/lookalike`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok) throw new Error(await detailFrom(response))

      const body = await response.json()
      setResults(body.results)
      setSelected(0)
      if (!health) setHealth({ embedder: body.embedder })
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Could not reach the server. It may still be starting up — try again in a moment.'
          : err.message,
      )
    } finally {
      clearTimeout(slowTimer)
      setSlow(false)
      setBusy(false)
    }
  }

  return (
    <>
      <header className="clm-head">
        <h1 className="clm-title" id={titleId}>{title}</h1>
        <p className="clm-tagline">{tagline}</p>
      </header>

      <div className="clm-body">
        <form className="clm-form" onSubmit={submit}>
          <button
            type="button"
            className={`clm-dropzone${preview ? ' is-filled' : ''}`}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="The photo you selected" />
            ) : (
              <span className="clm-dropzone-empty">
                <svg
                  className="clm-dropzone-icon"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h2.2a1.5 1.5 0 0 0 1.25-.67l.6-.9A1.5 1.5 0 0 1 9.8 3.75h4.4a1.5 1.5 0 0 1 1.25.68l.6.9A1.5 1.5 0 0 0 17.3 6h2.2A1.5 1.5 0 0 1 21 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
                  <circle cx="12" cy="12.5" r="3.5" />
                </svg>
                <span className="clm-dropzone-title">Choose a photo</span>
                <span className="clm-dropzone-hint">
                  A clear, front-facing shot with just you in it
                </span>
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="clm-sr-only"
            onChange={pick}
          />

          <fieldset>
            <legend className="clm-legend">Compare against</legend>
            <div className="clm-segmented">
              {GENDERS.map((option) => (
                <label
                  key={option.value}
                  className={`clm-segment${gender === option.value ? ' is-on' : ''}`}
                >
                  <input
                    type="radio"
                    name="clm-gender"
                    value={option.value}
                    checked={gender === option.value}
                    onChange={() => setGender(option.value)}
                    className="clm-sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="clm-cta" disabled={!file || busy}>
            {busy && <span className="clm-spinner" aria-hidden="true" />}
            {busy ? 'Looking…' : 'Find look-alikes'}
          </button>
          {slow && (
            <p className="clm-hint">
              The server sleeps when idle and can take up to a minute to wake. Hang on.
            </p>
          )}
        </form>

        {error && <p className="clm-error">{error}</p>}

        {results && match && (
          <section className="clm-results">
            {/* The comparison itself: your face and theirs at the same size, side
                by side. Both images are already in the browser — yours as a local
                object URL, theirs from the one API response — so flipping between
                the five costs no further requests. */}
            <div className="clm-compare">
              <figure>
                <div className="clm-frame">
                  {preview && <img src={preview} alt="Your photo" />}
                </div>
                <figcaption>You</figcaption>
              </figure>

              <div className="clm-verdict" aria-hidden="true">
                <span className="clm-pct">{match.match.toFixed(0)}%</span>
                <span className="clm-pct-label">match</span>
              </div>

              <figure>
                <div className="clm-frame">
                  {match.image_url ? (
                    <img
                      src={match.image_url}
                      alt={match.celebrity}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <span className="clm-no-photo">No photo available</span>
                  )}
                </div>
                <figcaption>{match.celebrity}</figcaption>
              </figure>
            </div>

            <h2 className="clm-picks-label">Tap a name to compare</h2>
            <ol className="clm-picks">
              {results.map((m, i) => (
                <li key={`${m.celebrity}-${i}`}>
                  <button
                    type="button"
                    className={`clm-pick${i === selected ? ' is-on' : ''}`}
                    aria-pressed={i === selected}
                    onClick={() => setSelected(i)}
                  >
                    <span className="clm-thumb">
                      {m.image_url && (
                        <img
                          src={m.image_url}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      )}
                    </span>
                    <span className="clm-name">{m.celebrity}</span>
                    <span className="clm-score">{m.match.toFixed(0)}%</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="clm-foot">
        <p>
          Your photo is never stored. Celebrity photos are shown from their original
          source and are not hosted here.
        </p>
        {health?.celebrity_count && (
          <p className="clm-meta">
            {health.celebrity_count.toLocaleString('en-IN')} celebrities · {health.embedder}
          </p>
        )}
      </footer>
    </>
  )
}
