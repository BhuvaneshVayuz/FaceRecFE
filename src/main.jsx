import React from 'react'
import { createRoot } from 'react-dom/client'

// Registers window.CelebLookalikeMF and pulls in the stylesheet. Imported for
// its side effect on purpose: `npm run dev` then drives the popup through the
// exact same global API a host page uses, so a mistake in export.jsx surfaces
// here instead of only after `npm run build:mf`.
import './export.jsx'

/** Stands in for the host page. Not part of the shipped bundle. */
function DevHost() {
  return (
    <main className="devhost">
      <h1>Host page</h1>
      <p>
        This page is the dev harness — it plays the part of the platform the popup
        gets embedded into. Everything below the button belongs to the host; the
        popup owns nothing outside its own overlay.
      </p>
      <button
        type="button"
        className="devhost-open"
        onClick={() => window.CelebLookalikeMF.open()}
      >
        Open the look-alike popup
      </button>
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DevHost />
  </React.StrictMode>,
)
