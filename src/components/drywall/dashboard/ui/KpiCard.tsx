import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
  emphasized?: boolean
}

export function KpiCard({
  title,
  description,
  children,
  className,
  headerRight,
  emphasized = false,
}: Props) {
  return (
    <Card
      className={cn(
        emphasized && 'border-primary/30 bg-gradient-to-br from-primary/5 to-transparent shadow-md',
        className,
      )}
    >
      <CardHeader className={cn('pb-3', emphasized && 'pb-4')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className={cn(emphasized ? 'text-xl' : 'text-base')}>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {headerRight}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
