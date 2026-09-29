import { describe, expect, it } from 'vitest'
import { isLegacyPublicQuoteUrl, quoteDocumentPath } from './quoteDocumentPath'

const ORG = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'
const PROJECT = '8c592048-126f-45fc-99c2-4717968cefba'
const FILE = '47d90989-0240-4ec9-a9ab-26e56be011da-1778767692476.pdf'
const PATH = `${ORG}/${PROJECT}/${FILE}`
const PUBLIC_URL = `https://rvtdavpsvrhbktbxquzm.supabase.co/storage/v1/object/public/quote-documents/${PATH}`

describe('quoteDocumentPath', () => {
  it('reads the path out of a stored public URL', () => {
    // The exact shape on the three live trades that predate the private bucket.
    expect(quoteDocumentPath(PUBLIC_URL)).toBe(PATH)
  })

  it('passes a stored path straight through', () => {
    expect(quoteDocumentPath(PATH)).toBe(PATH)
  })

  it('reads a signed URL too', () => {
    // A tab left open holds one of these; it should still resolve rather than 404.
    const signed = `https://x.supabase.co/storage/v1/object/sign/quote-documents/${PATH}?token=abc.def`
    expect(quoteDocumentPath(signed)).toBe(PATH)
  })

  it('drops a query string and fragment', () => {
    expect(quoteDocumentPath(`${PUBLIC_URL}?download=1`)).toBe(PATH)
    expect(quoteDocumentPath(`${PUBLIC_URL}#page=2`)).toBe(PATH)
  })

  it('decodes the escaping a URL adds, and only that', () => {
    // A URL is percent-encoded, so the path has to come back out decoded to match what
    // upload() was given.
    expect(
      quoteDocumentPath(
        `https://x.supabase.co/storage/v1/object/public/quote-documents/${ORG}/my%20quote.pdf`,
      ),
    ).toBe(`${ORG}/my quote.pdf`)

    // A stored path is already literal. Decoding it would corrupt a filename that genuinely
    // contains "%20", so it passes through untouched.
    expect(quoteDocumentPath(`${ORG}/my%20quote.pdf`)).toBe(`${ORG}/my%20quote.pdf`)
  })

  it('refuses a URL from another bucket rather than guessing', () => {
    // A wrong path mints a signed URL that 404s, which is harder to diagnose than a refusal.
    expect(
      quoteDocumentPath('https://x.supabase.co/storage/v1/object/public/project-documents/a/b.pdf'),
    ).toBeNull()
    expect(quoteDocumentPath('https://example.com/some.pdf')).toBeNull()
  })

  it('treats empty and missing values as no document', () => {
    expect(quoteDocumentPath(null)).toBeNull()
    expect(quoteDocumentPath(undefined)).toBeNull()
    expect(quoteDocumentPath('   ')).toBeNull()
    expect(quoteDocumentPath('/')).toBeNull()
  })

  it('strips a leading slash so the path matches what upload wrote', () => {
    expect(quoteDocumentPath(`/${PATH}`)).toBe(PATH)
  })
})

describe('isLegacyPublicQuoteUrl', () => {
  it('spots a stored public URL', () => {
    expect(isLegacyPublicQuoteUrl(PUBLIC_URL)).toBe(true)
  })

  it('does not flag a path or a signed URL', () => {
    expect(isLegacyPublicQuoteUrl(PATH)).toBe(false)
    expect(
      isLegacyPublicQuoteUrl(`https://x.supabase.co/storage/v1/object/sign/quote-documents/${PATH}`),
    ).toBe(false)
  })
})
