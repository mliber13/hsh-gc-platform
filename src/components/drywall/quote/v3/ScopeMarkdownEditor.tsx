import { useRef, useState } from 'react'
import { Bold, Heading, Italic, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ScopeMarkdownPreview } from '@/components/drywall/quote/v3/ScopeMarkdownPreview'

type Props = {
  value: string
  readOnly: boolean
  onChange: (next: string) => void
  placeholder?: string
}

type FormatAction = 'bold' | 'italic' | 'heading' | 'bullet' | 'numbered'

const DEFAULT_PLACEHOLDER =
  'Enter the full scope as markdown.\n\n## Hang\n- 1/2" drywall on walls\n- **Level 4** finish\n'

export function applyMarkdownFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: FormatAction,
): { next: string; cursorStart: number; cursorEnd: number } {
  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)

  if (action === 'bold') {
    const inner = selected || 'text'
    const wrapped = `**${inner}**`
    return {
      next: `${before}${wrapped}${after}`,
      cursorStart: selectionStart + 2,
      cursorEnd: selectionStart + 2 + inner.length,
    }
  }

  if (action === 'italic') {
    const inner = selected || 'text'
    const wrapped = `*${inner}*`
    return {
      next: `${before}${wrapped}${after}`,
      cursorStart: selectionStart + 1,
      cursorEnd: selectionStart + 1 + inner.length,
    }
  }

  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
  const lineEndIdx = value.indexOf('\n', selectionEnd)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, lineEnd)
  const blockBefore = value.slice(0, lineStart)
  const blockAfter = value.slice(lineEnd)
  const lines = block.length ? block.split('\n') : ['']

  if (action === 'heading') {
    const nextLines = lines.map((line) => {
      const stripped = line.replace(/^#{1,6}\s+/, '')
      return `## ${stripped || 'Heading'}`
    })
    const nextBlock = nextLines.join('\n')
    return {
      next: `${blockBefore}${nextBlock}${blockAfter}`,
      cursorStart: lineStart,
      cursorEnd: lineStart + nextBlock.length,
    }
  }

  if (action === 'bullet') {
    const nextLines = lines.map((line) => {
      if (/^\s*[-*]\s+/.test(line)) return line
      if (/^\s*\d+\.\s+/.test(line)) return line.replace(/^\s*\d+\.\s+/, '- ')
      return `- ${line}`
    })
    const nextBlock = nextLines.join('\n')
    return {
      next: `${blockBefore}${nextBlock}${blockAfter}`,
      cursorStart: lineStart,
      cursorEnd: lineStart + nextBlock.length,
    }
  }

  const nextLines = lines.map((line, i) => {
    if (/^\s*\d+\.\s+/.test(line)) return line
    if (/^\s*[-*]\s+/.test(line)) return line.replace(/^\s*[-*]\s+/, `${i + 1}. `)
    return `${i + 1}. ${line}`
  })
  const nextBlock = nextLines.join('\n')
  return {
    next: `${blockBefore}${nextBlock}${blockAfter}`,
    cursorStart: lineStart,
    cursorEnd: lineStart + nextBlock.length,
  }
}

/**
 * Shared markdown editor for custom scope of work (v2 + v3 quote stages).
 */
export function ScopeMarkdownEditor({
  value,
  readOnly,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [scopeTab, setScopeTab] = useState<'edit' | 'preview'>('edit')

  const applyFormat = (action: FormatAction) => {
    if (readOnly) return
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const { next, cursorStart, cursorEnd } = applyMarkdownFormat(value, start, end, action)
    onChange(next)
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (!node) return
      node.focus()
      node.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  return (
    <Tabs
      value={scopeTab}
      onValueChange={(v) => setScopeTab(v === 'preview' ? 'preview' : 'edit')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-9">
          <TabsTrigger value="edit" className="px-3 text-xs">
            Edit
          </TabsTrigger>
          <TabsTrigger value="preview" className="px-3 text-xs">
            Preview
          </TabsTrigger>
        </TabsList>
        {!readOnly && scopeTab === 'edit' ? (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Bold"
              onClick={() => applyFormat('bold')}
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Italic"
              onClick={() => applyFormat('italic')}
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Heading"
              onClick={() => applyFormat('heading')}
            >
              <Heading className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Bullet list"
              onClick={() => applyFormat('bullet')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Numbered list"
              onClick={() => applyFormat('numbered')}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      <TabsContent value="edit" className="mt-2">
        <Textarea
          ref={textareaRef}
          rows={10}
          disabled={readOnly}
          className="font-mono text-sm"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Supports headings, bold, italic, and lists. Preview matches the crew view; customer PDF
          renders the same subset.
        </p>
      </TabsContent>
      <TabsContent value="preview" className="mt-2">
        <div className="min-h-[12rem] rounded-md border border-border bg-muted/20 p-3">
          <ScopeMarkdownPreview markdown={value} />
        </div>
      </TabsContent>
    </Tabs>
  )
}
