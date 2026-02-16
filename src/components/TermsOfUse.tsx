// ============================================================================
// Terms of Use / End-User License Agreement – Live page for compliance (e.g. Intuit production)
// ============================================================================
// URL: /terms

import React from 'react'
import { Button } from '@/components/ui/button'

interface TermsOfUseProps {
  onBack?: () => void
  showBackButton?: boolean
}

export function TermsOfUse({ onBack, showBackButton = true }: TermsOfUseProps) {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {showBackButton && onBack && (
          <Button onClick={onBack} variant="outline" className="mb-6">
            ← Back to app
          </Button>
        )}

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Terms of Use & End-User License Agreement</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US')}</p>

        <div className="prose prose-gray max-w-none space-y-6 text-sm">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">1. Agreement</h2>
            <p>
              By accessing or using the HSH GC Platform (the “App”), you agree to these Terms of Use and End-User License
              Agreement (“EULA”). If you are using the App on behalf of a company, you represent that you have authority to bind that entity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">2. License</h2>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to use the App for your internal business
              purposes in accordance with these terms. You may not copy, modify, distribute, or reverse-engineer the App
              or use it to build a competing product.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">3. QuickBooks Integration</h2>
            <p>
              If you connect QuickBooks Online, you are also subject to Intuit’s applicable terms and policies. You
              authorize us to access and use your QuickBooks data only as needed to provide the App’s features (e.g.
              syncing checks, vendors, transactions). You may revoke this access at any time by disconnecting QuickBooks in the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">4. Acceptable Use</h2>
            <p>
              You agree to use the App only for lawful purposes. You may not use it to transmit harmful code, violate
              any law, or infringe others’ rights. We may suspend or terminate access for violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">5. Disclaimer</h2>
            <p>
              The App is provided “as is.” We disclaim warranties of merchantability, fitness for a particular purpose,
              and non-infringement. We are not liable for any indirect, incidental, or consequential damages arising from your use of the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">6. Changes</h2>
            <p>
              We may update these terms from time to time. Continued use of the App after changes constitutes acceptance. The “Last updated” date at the top reflects the latest revision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">7. Contact</h2>
            <p>
              For questions about these terms, contact us at the support or contact information provided in the App or by your administrator.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
