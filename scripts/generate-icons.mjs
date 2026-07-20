import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = await readFile(new URL('../public/favicon.svg', import.meta.url))
const output = new URL('../public/icons/', import.meta.url)
await mkdir(output, { recursive: true })

await Promise.all([
  sharp(source).resize(192, 192).png().toFile(fileURLToPath(new URL('padel-192.png', output))),
  sharp(source).resize(512, 512).png().toFile(fileURLToPath(new URL('padel-512.png', output))),
  sharp(source).resize(96, 96).png().toFile(fileURLToPath(new URL('padel-badge-96.png', output))),
])

console.log('Icone PWA generate: 192, 512 e badge 96 px.')
