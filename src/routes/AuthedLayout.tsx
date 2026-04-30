// ============================================================================
// AuthedLayout — layout route for all authenticated pages
// ============================================================================
//
// Wraps every authenticated route with:
//   - AuthGate (login/signup/reset flow when no session)
//   - TradeCategoriesProvider (global trade-category data)
//   - The legacy floating user-menu in the top-right
//   - Feedback modal
//
// This file is transitional. The sidebar shell (next migration commit) will
// replace the floating user-menu with a sidebar footer, and reduce this file
// to a thin AuthGate + Provider + Outlet wrapper.
//

import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Building2,
  Crown,
  Download,
  Eye,
  FileText,
  Link2,
  LogOut,
  MessageSquare,
  Pencil,
  User,
} from 'lucide-react'
import { AuthGate } from '@/components/auth/AuthGate'
import { useAuth } from '@/contexts/AuthContext'
import { TradeCategoriesProvider } from '@/contexts/TradeCategoriesContext'
import { FeedbackForm } from '@/components/FeedbackForm'
import { backupAllData } from '@/services/backupService'
import { getCurrentUserProfile, UserProfile } from '@/services/userService'

export function AuthedLayout() {
  return (
    <AuthGate>
      <TradeCategoriesProvider>
        <div className="min-h-screen bg-background">
          <UserMenuFixed />
          <Outlet />
        </div>
      </TradeCategoriesProvider>
    </AuthGate>
  )
}

// ----------------------------------------------------------------------------
// UserMenuFixed — legacy top-right user menu (to be replaced by sidebar footer)
// ----------------------------------------------------------------------------

function UserMenuFixed() {
  const { user, signOut, isOnline } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile().then((profile) => {
        setUserProfile(profile)
      })
    }
  }, [isOnline, user])

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
    setUserProfile(null)
    navigate('/', { replace: true })
  }

  const handleBackupData = async () => {
    if (!isOnline) {
      alert('You must be online to backup data from Supabase')
      return
    }
    setIsBackingUp(true)
    try {
      await backupAllData()
      alert(
        '✅ Backup successful! Your data has been downloaded.\n\nCheck the browser console (F12) for verification results.',
      )
      setShowUserMenu(false)
    } catch (error) {
      console.error('Backup failed:', error)
      alert(
        `❌ Backup failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    } finally {
      setIsBackingUp(false)
    }
  }

  const roleIcons = {
    admin: <Crown className="w-3 h-3" />,
    editor: <Pencil className="w-3 h-3" />,
    viewer: <Eye className="w-3 h-3" />,
  }
  const roleColors = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    editor: 'bg-blue-100 text-blue-800 border-blue-200',
    viewer: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  const roleLabels = {
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
  }

  if (!isOnline || !user) return null

  return (
    <>
      <div className="fixed top-2 right-2 z-50">
        <div className="relative">
          <Button
            onClick={() => setShowUserMenu(!showUserMenu)}
            variant="outline"
            size="icon"
            className="bg-white shadow-lg h-8 w-8 rounded-full p-0 flex items-center justify-center"
          >
            <User className="w-4 h-4" />
          </Button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg min-w-[200px]">
              <div className="p-2">
                <div className="px-3 py-2 border-b border-gray-200">
                  <p className="text-xs text-gray-600">Signed in as</p>
                  <p className="text-sm font-semibold truncate">{user.email}</p>
                  {userProfile && (
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium mt-1 ${
                        roleColors[userProfile.role]
                      }`}
                    >
                      {roleIcons[userProfile.role]}
                      {roleLabels[userProfile.role]}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    navigate('/library/plans')
                    setShowUserMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Plan Library
                </button>
                <button
                  onClick={() => {
                    navigate('/library/estimates')
                    setShowUserMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  Estimate Library
                </button>
                <button
                  onClick={() => {
                    navigate('/quickbooks/settings')
                    setShowUserMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  QuickBooks
                </button>
                {userProfile && ['admin', 'editor'].includes(userProfile.role) && (
                  <>
                    <button
                      onClick={() => {
                        navigate('/contacts')
                        setShowUserMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                    >
                      <User className="w-4 h-4" />
                      Contact Directory
                    </button>
                    <button
                      onClick={() => {
                        navigate('/sow')
                        setShowUserMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      SOW Templates
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    navigate('/feedback')
                    setShowUserMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Feedback & Requests
                </button>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-gray-700"
                >
                  <FileText className="w-4 h-4" />
                  Privacy Policy
                </a>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-gray-700"
                >
                  <FileText className="w-4 h-4" />
                  Terms of Use (EULA)
                </a>
                <button
                  onClick={handleBackupData}
                  disabled={isBackingUp}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  {isBackingUp ? 'Backing up...' : 'Backup Data'}
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2 text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={() => {
            setShowFeedbackForm(false)
            if ((window as any).refreshMyFeedback) {
              ;(window as any).refreshMyFeedback()
            }
            alert("✅ Thank you for your feedback! We'll review it soon.")
          }}
        />
      )}
    </>
  )
}
