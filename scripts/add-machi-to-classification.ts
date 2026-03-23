import * as fs from 'fs'
import * as path from 'path'

const tcPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
let c = fs.readFileSync(tcPath, 'utf-8')
const id = 'f78ecc20-3cc2-4224-b4af-20bb841380c6'
const entry = `"${id}":["sw","시간/날짜"]`
if (c.includes(id)) {
  console.log('Machi ID already in file')
  process.exit(0)
}
c = c.replace(/\}\s*;\s*export default data/, ',' + entry + '};\nexport default data')
fs.writeFileSync(tcPath, c)
console.log('Added Machi to topicClassification')
