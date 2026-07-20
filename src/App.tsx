import { useAuth } from './AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { Brand } from './components/Brand'
import { Dashboard } from './components/Dashboard'

export function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="splash-screen">
        <Brand />
        <span className="splash-screen__loader" aria-label="Caricamento" />
      </div>
    )
  }

  return user ? <Dashboard /> : <AuthScreen />
}

