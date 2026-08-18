import assert from 'node:assert/strict'
import { FieldValue, Firestore, type DocumentData } from '@google-cloud/firestore'

const PROJECT_ID = 'bandeja-boys'
const DATABASE_ID = '(default)'

interface PollSnapshot {
  id: string
  data: DocumentData
}

function withoutStructuralWeek(data: DocumentData): DocumentData {
  const rest = { ...data }
  delete rest.title
  delete rest.targetWeekStart
  return rest
}

function totals(polls: PollSnapshot[]) {
  return polls.reduce((summary, poll) => {
    const slots = Array.isArray(poll.data.slots) ? poll.data.slots : []
    summary.slots += slots.length
    summary.signups += slots.reduce((count: number, slot: DocumentData) => (
      count + (Array.isArray(slot.signups) ? slot.signups.length : 0)
    ), 0)
    return summary
  }, { documents: polls.length, slots: 0, signups: 0 })
}

async function readPolls(firestore: Firestore): Promise<PollSnapshot[]> {
  const snapshot = await firestore.collection('polls').get()
  return snapshot.docs
    .map((document) => ({ id: document.id, data: document.data() }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function verifyPreserved(before: PollSnapshot[], after: PollSnapshot[]) {
  assert.deepStrictEqual(after.map(({ id }) => id), before.map(({ id }) => id))

  before.forEach((poll, index) => {
    const migrated = after[index]
    assert.equal('title' in migrated.data, false, `${poll.id}: title non rimosso`)
    assert.equal('targetWeekStart' in migrated.data, false, `${poll.id}: targetWeekStart non rimosso`)
    assert.deepStrictEqual(
      migrated.data,
      withoutStructuralWeek(poll.data),
      `${poll.id}: la migrazione ha modificato dati diversi dalla settimana`,
    )
  })

  assert.deepStrictEqual(totals(after), totals(before))
}

async function run() {
  const apply = process.argv.includes('--apply')
  const firestore = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID })

  try {
    const before = await readPolls(firestore)
    const summary = totals(before)
    const documentsToClean = before.filter(({ data }) => (
      'title' in data || 'targetWeekStart' in data
    ))

    console.log(
      `${apply ? 'Migrazione' : 'Anteprima'}: ${summary.documents} documenti, `
      + `${summary.slots} slot, ${summary.signups} adesioni; `
      + `${documentsToClean.length} documenti da normalizzare.`,
    )

    if (!apply || documentsToClean.length === 0) return

    const batch = firestore.batch()
    documentsToClean.forEach(({ id }) => {
      batch.update(firestore.collection('polls').doc(id), {
        title: FieldValue.delete(),
        targetWeekStart: FieldValue.delete(),
      })
    })
    await batch.commit()

    const after = await readPolls(firestore)
    verifyPreserved(before, after)
    console.log(
      `Verifica superata: conservati ${summary.documents} documenti, `
      + `${summary.slots} slot e ${summary.signups} adesioni.`,
    )
  } finally {
    await firestore.terminate()
  }
}

await run()
