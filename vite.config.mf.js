import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Microfrontend build. Deliberately a separate config from vite.config.js so the
 * standalone app — `npm run dev`, `npm run build`, the Vercel deployment — keeps
 * behaving exactly as it did.
 *
 *   npm run build:mf  ->  dist-mf/celeb-lookalike-mf.js
 */

/**
 * Fold the emitted stylesheet into the JS bundle.
 *
 * A library build emits CSS as its own asset, which would mean every host page
 * has to remember a <link> as well as the <script>. One file is one thing to get
 * wrong instead of two, so the CSS is inlined and injected on load.
 */
function inlineCss() {
  return {
    name: 'celeb-lookalike-inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      let css = ''

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'asset' && fileName.endsWith('.css')) {
          css += output.source
          delete bundle[fileName]
        }
      }

      if (!css) return

      const entry = Object.values(bundle).find((o) => o.type === 'chunk' && o.isEntry)
      if (!entry) return

      // The data attribute guard matters: a PHP page that includes the script
      // twice would otherwise stack duplicate <style> tags on every load.
      entry.code =
        '(function(){' +
        "var d=document,k='data-celeb-lookalike-mf';" +
        "if(d.querySelector('style['+k+']'))return;" +
        "var s=d.createElement('style');" +
        "s.setAttribute(k,'');" +
        `s.textContent=${JSON.stringify(css)};` +
        '(d.head||d.documentElement).appendChild(s);' +
        '})();\n' +
        entry.code
    },
  }
}

export default defineConfig({
  plugins: [react(), inlineCss()],
  // Library builds leave process.env.NODE_ENV alone on purpose — the assumption
  // is a bundler downstream will substitute it. Nothing is downstream of this
  // one but a <script> tag, so without this the bundle ships React's dev build
  // and dies on `process is not defined` the moment a host page loads it.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-mf',
    emptyOutDir: true,
    // Everything into the single stylesheet inlineCss() then absorbs.
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/export.jsx', import.meta.url)),
      // IIFE, not ESM: host pages here are classic <script> tags, and export.jsx
      // publishes its own window global rather than relying on this name.
      name: 'CelebLookalikeMFBundle',
      formats: ['iife'],
      fileName: () => 'celeb-lookalike-mf.js',
    },
  },
})
