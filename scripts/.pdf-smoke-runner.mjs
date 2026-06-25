
import { readFileSync, writeFileSync } from 'fs'
import { parseOrgDrywallCatalogs } from '../src/lib/drywall/catalogUtils.ts'
import { hydrateDrywallQuote } from '../src/lib/drywall/createEmptyDrywallQuote.ts'
import { buildV3FromV2 } from '../src/lib/drywall/convertQuoteV2ToV3.ts'
import { generateDrywallQuoteV3Pdf, buildDrywallQuoteV3PdfFilename } from '../src/lib/drywallQuotePdfV3.ts'
import { generateDrywallQuotePdf } from '../src/lib/drywallQuotePdf.ts'

const payload = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const outDir = process.argv[3]
const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)

for (const project of payload.projects) {
  const v2 = hydrateDrywallQuote(project.v2Quote)
  const quote = buildV3FromV2(v2)
  const input = {
    project: {
      id: project.id,
      name: project.name,
      client: project.client ?? 'Test Client',
      address: project.address ?? '',
    },
    quote,
    catalogs,
    company: {
      name: 'HSH Drywall',
      address: 'PO Box 102 Lisbon, OH 44432',
      phone: '330-614-1127',
      email: 'mark@hshdrywall.com',
    },
  }
  const v3Blob = await generateDrywallQuoteV3Pdf(input)
  const v3Name = buildDrywallQuoteV3PdfFilename(project.name, quote.quoteNumber)
  writeFileSync(outDir + '/' + v3Name, Buffer.from(await v3Blob.arrayBuffer()))

  const v2Blob = await generateDrywallQuotePdf({
    project: {
      id: project.id,
      name: project.name,
      client: project.client ?? 'Test Client',
      address: project.address ?? '',
    },
    quote: v2,
  })
  const safe = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_')
  writeFileSync(outDir + '/' + safe + '_v2.pdf', Buffer.from(await v2Blob.arrayBuffer()))
  console.log('Wrote', v3Name, 'and', safe + '_v2.pdf')
}
