# celeb-lookalike-web

The front end for [celeb-lookalike](../celeb-lookalike). Vite + React, no UI
framework, ~60 dependencies. It talks to the backend over HTTP and knows nothing
else about it, which is why the two live in separate repositories.

## Setup

```bash
npm install
cp .env.example .env.local     # then point VITE_API_BASE at your API
npm run dev
```

## Configuration

One variable:

| | |
|---|---|
| `VITE_API_BASE` | Base URL of the API, no trailing slash. e.g. `http://127.0.0.1:8000` locally, `https://celeb-lookalike-api.onrender.com` in production. |

**Vite inlines `VITE_*` at build time, not at runtime.** Changing it on Vercel
requires a redeploy, not a restart — this catches people out.

## Deploying to Vercel

Add New → Project → this repo, then:

- **Framework preset**: Vite (auto-detected)
- **Root directory**: the repo root — there is no subdirectory any more
- **Environment variable**: `VITE_API_BASE`

Then set `CORS_ALLOW_ORIGINS` on the API to this deployment's URL. It ships as
`*` so the first deploy works; leaving it open is fine only because the API has
no cookies and no auth. Note that Vercel gives every branch its own preview URL,
which a single-origin value will not cover.

## What the API returns

`POST /api/lookalike` (multipart: `file`, `gender=male|female|any`) →

```json
{
  "embedder": "sface",
  "results": [
    {
      "celebrity": "Shah Rukh Khan",
      "match": 96.0,
      "raw_cosine": 0.6183,
      "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/...?width=320"
    }
  ]
}
```

`match` is a calibrated percentage in the 55–96 band, not a probability —
`raw_cosine` is the real similarity and is there for debugging. `image_url` is
the celebrity photo that actually produced the match, and it is `null` when none
of that celebrity's indexed photos come from a source we are permitted to
hotlink.

Errors are always `{"detail": {"code": "...", "message": "..."}}`. Branch on
`code` (`NO_FACE_DETECTED`, `MULTIPLE_FACES_DETECTED`, `TOO_BLURRY`,
`FILE_TOO_LARGE`, …); show `message`.

## Two things worth knowing before changing this

**The comparison view costs the backend nothing.** All five celebrity URLs
arrive in one response and your own photo is a local object URL, so flipping
between the five is pure client-side state. Keep it that way — do not re-query
on selection.

**Celebrity images are hotlinked, not proxied.** They load from Wikimedia and
TMDb directly. Wikimedia throttles per-IP and will return "Too many requests" if
this is used at volume, which is why the API hands out width-capped
`Special:FilePath` URLs rather than full-size originals. If this ever needs to
survive real traffic, the fix is caching thumbnails server-side.

**Attribution is missing.** Commons CC BY files are being displayed without
credit. The backend manifest carries `artist` and `page_url` per file, so it is a
small change — but it should happen before this is public.
