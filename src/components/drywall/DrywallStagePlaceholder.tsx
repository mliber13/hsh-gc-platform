import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Construction } from 'lucide-react'

interface DrywallStagePlaceholderProps {
  title: string
  description: string
}

/** Placeholder for Quote / Field / Order stages until Phases C–E. */
export function DrywallStagePlaceholder({ title, description }: DrywallStagePlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Construction className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
