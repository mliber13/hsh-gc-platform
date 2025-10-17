// ============================================================================
// QuickBooks Online Service
// ============================================================================
//
// Service for integrating with QuickBooks Online API
// Handles OAuth, Check creation, and vendor management
//

import { supabase } from '@/lib/supabase'

// QuickBooks API Configuration
const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const QB_OAUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'

// Environment variables - Set these in your .env file
const QB_CLIENT_ID = import.meta.env.VITE_QB_CLIENT_ID || ''
const QB_CLIENT_SECRET = import.meta.env.VITE_QB_CLIENT_SECRET || ''
const QB_REDIRECT_URI = import.meta.env.VITE_QB_REDIRECT_URI || `${window.location.origin}/qb-callback`

export interface QBTokens {
  access_token: string
  refresh_token: string
  realm_id: string // QB Company ID
  expires_at: Date
}

export interface QBVendor {
  Id: string
  DisplayName: string
}

export interface QBCheck {
  Id?: string
  DocNumber?: string
  TxnDate: string
  PrivateNote?: string
  Line: Array<{
    Amount: number
    DetailType: 'AccountBasedExpenseLineDetail'
    AccountBasedExpenseLineDetail: {
      AccountRef: {
        value: string
        name?: string
      }
      ClassRef?: {
        value: string
        name?: string
      }
    }
    Description?: string
  }>
  EntityRef: {
    value: string // Vendor ID
    name?: string
  }
  BankAccountRef: {
    value: string // Bank Account ID
    name?: string
  }
}

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Initialize QuickBooks OAuth flow
 */
export function initiateQBOAuth(): void {
  const state = generateRandomState()
  sessionStorage.setItem('qb_oauth_state', state)
  
  const authUrl = `${QB_OAUTH_BASE}` +
    `?client_id=${QB_CLIENT_ID}` +
    `&response_type=code` +
    `&scope=com.intuit.quickbooks.accounting` +
    `&redirect_uri=${encodeURIComponent(QB_REDIRECT_URI)}` +
    `&state=${state}`
  
  window.location.href = authUrl
}

/**
 * Handle OAuth callback and exchange code for tokens
 */
export async function handleQBOAuthCallback(code: string, state: string): Promise<boolean> {
  // Verify state to prevent CSRF
  const savedState = sessionStorage.getItem('qb_oauth_state')
  if (state !== savedState) {
    console.error('OAuth state mismatch')
    return false
  }
  
  try {
    // Call our Supabase Edge Function to exchange code for tokens
    // This keeps the client secret secure on the server
    const { data, error } = await supabase.functions.invoke('qb-exchange-token', {
      body: { code, redirect_uri: QB_REDIRECT_URI }
    })
    
    if (error) {
      console.error('Error exchanging QB token:', error)
      return false
    }
    
    // Store tokens in user profile
    await saveQBTokens(data)
    
    sessionStorage.removeItem('qb_oauth_state')
    return true
  } catch (error) {
    console.error('Error in QB OAuth callback:', error)
    return false
  }
}

/**
 * Save QB tokens to user profile
 */
async function saveQBTokens(tokens: any): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user logged in')
  
  await supabase
    .from('profiles')
    .update({
      qb_access_token: tokens.access_token,
      qb_refresh_token: tokens.refresh_token,
      qb_realm_id: tokens.realmId,
      qb_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq('id', user.id)
}

/**
 * Get QB tokens from user profile
 */
export async function getQBTokens(): Promise<QBTokens | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('qb_access_token, qb_refresh_token, qb_realm_id, qb_token_expires_at')
    .eq('id', user.id)
    .single()
  
  if (error || !profile?.qb_access_token) {
    return null
  }
  
  return {
    access_token: profile.qb_access_token,
    refresh_token: profile.qb_refresh_token,
    realm_id: profile.qb_realm_id,
    expires_at: new Date(profile.qb_token_expires_at),
  }
}

/**
 * Check if user is connected to QuickBooks
 */
export async function isQBConnected(): Promise<boolean> {
  const tokens = await getQBTokens()
  return tokens !== null
}

/**
 * Disconnect from QuickBooks
 */
export async function disconnectQB(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  await supabase
    .from('profiles')
    .update({
      qb_access_token: null,
      qb_refresh_token: null,
      qb_realm_id: null,
      qb_token_expires_at: null,
    })
    .eq('id', user.id)
}

// ============================================================================
// QuickBooks API Calls
// ============================================================================

/**
 * Create a Check in QuickBooks
 */
export async function createQBCheck(checkData: {
  vendorName: string
  amount: number
  description: string
  date: Date
  projectName?: string
  category?: string
}): Promise<{ success: boolean; checkId?: string; error?: string }> {
  try {
    // Call Supabase Edge Function to create check
    // We use an edge function to keep tokens secure and handle token refresh
    const { data, error } = await supabase.functions.invoke('qb-create-check', {
      body: checkData
    })
    
    if (error) {
      console.error('Error creating QB check:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, checkId: data.Check?.Id }
  } catch (error) {
    console.error('Error creating QB check:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Find or create vendor in QuickBooks
 */
export async function findOrCreateQBVendor(vendorName: string): Promise<QBVendor | null> {
  try {
    const { data, error } = await supabase.functions.invoke('qb-find-vendor', {
      body: { vendorName }
    })
    
    if (error) {
      console.error('Error finding/creating QB vendor:', error)
      return null
    }
    
    return data.vendor
  } catch (error) {
    console.error('Error finding/creating QB vendor:', error)
    return null
  }
}

/**
 * Test QuickBooks connection
 */
export async function testQBConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('qb-test-connection')
    
    if (error) {
      console.error('QB connection test failed:', error)
      return false
    }
    
    return data.connected === true
  } catch (error) {
    console.error('QB connection test failed:', error)
    return false
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

