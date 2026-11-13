import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/manrope'
import './styles.css'
import './clubhouse.css'
import { App } from './App'
import { AuthProvider } from './AuthContext'
import { watchForAppUpdates } from './lib/appUpdates'
import { registerNotificationWorker } from './lib/notifications'
import { watchInputModality } from './lib/inputModality'

const stopInputModalityTracking = watchInputModality()
if (import.meta.hot) import.meta.hot.dispose(stopInputModalityTracking)
watchForAppUpdates()
void registerNotificationWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
