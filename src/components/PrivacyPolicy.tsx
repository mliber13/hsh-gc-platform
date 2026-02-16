// ============================================================================
// Privacy Policy – Live page for compliance (e.g. Intuit production)
// ============================================================================
// URL: /privacy

import React from 'react'
import { Button } from '@/components/ui/button'

interface PrivacyPolicyProps {
  onBack?: () => void
  showBackButton?: boolean
}

export function PrivacyPolicy({ onBack, showBackButton = true }: PrivacyPolicyProps) {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {showBackButton && onBack && (
          <Button onClick={onBack} variant="outline" className="mb-6">
            ← Back to app
          </Button>
        )}

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US')}</p>

        <div className="prose prose-gray max-w-none space-y-6 text-sm">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">1. Introduction</h2>
            <p>
              This Privacy Policy describes how HSH Contractor (“we,” “our,” or “us”) collects, uses, and protects
              information when you use the HSH GC Platform (the “App”), including its integration with QuickBooks Online.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">2. Information We Collect</h2>
            <p>We collect and store:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Account information:</strong> email address and profile data (e.g. name, role) when you sign in (via Supabase Auth).</li>
              <li><strong>App data:</strong> projects, estimates, actuals (labor, material, subcontractor entries), change orders, documents, and related data you create in the App.</li>
              <li><strong>QuickBooks data:</strong> if you connect QuickBooks, we store OAuth tokens and use them to read/write data (e.g. vendors, checks, transactions) in your QuickBooks company as permitted by your authorization.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">3. How We Use Your Information</h2>
            <p>
              We use the information to operate the App (e.g. store your projects and actuals, sync with QuickBooks when you choose),
              to improve the service, and to comply with law. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">4. Data Storage and Security</h2>
            <p>
              Data is stored in Supabase (database and auth) and, when you use QuickBooks, is transmitted to Intuit’s
              QuickBooks Online API under their privacy and security practices. We use industry-standard measures to
              protect data in transit and at rest.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">5. Third Parties</h2>
            <p>
              <strong>Supabase:</strong> hosts our database and authentication. <strong>Intuit / QuickBooks:</strong> when you connect
              QuickBooks, Intuit’s OAuth and API policies apply to that data. We do not share your data with other third
              parties for marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">6. Your Choices</h2>
            <p>
              You can disconnect QuickBooks at any time from the App settings. You can request access to or deletion of
              your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">7. Contact</h2>
            <p>
              For privacy-related questions or requests, contact us at the support or contact information provided in the App or by your administrator.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
