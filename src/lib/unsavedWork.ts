// Tracks whether any open form has unsaved changes, so the PWA auto-updater
// (main.tsx onNeedRefresh) doesn't force-reload the page out from under active
// data entry (e.g. mid measure-entry). The new service worker is already
// installed at that point and takes effect on the user's next navigation.

const keys = new Set<string>()

export function setUnsavedWork(key: string, unsaved: boolean): void {
  if (unsaved) keys.add(key)
  else keys.delete(key)
}

export function hasUnsavedWork(): boolean {
  return keys.size > 0
}
