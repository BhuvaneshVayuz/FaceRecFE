import { useEffect, useMemo, useRef, useState } from 'react'

// Set in .env.local for dev and in Vercel's project settings for production.
// Vite inlines VITE_* at BUILD time, so changing this in Vercel needs a
// redeploy, not a restart. Trailing slash trimmed so no URL becomes "//api".
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

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

export default function App() {
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

  // Doubles as the wake-up call: a free Render instance sleeps after inactivity,
  // and this fires while the visitor is still choosing a photo, so the cold
  // start overlaps with them rather than with their first upload.
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => !cancelled && setHealth(h))
      .catch(() => { })
    return () => {
      cancelled = true
    }
  }, [])

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

      const response = await fetch(`${API_BASE}/api/lookalike`, {
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
    <main>
      <header>
        <h1>VAYUZ mukham or surat or shakal or something something.....</h1>
        <p className="tagline">
          Upload a photo and see the five celebrities you most resemble.
        </p>
      </header>

      <form onSubmit={submit}>
        <button
          type="button"
          className={`dropzone ${preview ? 'has-photo' : ''}`}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="The photo you selected" />
          ) : (
            <span>
              <strong>Choose a photo</strong>
              <small>A clear, front-facing shot with just you in it</small>
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={pick}
        />

        <fieldset>
          <legend>Compare against</legend>
          <div className="segmented">
            {GENDERS.map((option) => (
              <label key={option.value} className={gender === option.value ? 'on' : ''}>
                <input
                  type="radio"
                  name="gender"
                  value={option.value}
                  checked={gender === option.value}
                  onChange={() => setGender(option.value)}
                  className="visually-hidden"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="go" disabled={!file || busy}>
          {busy ? 'Looking…' : 'Find look-alikes'}
        </button>
        {slow && (
          <p className="hint">
            The server sleeps when idle and can take up to a minute to wake. Hang on.
          </p>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      {results && match && (
        <section className="results">
          {/* The comparison itself: your face and theirs at the same size, side
              by side. Both images are already in the browser — yours as a local
              object URL, theirs from the one API response — so flipping between
              the five costs no further requests. */}
          <div className="compare">
            <figure>
              <div className="frame">
                {preview && <img src={preview} alt="Your photo" />}
              </div>
              <figcaption>You</figcaption>
            </figure>

            <div className="verdict" aria-hidden="true">
              <span className="pct">{match.match.toFixed(0)}%</span>
              <span className="pct-label">match</span>
            </div>

            <figure>
              <div className="frame">
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
                  <span className="no-photo">No photo available</span>
                )}
              </div>
              <figcaption>{match.celebrity}</figcaption>
            </figure>
          </div>

          <h2>Tap a name to compare</h2>
          <ol className="picks">
            {results.map((m, i) => (
              <li key={`${m.celebrity}-${i}`}>
                <button
                  type="button"
                  className={i === selected ? 'on' : ''}
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                >
                  <span className="thumb">
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
                  <span className="name">{m.celebrity}</span>
                  <span className="score">{m.match.toFixed(0)}%</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer>
        <p>
          Your photo is never stored. Celebrity photos are shown from their original
          source and are not hosted here.
        </p>
        {health?.celebrity_count && (
          <p className="meta">
            {health.celebrity_count.toLocaleString('en-IN')} celebrities · {health.embedder}
          </p>
        )}
      </footer>
    </main>
  )
}
