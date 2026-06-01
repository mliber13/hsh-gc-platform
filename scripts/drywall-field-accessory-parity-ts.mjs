import { calculateFieldAccessories } from '../src/lib/drywall/accessoryCalc.ts'

const r = calculateFieldAccessories(52954, 0, { ceilingFinish: 'Level 4' })
const pick = (t, s) => r.find((x) => x.type === t && x.subtype === s)?.quantity
console.log('GC accessoryCalc @ 52954 sqft Level 4:')
console.log('  All Purpose:', pick('Joint Compound', 'All Purpose Joint Compound'))
console.log('  Lite Weight:', pick('Joint Compound', 'Lite Weight Joint Compound'))
console.log('  Easy Sand 90:', pick('Joint Compound', 'Easy Sand 90'))
console.log('  Screws:', pick('Fasteners', 'Drywall Screws 1-1/4"'))
