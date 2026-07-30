import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Firestore } from '@google-cloud/firestore'
import { aggregateMatchRatingSummaries } from '../src/lib/domain'
import type { MatchRatingRecord } from '../src/types'

const confirmed = process.argv.includes('--yes')
const projectId = (
  JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
    projects: { default: string }
  }
).projects.default
const firestore = new Firestore({ projectId, databaseId: '(default)' })

async function backfill() {
  const snapshot = await firestore.collection('matchRatings').get()
  const ratings = snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }) as MatchRatingRecord)
  const summaries = aggregateMatchRatingSummaries(ratings)

  if (summaries.length === 0) {
    console.log('Nessun voto storico da aggregare.')
    return
  }

  if (!confirmed) {
    const input = createInterface({ input: stdin, output: stdout })
    try {
      const answer = await input.question(
        `Scrivere ${summaries.length} medie aggregate derivate da ${ratings.length} voti? [s/N] `,
      )
      if (!/^s(?:ì|i)?$/iu.test(answer.trim())) {
        console.log('Operazione annullata.')
        return
      }
    } finally {
      input.close()
    }
  }

  for (let offset = 0; offset < summaries.length; offset += 400) {
    const batch = firestore.batch()
    summaries.slice(offset, offset + 400).forEach((summary) => {
      batch.set(firestore.doc(`matchRatingSummaries/${summary.id}`), summary)
    })
    await batch.commit()
  }

  console.log(
    `Completato: ${summaries.length} medie aggregate da ${ratings.length} voti individuali.`,
  )
}

try {
  await backfill()
} finally {
  await firestore.terminate()
}
