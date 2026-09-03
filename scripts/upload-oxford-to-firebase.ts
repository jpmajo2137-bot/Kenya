/**
 * Oxford 5000 (한국어→영어) JSON → Firestore 업로드
 *
 *   npx tsx scripts/upload-oxford-to-firebase.ts --emulator
 *   npx tsx scripts/upload-oxford-to-firebase.ts
 *
 * 에뮬레이터: --emulator 또는 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 * 프로덕션: GOOGLE_APPLICATION_CREDENTIALS + VITE_FIREBASE_PROJECT_ID
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const JSON_PATH = path.join(__dirname, '../src/data/oxfordKoEn.json')
const CHUNK_SIZE = 400
const args = new Set(process.argv.slice(2))
const USE_EMULATOR =
  args.has('--emulator') ||
  process.env.VITE_FIREBASE_USE_EMULATOR === 'true' ||
  Boolean(process.env.FIRESTORE_EMULATOR_HOST)

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-oxford-ko-en'

type OxfordJsonRow = Record<string, unknown>

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('Missing', JSON_PATH)
    console.error('먼저 python3 scripts/parse-oxford-pdf.py 를 실행하세요.')
    process.exit(1)
  }
  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as OxfordJsonRow[]
  console.log(`Loaded ${rows.length} words from JSON`)

  if (USE_EMULATOR) {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
    initializeApp({ projectId })
    console.log(`Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`)
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId,
    })
    console.log(`Using Firebase project ${projectId}`)
  }

  const db = getFirestore()
  const chunks: OxfordJsonRow[][] = []
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE))
  }

  const batch = db.batch()
  chunks.forEach((items, index) => {
    const id = `chunk_${String(index).padStart(2, '0')}`
    batch.set(db.collection('oxford_ko_en_chunks').doc(id), { index, items })
  })
  batch.set(db.collection('oxford_ko_en_meta').doc('stats'), {
    count: rows.length,
    chunkCount: chunks.length,
    source: 'Oxford_5000_Final_Newest_edition_2024',
    updatedAt: new Date().toISOString(),
  })
  await batch.commit()
  console.log(`Uploaded ${rows.length} words in ${chunks.length} chunks`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
