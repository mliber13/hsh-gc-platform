// ============================================================================
// PendingAccount — shown to a signed-in account that was never provisioned
// ============================================================================
//
// Guards against the "orphaned viewer" failure: an account that authenticates
// but has no organization and no real role (only a bare `viewer`) would
// otherwise resolve to read access across every operator workspace. That
// happens when a crew invite is never consumed (revoked/expired/mismatched
// link, or email confirmation left signUp without a session). Rather than drop
// them into the full app, we park them here with a way to sign out.
//

import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import hshLogo from '/HSH Contractor Logo - Color.png'

export function PendingAccount() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#213069] to-[#1a2654] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={hshLogo} alt="HSH Contractor" className="h-24 w-auto" />
          </div>
          <CardTitle className="text-2xl text-center">Account not activated yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-gray-700">
            Your login was created, but it hasn&apos;t been linked to your crew profile yet.
            This usually means the invite link had expired or was already used.
          </p>
          <p className="text-gray-700">
            Please contact your office to get a fresh invite link, then use it to finish setting
            up your account.
          </p>
          {user?.email ? (
            <p className="text-sm text-gray-500">
              Signed in as <span className="font-medium">{user.email}</span>
            </p>
          ) : null}
          <Button
            onClick={() => void signOut()}
            variant="outline"
            className="w-full"
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
