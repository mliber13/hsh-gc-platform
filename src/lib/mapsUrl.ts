// Shared maps-link helper — Apple Maps on Apple devices, Google Maps elsewhere.
// Used by the crew job detail and the drywall schedule item dialog so the two
// stay consistent for a field tech on an iPhone.

/** True on Apple platforms, where maps.apple.com opens the native Maps app. */
export function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports as "Macintosh"; Macs have the Maps app too, so include both.
  return /iPad|iPhone|iPod|Macintosh|Mac OS X/.test(ua)
}

/** Maps link for an address — Apple Maps on Apple devices, Google Maps elsewhere. */
export function mapsUrl(address: string): string {
  const q = encodeURIComponent(address)
  return isAppleDevice()
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`
}
