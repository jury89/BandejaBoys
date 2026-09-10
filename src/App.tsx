import { useAuth } from './AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { Brand } from './components/Brand'
import { Dashboard } from './components/Dashboard'
import { InterfaceProvider } from './InterfaceContext'

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

  return <InterfaceProvider preference={user?.interfaceMode}>{user ? <Dashboard /> : <AuthScreen />}</InterfaceProvider>
}
