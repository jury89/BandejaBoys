import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/manrope'
import './styles.css'
import { App } from './App'
import { AuthProvider } from './AuthContext'
import { registerNotificationWorker } from './lib/notifications'

void registerNotificationWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
