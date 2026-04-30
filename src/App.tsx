// ============================================================================
// App — root component
// ============================================================================
//
// All routing logic moved to src/routes/. This file is now a thin shell
// providing the theme + routes table + global toaster.
//
// Auth gating, the legacy floating user-menu, and the per-page navigation
// callbacks live inside src/routes/AuthedLayout.tsx and src/routes/index.tsx.
//

import { ThemeProvider } from './components/theme-provider'
import { Toaster } from 'sonner'
import { AppRoutes } from './routes'

function App() {
  return (
    <ThemeProvider>
      <AppRoutes />
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  )
}

export default App
