const normalizeBaseUrl = (url?: string) => {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '')
}

const envAppUrl = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL)
const envVendorPortalUrl = normalizeBaseUrl(import.meta.env.VITE_VENDOR_PORTAL_URL)

const hasWindow = typeof window !== 'undefined' && Boolean(window.location?.origin)

export const getAppBaseUrl = () => {
  if (envAppUrl) return envAppUrl
  if (hasWindow) {
    return normalizeBaseUrl(window.location.origin)
  }
  return ''
}

export const getVendorPortalBaseUrl = () => {
  if (envVendorPortalUrl) return envVendorPortalUrl
  return getAppBaseUrl()
}

export const buildVendorPortalLink = (token: string) => {
  const baseUrl = getVendorPortalBaseUrl()
  if (!baseUrl) {
    return `/vendor-quote/${token}`
  }
  return `${baseUrl}/vendor-quote/${token}`
}


