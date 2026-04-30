// ============================================================================
// AuthedLayout — auth gate + global providers for all authenticated routes
// ============================================================================
//
// Wraps every authenticated route with:
//   - AuthGate (login/signup/reset flow when no session)
//   - TradeCategoriesProvider (global trade-category data)
//
// The sidebar shell (AppLayout) sits as a nested layout route below this one
// in src/routes/index.tsx; routes that need to be authed-but-shell-less can
// be placed as direct children of AuthedLayout instead of nesting under
// AppLayout. (Phase 1 puts every authed route inside the shell.)
//

import { Outlet } from 'react-router-dom'
import { AuthGate } from '@/components/auth/AuthGate'
import { TradeCategoriesProvider } from '@/contexts/TradeCategoriesContext'

export function AuthedLayout() {
  return (
    <AuthGate>
      <TradeCategoriesProvider>
        <Outlet />
      </TradeCategoriesProvider>
    </AuthGate>
  )
}
