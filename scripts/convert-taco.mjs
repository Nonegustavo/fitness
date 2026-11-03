// Converts the TACO JSON (github.com/marcelosanto/tabela_taco, MIT) into the compact table
// bundled with the app at src/features/food/taco.json.
// Source data: TACO 4ª edição, NEPA/UNICAMP, 2011 — reproduction allowed with the source cited.
// Usage: node scripts/convert-taco.mjs <TACO.json> src/features/food/taco.json
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
const rows = JSON.parse(readFileSync(input, 'utf8'))

const number = (value) => {
  if (value === 'Tr') return 0 // trace
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null // NA, *, empty
}
const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)))

const categories = []
const foods = []
const problems = []
for (const row of rows) {
  if (typeof row.id !== 'number' || typeof row.description !== 'string') {
    problems.push(['bad row', row.id])
    continue
  }
  // "*" = not analyzed in TACO (e.g. fluid whole milk): no data to offer.
  if (row.energy_kcal === '*') {
    problems.push(['skipped, not analyzed', row.id, row.description])
    continue
  }
  let category = categories.indexOf(row.category)
  if (category === -1) category = categories.push(row.category) - 1
  const kcal = number(row.energy_kcal)
  const protein = number(row.protein_g)
  const carbs = number(row.carbohydrate_g)
  const fat = number(row.lipid_g)
  const fiber = number(row.fiber_g)
  if (kcal === null) problems.push(['no kcal', row.id, row.description])
  foods.push([
    row.id,
    row.description.replace(/\s+/g, ' ').trim(),
    category,
    round(kcal ?? 0, 0),
    round(protein ?? 0, 1),
    round(carbs ?? 0, 1),
    round(fat ?? 0, 1),
    round(fiber, 1),
  ])
}

const ids = new Set(foods.map((f) => f[0]))
writeFileSync(output, JSON.stringify({ categories, foods }))
console.log(JSON.stringify({ foods: foods.length, uniqueIds: ids.size, categories: categories.length, problems }, null, 1))
console.log(foods.slice(0, 3), foods.find((f) => f[1].startsWith('Feijão, carioca, cozido')), foods.find((f) => f[1].startsWith('Frango, peito, sem pele, grelhado')))
