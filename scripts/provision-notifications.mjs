import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import webpush from 'web-push'

const email = 'codex@kirivoraup.resend.app'
const env = await readFile(new URL('../.env.production', import.meta.url), 'utf8')
const apiKey = env.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1]
if (!apiKey) throw new Error('Firebase API key non trovata.')

const password = randomBytes(32).toString('base64url')
const signupResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
})
const signup = await signupResponse.json()
if (!signupResponse.ok) throw new Error(`Creazione notifier fallita: ${signup.error?.message || signupResponse.status}`)

const verificationResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    requestType: 'VERIFY_EMAIL',
    idToken: signup.idToken,
    continueUrl: 'https://bandeja-boys.web.app',
  }),
})
if (!verificationResponse.ok) throw new Error('Invio verifica email fallito.')

const vapid = webpush.generateVAPIDKeys()
const setGhValue = (kind, name, value) => {
  const result = spawnSync('gh', [kind, 'set', name], { input: value, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Configurazione GitHub ${name} fallita: ${result.stderr}`)
}

setGhValue('secret', 'FIREBASE_NOTIFIER_EMAIL', email)
setGhValue('secret', 'FIREBASE_NOTIFIER_PASSWORD', password)
setGhValue('secret', 'WEB_PUSH_VAPID_PRIVATE_KEY', vapid.privateKey)
setGhValue('variable', 'WEB_PUSH_VAPID_PUBLIC_KEY', vapid.publicKey)

console.log(JSON.stringify({
  uid: signup.localId,
  email,
  vapidPublicKey: vapid.publicKey,
  verificationSent: true,
}))
