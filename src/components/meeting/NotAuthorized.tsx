import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function NotAuthorized() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Not authorized</CardTitle>
          <CardDescription>
            You need meeting operator access to view this page.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
