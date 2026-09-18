import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchCrewJobDocuments,
  getCrewJobDocumentSignedUrl,
  type CrewJobDocument,
} from '@/services/crewJobDocumentsService'

const TYPE_LABEL: Record<CrewJobDocument['type'], string> = {
  plan: 'Plan',
  specification: 'Specification',
}

export function CrewJobDocumentsCard({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<CrewJobDocument[] | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchCrewJobDocuments(projectId)
      .then((rows) => {
        if (!cancelled) setDocuments(rows)
      })
      .catch((e) => {
        console.error('fetchCrewJobDocuments failed:', e)
        if (!cancelled) setDocuments([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const openDocument = async (doc: CrewJobDocument) => {
    if (!doc.storagePath) {
      toast.error('This file is not available to open.')
      return
    }
    setOpeningId(doc.id)
    try {
      const url = await getCrewJobDocumentSignedUrl(doc.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open that document')
    } finally {
      setOpeningId(null)
    }
  }

  if (!documents || documents.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => void openDocument(doc)}
            disabled={openingId === doc.id}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted disabled:opacity-60"
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{doc.name}</span>
              <span className="block text-xs text-muted-foreground">{TYPE_LABEL[doc.type]}</span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">
              {openingId === doc.id ? 'Opening…' : 'Open'}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
