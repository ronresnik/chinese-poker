import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { initAuth } from './store/useAuthStore.js'
import './index.css'

// Anonymous auth session — needed for online play and leaderboard
// attribution, not for single-player (see src/store/useAuthStore.js).
initAuth()

// HashRouter is required (not BrowserRouter) because GitHub Pages serves
// static files with no server-side rewrites — hash-based routes always
// resolve to index.html regardless of the deep link.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
