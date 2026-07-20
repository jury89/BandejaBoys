import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { Brand } from './Brand'
import { hasRemoteBackend } from '../lib/firebase'

type AuthMode = 'signin' | 'register'

function friendlyError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.includes('email-already-in-use')) return 'Esiste già un account con questa email.'
  if (code.includes('invalid-credential')) return 'Email o password non corretti.'
  if (code.includes('invalid-email')) return 'Controlla che l’email sia scritta correttamente.'
  if (code.includes('weak-password')) return 'Scegli una password di almeno 6 caratteri.'
  return error instanceof Error ? error.message : 'Qualcosa non ha funzionato. Riprova.'
}

export function AuthScreen() {
  const { signIn, register, resetPassword } = useAuth()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'register') await register(displayName, email, password)
      else await signIn(email, password)
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  const recover = async () => {
    if (!email) {
      setError('Inserisci prima la tua email.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await resetPassword(email)
      setMessage('Ti abbiamo inviato il link per scegliere una nuova password.')
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story__copy">
          <p className="eyebrow eyebrow--light">Il lunedì si vota. La settimana dopo si gioca.</p>
          <h1>Quattro posti.<br />Zero caos in chat.</h1>
          <p>
            Scegli gli slot, tieni l’ordine di adesione e fai entrare le riserve senza perdere il filo.
          </p>
        </div>
        <div className="mini-court" aria-hidden="true">
          <span className="mini-court__line" />
          {[1, 2, 3, 4].map((number) => <i key={number}>{number}</i>)}
          <b>4/4</b>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {!hasRemoteBackend && (
            <p className="demo-note"><span /> Modalità demo locale</p>
          )}
          <div className="segmented" aria-label="Scegli tra accesso e registrazione">
            <button className={mode === 'signin' ? 'is-active' : ''} type="button" onClick={() => setMode('signin')}>
              Accedi
            </button>
            <button className={mode === 'register' ? 'is-active' : ''} type="button" onClick={() => setMode('register')}>
              Crea account
            </button>
          </div>

          <div className="auth-card__title">
            <p className="eyebrow">Area squadra</p>
            <h2>{mode === 'signin' ? 'Bentornato in campo.' : 'Entra nel gruppo.'}</h2>
            <p>{mode === 'signin' ? 'Accedi per vedere i prossimi sondaggi.' : 'Usa il nome con cui ti conoscono gli amici.'}</p>
          </div>

          <form onSubmit={submit} className="form-stack">
            {mode === 'register' && (
              <label className="field">
                <span>Nome visibile</span>
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Es. Jury"
                  required
                  minLength={2}
                />
              </label>
            )}
            <label className="field field--icon">
              <span>Email</span>
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@email.it"
                required
              />
            </label>
            <label className="field field--icon">
              <span>Password</span>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Almeno 6 caratteri"
                minLength={6}
                required
              />
            </label>

            {error && <p className="form-message form-message--error" role="alert">{error}</p>}
            {message && <p className="form-message form-message--success" role="status">{message}</p>}

            <button className="button button--primary button--wide" type="submit" disabled={busy}>
              {busy ? 'Un attimo…' : mode === 'signin' ? 'Entra' : 'Crea il mio account'}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>

          {mode === 'signin' && (
            <button className="text-button auth-card__recover" type="button" onClick={recover} disabled={busy}>
              Password dimenticata?
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

