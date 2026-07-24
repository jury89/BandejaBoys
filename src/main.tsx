import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/manrope'
import './styles.css'
import { App } from './App'
import { AuthProvider } from './AuthContext'
import { watchForAppUpdates } from './lib/appUpdates'
import { registerNotificationWorker } from './lib/notifications'

watchForAppUpdates()
void registerNotificationWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
