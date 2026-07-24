import { describe, expect, it } from 'vitest'
import {
  buildWorkflowDispatchArgs,
  parsePushSendOptions,
  resolvePushRecipient,
  validatePushContent,
  type PushRecipient,
} from './push-send.lib'

const recipients: PushRecipient[] = [
  { id: 'uid-tommy', displayName: 'Tommy', deviceCount: 1 },
  { id: 'uid-luigi', displayName: 'Luigi', deviceCount: 2 },
]

describe('push send CLI', () => {
  it('accetta il nome come argomento posizionale', () => {
    expect(parsePushSendOptions([
      'Tommy',
      '--title',
      'Forza Tommy',
      '--message',
      'Rimettiti presto!',
      '--yes',
    ], {})).toMatchObject({
      to: 'Tommy',
      title: 'Forza Tommy',
      message: 'Rimettiti presto!',
      projectId: 'bandeja-boys',
      databaseId: '(default)',
      yes: true,
      wait: true,
    })
  })

  it('trova il nome senza distinguere maiuscole e minuscole', () => {
    expect(resolvePushRecipient(recipients, { to: 'tommy' })).toEqual(recipients[0])
  })

  it('rifiuta nomi duplicati e destinatari inesistenti', () => {
    expect(() => resolvePushRecipient([
      ...recipients,
      { id: 'uid-tommy-2', displayName: 'TOMMY', deviceCount: 1 },
    ], { to: 'Tommy' })).toThrow('usa --uid')
    expect(() => resolvePushRecipient(recipients, { to: 'Michele' }))
      .toThrow('Nessun utente chiamato')
  })

  it('valida titolo e messaggio', () => {
    expect(validatePushContent('  Forza Tommy  ', '  Rimettiti presto!  ')).toEqual({
      title: 'Forza Tommy',
      message: 'Rimettiti presto!',
    })
    expect(() => validatePushContent('', 'Messaggio')).toThrow('titolo non può essere vuoto')
    expect(() => validatePushContent('Titolo', 'x'.repeat(241))).toThrow('240 caratteri')
  })

  it('costruisce il dispatch senza usare una shell', () => {
    expect(buildWorkflowDispatchArgs(
      recipients[0],
      'Forza Tommy',
      'Vecchio rottame, rimettiti!',
    )).toEqual([
      'workflow',
      'run',
      'notifications.yml',
      '--ref',
      'main',
      '-f',
      'test_user_id=uid-tommy',
      '-f',
      'test_title=Forza Tommy',
      '-f',
      'test_message=Vecchio rottame, rimettiti!',
      '-f',
      'test_mode=standard',
    ])
  })
})
