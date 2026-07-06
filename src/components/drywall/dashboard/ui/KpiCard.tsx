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
        'flex h-full flex-col',
        emphasized && 'border-primary/30 bg-gradient-to-br from-primary/5 to-transparent shadow-md',
        className,
      )}
    >
      <CardHeader className={cn('pb-2', emphasized && 'pb-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className={cn(emphasized ? 'text-xl' : 'text-base')}>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {headerRight}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">{children}</CardContent>
    </Card>
  )
}
