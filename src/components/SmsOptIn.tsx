// ============================================================================
// SMS Opt-In – Public opt-in page for A2P 10DLC campaign verification
// ============================================================================
// URL: /sms-opt-in  (public, no auth)
//
// Purpose: a hosted Call-to-Action reviewers can load to verify how end users
// consent to receive SMS. Satisfies A2P codes 30909/30917/30924/30925/30919.
// The consent checkbox is UNCHECKED by default (30925) and carries compliant
// consent language (30924). Submissions are NOT stored — the page confirms
// on-screen; real number collection also happens in person in the field.

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function SmsOptIn() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digits = phone.replace(/\D/g, '')
  const canSubmit = name.trim().length > 1 && digits.length >= 10 && consent

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) {
      setError('Please enter your name.')
      return
    }
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    if (!consent) {
      setError('Please check the consent box to opt in.')
      return
    }
    // No server storage — this is a compliant CTA; confirm on-screen only.
    setError(null)
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            HSH Contractor <span className="text-gray-400">/</span> HSH Drywall
          </h1>
          <p className="mt-1 text-sm text-gray-500">Text Message Updates — Sign Up</p>
        </header>

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
            <h2 className="text-lg font-semibold text-green-800">You&rsquo;re signed up</h2>
            <p className="mt-2 text-sm text-green-700">
              Thanks, {name.trim()}. You&rsquo;ve opted in to receive job and schedule text
              messages from HSH Contractor (HSH Drywall) at {phone.trim()}. Reply{' '}
              <strong>STOP</strong> at any time to unsubscribe, or <strong>HELP</strong> for help.
            </p>
          </div>
        ) : (
          <>
            <section className="mb-6 space-y-3 text-sm text-gray-700">
              <p>
                HSH Contractor (HSH Drywall) sends text messages to our field crew members,
                subcontractors, customers, and general-contractor superintendents to coordinate
                work on their projects.
              </p>
              <p>
                Message types include <strong>job schedule updates</strong>,{' '}
                <strong>appointment and material-delivery coordination</strong>, and{' '}
                <strong>job-status notifications</strong>. Message frequency varies based on job
                activity.
              </p>
              <p className="text-gray-600">
                Message and data rates may apply. Reply <strong>STOP</strong> to unsubscribe at any
                time, or <strong>HELP</strong> for assistance. We do not sell, rent, or share your
                mobile number or SMS consent with any third parties for their marketing purposes.
              </p>
            </section>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="optin-name" className="block text-sm font-medium text-gray-900">
                  Full name
                </label>
                <input
                  id="optin-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label htmlFor="optin-phone" className="block text-sm font-medium text-gray-900">
                  Mobile number
                </label>
                <input
                  id="optin-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="(555) 555-5555"
                />
              </div>

              <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <input
                  id="optin-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-gray-300"
                />
                <label htmlFor="optin-consent" className="text-xs leading-relaxed text-gray-700">
                  By checking this box, I agree to receive recurring SMS text messages from HSH
                  Contractor (HSH Drywall) about project schedules, coordination, and job status at
                  the mobile number provided. Consent is not a condition of purchase. Message
                  frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP
                  for help. See our{' '}
                  <a href="/privacy" className="underline" target="_blank" rel="noreferrer">
                    Privacy Policy
                  </a>{' '}
                  and{' '}
                  <a href="/terms" className="underline" target="_blank" rel="noreferrer">
                    Terms of Use
                  </a>
                  .
                </label>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" disabled={!canSubmit} className="w-full">
                Sign up for text updates
              </Button>
            </form>
          </>
        )}

        <footer className="mt-10 border-t pt-4 text-xs text-gray-400">
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{' '}
          &middot;{' '}
          <a href="/terms" className="underline">
            Terms of Use
          </a>
        </footer>
      </div>
    </div>
  )
}
