// Site contact name with a pick list from the Contact Directory's "Site Contacts". Picking a
// person fills the phone too; typing someone new still works, and the save adds them to the list
// (rememberSiteContact). Without directory access (crew) it is a plain text box.

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatSitePhone, matchSiteContacts } from '@/lib/drywall/siteContacts'
import { fetchSiteContacts } from '@/services/siteContactsService'
import type { Contact } from '@/types'

export function SiteContactField({
  id,
  name,
  client,
  readOnly,
  placeholder,
  onNameChange,
  onPick,
}: {
  id?: string
  name: string
  /** The job's client, so that company's people are listed first. */
  client?: string
  readOnly: boolean
  placeholder?: string
  onNameChange: (name: string) => void
  onPick: (picked: { name: string; phone: string }) => void
}) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (readOnly) return
    let live = true
    fetchSiteContacts()
      .then((list) => live && setContacts(list))
      .catch(() => {}) // no directory access → plain text box
    return () => {
      live = false
    }
  }, [readOnly])

  const matches = useMemo(() => matchSiteContacts(contacts, name, client), [contacts, name, client])
  // Once the box holds exactly a listed person, the list has nothing left to offer.
  const exact = matches.length === 1 && matches[0].name.toLowerCase() === name.trim().toLowerCase()
  const show = open && !readOnly && matches.length > 0 && !exact

  const pick = (c: Contact) => {
    onPick({ name: c.name, phone: formatSitePhone(c.phone) })
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={name}
        disabled={readOnly}
        placeholder={placeholder ?? (contacts.length ? 'Pick or type a name' : undefined)}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onNameChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!show) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(matches[Math.min(active, matches.length - 1)])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list before a click lands.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1.5 text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="truncate">
                {c.name}
                {c.role && <span className="ml-1.5 text-xs text-muted-foreground">{c.role}</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatSitePhone(c.phone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
