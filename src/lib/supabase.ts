// ============================================================================
// Supabase Client Configuration
// ============================================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔍 Supabase Config Check:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlValue: supabaseUrl?.substring(0, 30) + '...',
  keyValue: supabaseAnonKey?.substring(0, 20) + '...'
})

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials not found. Running in offline mode with localStorage.')
} else {
  console.log('✅ Supabase credentials loaded. Running in online mode.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// Helper to check if we're in online mode
export const isOnlineMode = () => {
  const isOnline = Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseUrl !== 'your_supabase_project_url_here'
  )
  console.log('🌐 Online Mode Check:', isOnline)
  return isOnline
}

// Export types for database
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          company_name: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          company_name?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          company_name?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          status: string
          address: any
          city: string | null
          state: string | null
          zip_code: string | null
          client: any
          start_date: string | null
          end_date: string | null
          metadata: any
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: string
          status?: string
          address?: any
          city?: string | null
          state?: string | null
          zip_code?: string | null
          client?: any
          start_date?: string | null
          end_date?: string | null
          metadata?: any
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: string
          status?: string
          address?: any
          city?: string | null
          state?: string | null
          zip_code?: string | null
          client?: any
          start_date?: string | null
          end_date?: string | null
          metadata?: any
          created_at?: string
          updated_at?: string
        }
      }
      // Add more table types as needed
    }
  }
}

