import React from 'react'
import { createRoot } from 'react-dom/client'

import ExportApp from './ExportApp.jsx'
import './styles.css'

const MF_NAME = 'celeb-lookalike'
const GLOBAL_KEY = 'CelebLookalikeMF'

// One React root per container. Keyed by element rather than by selector so two
// popups on the same page cannot collide, and so unmount() can find the root
// again given only the node.
const roots = new Map()

// Containers this bundle created itself (via open()). Only these may be removed
// from the DOM on teardown — a host-supplied <div> is the host's to keep.
const owned = new WeakSet()

function resolveContainer(container) {
  const element = typeof container === 'string' ? document.querySelector(container) : container

  if (!element) {
    throw new Error(`[${GLOBAL_KEY}] mount target not found: ${container}`)
  }

  return element
}

/**
 * @param {Element|string} container
 * @returns {boolean} false when nothing was mounted there
 */
function unmount(container) {
  const element = resolveContainer(container)
  const root = roots.get(element)

  if (!root) {
    return false
  }

  root.unmount()
  roots.delete(element)

  if (owned.has(element)) {
    owned.delete(element)
    element.remove()
  }

  return true
}

/**
 * Render the popup into a container the host already has.
 *
 * @param {Element|string} container - element or CSS selector
 * @param {object} [props] - apiBase, title, tagline, onClose, closeOnBackdrop
 * @returns {() => void} cleanup that unmounts this instance
 */
function mount(container, props = {}) {
  const element = resolveContainer(container)

  // Remounting into a container React already owns would warn and leak the old
  // root, so tear it down first. Makes mount() safe to call repeatedly.
  unmount(element)

  const root = createRoot(element)
  roots.set(element, root)

  // Closing disposes the instance, so the host does not have to hold on to the
  // cleanup just to make the ✕ work. React is mid-event when this fires and
  // unmounting a root from inside its own handler warns, hence the deferral.
  function close() {
    props.onClose?.()
    setTimeout(() => unmount(element), 0)
  }

  root.render(React.createElement(ExportApp, { ...props, onClose: close }))

  return () => unmount(element)
}

/**
 * Same as mount(), but makes its own container at the end of <body>. This is the
 * one to call for a plain "open the popup" button — there is nothing to add to
 * the page first, and the container is removed again on close.
 *
 * @param {object} [props]
 * @returns {() => void} cleanup
 */
function open(props = {}) {
  const element = document.createElement('div')
  element.setAttribute('data-celeb-lookalike-mf', '')
  document.body.appendChild(element)
  owned.add(element)

  return mount(element, props)
}

window[GLOBAL_KEY] = { name: MF_NAME, mount, unmount, open }
