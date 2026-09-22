import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { AuthProvider } from './lib/auth'
import { StoreProvider, useApplyPrefs, useStore } from './lib/store'
import Calendar from './pages/Calendar'
import Clarify from './pages/Clarify'
import Guide from './pages/Guide'
import Meetings from './pages/Meetings'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import Today from './pages/Today'

import './styles/tokens.css'
import './styles/app.css'

function App() {
  const { prefs } = useStore()
  useApplyPrefs(prefs)

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/clarify" element={<Clarify />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/knowledge" element={<Navigate to="/guide" replace />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StoreProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </StoreProvider>
    </React.StrictMode>,
  )
}
