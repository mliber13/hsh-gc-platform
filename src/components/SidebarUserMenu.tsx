// ============================================================================
// SidebarUserMenu — sidebar footer dropdown (avatar + initials)
// ============================================================================
//
// Replaces the legacy floating top-right user menu (in src/routes/AuthedLayout
// before the shell scaffolding). All the same menu items are here:
//   - Profile chip (email + role badge)
//   - Plan Library, Estimate Library, QuickBooks, Contacts, SOW (admin/editor)
//   - Feedback & Requests
//   - Theme toggle
//   - Privacy Policy, Terms of Use links
//   - Backup Data (online only)
//   - Sign Out
//

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import {
  Building2,
  ChevronUp,
  Crown,
  Download,
  Eye,
  FileText,
  Link2,
  LogOut,
  MessageSquare,
  Moon,
  Pencil,
  Sun,
  User as UserIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { backupAllData } from '@/services/backupService'
import { getCurrentUserProfile, UserProfile } from '@/services/userService'
import { cn } from '@/lib/utils'

function getInitials(email: string | undefined | null): string {
  if (!email) return '?'
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return local.slice(0, 2).toUpperCase()
}

export function SidebarUserMenu() {
  const { user, signOut, isOnline } = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)

  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile().then(setUserProfile)
    }
  }, [isOnline, user])

  if (!user) return null

  const handleSignOut = async () => {
    await signOut()
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

  const initials = getInitials(user.email)
  const isAdminOrEditor =
    !!userProfile && ['admin', 'editor'].includes(userProfile.role)

  const roleIcons = {
    admin: <Crown className="size-3" />,
    editor: <Pencil className="size-3" />,
    viewer: <Eye className="size-3" />,
  }
  const roleColors = {
    admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
    editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-200',
  }
  const roleLabels = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {user.email?.split('@')[0] ?? 'Account'}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {user.email}
                </span>
              </div>
              <ChevronUp className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="end"
            className="w-64"
            sideOffset={8}
          >
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Signed in as</span>
              <span className="text-sm font-semibold truncate">{user.email}</span>
              {userProfile && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit',
                    roleColors[userProfile.role],
                  )}
                >
                  {roleIcons[userProfile.role]}
                  {roleLabels[userProfile.role]}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => navigate('/library/plans')}>
              <FileText className="size-4" />
              Plan Library
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/library/estimates')}>
              <Building2 className="size-4" />
              Estimate Library
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/quickbooks/settings')}>
              <Link2 className="size-4" />
              QuickBooks
            </DropdownMenuItem>
            {isAdminOrEditor && (
              <>
                <DropdownMenuItem onClick={() => navigate('/contacts')}>
                  <UserIcon className="size-4" />
                  Contact Directory
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/sow')}>
                  <FileText className="size-4" />
                  SOW Templates
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => navigate('/feedback')}>
              <MessageSquare className="size-4" />
              Feedback & Requests
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="size-4" />
                  Light theme
                </>
              ) : (
                <>
                  <Moon className="size-4" />
                  Dark theme
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                <FileText className="size-4" />
                Privacy Policy
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                <FileText className="size-4" />
                Terms of Use (EULA)
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleBackupData} disabled={isBackingUp}>
              <Download className="size-4" />
              {isBackingUp ? 'Backing up…' : 'Backup Data'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
