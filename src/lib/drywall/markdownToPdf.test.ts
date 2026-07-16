import { describe, expect, it } from 'vitest'
import { parseInlineRuns } from './markdownToPdf'

describe('parseInlineRuns', () => {
  it('parses bold and italic markers', () => {
    expect(parseInlineRuns('Hang **Level 4** and *smooth* finish')).toEqual([
      { text: 'Hang ' },
      { text: 'Level 4', bold: true },
      { text: ' and ' },
      { text: 'smooth', italic: true },
      { text: ' finish' },
    ])
  })

  it('strips links and images to inner text', () => {
    expect(parseInlineRuns('See [plans](https://x.test) and ![](img.png)')).toEqual([
      { text: 'See plans and ' },
    ])
  })

  it('leaves plain text unchanged', () => {
    expect(parseInlineRuns('Hang and finish included.')).toEqual([
      { text: 'Hang and finish included.' },
    ])
  })
})
