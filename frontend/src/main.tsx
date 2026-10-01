import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { legacyRoute } from './app/routes'
import './styles/index.css'

// 404.html is this same page. Addresses from the previous site (or any other
// unknown path) are rewritten to their hash route before the router starts.
const { pathname, hash } = window.location
if (pathname !== '/' && pathname !== '/index.html') {
  const target = legacyRoute(pathname) ?? `/not-found?from=${encodeURIComponent(pathname)}`
  window.history.replaceState(null, '', `/#${hash.startsWith('#/') ? hash.slice(1) : target}`)
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
