// ============================================================================
// Contact Directory - People & Partners with labels
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Edit, Trash2, RefreshCw, Archive, ArchiveRestore } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Contact, ContactInput, Subcontractor, Supplier, Developer, Municipality, Lender } from '@/types'
import { STANDALONE_CONTACT_LABELS, MUNICIPALITY_CONTACT_ROLES } from '@/types'
import {
  fetchSubcontractors,
  fetchSuppliers,
  fetchDevelopers,
  fetchMunicipalities,
  fetchLenders,
  createSubcontractor,
  updateSubcontractor,
  setSubcontractorActive,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  createDeveloper,
  updateDeveloper,
  setDeveloperActive,
  deleteDeveloper,
  createMunicipality,
  updateMunicipality,
  setMunicipalityActive,
  createLender,
  updateLender,
  setLenderActive,
} from '@/services/partnerDirectoryService'
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
} from '@/services/contactDirectoryService'
import {
  getOrganizationUsers,
  getOrganizationUsersByEmail,
  updateUserRole,
  setUserActive,
  type UserProfile,
  type UserRole,
} from '@/services/userService'
import type { DeveloperInput, SubcontractorInput, SupplierInput, MunicipalityInput, LenderInput } from '@/types'
import type { StandaloneContactLabel, ContactLabel } from '@/types'
import { Shield, ShieldOff, UserPlus } from 'lucide-react'

interface ContactDirectoryProps {
  onBack: () => void
  userProfile?: UserProfile | null
}

type PartnerTab = 'subcontractors' | 'suppliers' | 'developers' | 'municipalities' | 'lenders'

export function ContactDirectory({ onBack, userProfile }: ContactDirectoryProps) {
  const isAdmin = userProfile?.role === 'admin'
  const [mainTab, setMainTab] = useState<'people' | 'partners'>('people')
  const [peopleLabel, setPeopleLabel] = useState<StandaloneContactLabel>('EMPLOYEE')
  const [partnerTab, setPartnerTab] = useState<PartnerTab>('subcontractors')
  const [showInactive, setShowInactive] = useState(false)

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [lenders, setLenders] = useState<Lender[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [entityContacts, setEntityContacts] = useState<Record<string, Contact[]>>({})
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null)

  const [loadingSubs, setLoadingSubs] = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [loadingDevs, setLoadingDevs] = useState(false)
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false)
  const [loadingLenders, setLoadingLenders] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)

  const [contactFormOpen, setContactFormOpen] = useState(false)
  const [contactFormLabel, setContactFormLabel] = useState<ContactLabel>('EMPLOYEE')
  const [contactFormEntity, setContactFormEntity] = useState<{
    type: 'subcontractor' | 'supplier' | 'developer' | 'municipality' | 'lender'
    id: string
    name: string
  } | null>(null)
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', role: '', notes: '' })
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [savingContact, setSavingContact] = useState(false)

  const [developerFormOpen, setDeveloperFormOpen] = useState(false)
  const [developerForm, setDeveloperForm] = useState({
    name: '',
    type: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    isActive: true,
  })
  const [editingDeveloperId, setEditingDeveloperId] = useState<string | null>(null)
  const [savingDeveloper, setSavingDeveloper] = useState(false)

  const [partnerFormOpen, setPartnerFormOpen] = useState(false)
  const [partnerFormMode, setPartnerFormMode] = useState<PartnerTab>('subcontractors')
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    tradeOrCategory: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    isActive: true,
  })
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null)
  const [savingPartner, setSavingPartner] = useState(false)

  const [orgUsersByEmail, setOrgUsersByEmail] = useState<Map<string, UserProfile>>(new Map())
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [accessDialogContact, setAccessDialogContact] = useState<Contact | null>(null)
  const [accessDialogProfile, setAccessDialogProfile] = useState<UserProfile | null>(null)
  const [accessDialogRole, setAccessDialogRole] = useState<UserRole>('viewer')
  const [savingAccess, setSavingAccess] = useState(false)
  const [inviteInfoContact, setInviteInfoContact] = useState<Contact | null>(null)

  const [allContactsForOrg, setAllContactsForOrg] = useState<Contact[]>([])
  const [orgUsersList, setOrgUsersList] = useState<UserProfile[]>([])
  const [addUserAsContactProfile, setAddUserAsContactProfile] = useState<UserProfile | null>(null)
  const [addUserAsContactMode, setAddUserAsContactMode] = useState<'standalone' | 'under_entity'>('standalone')
  const [addUserAsContactLabel, setAddUserAsContactLabel] = useState<StandaloneContactLabel>('USER')
  const [addUserAsContactEntityType, setAddUserAsContactEntityType] = useState<PartnerTab | null>(null)
  const [addUserAsContactEntityId, setAddUserAsContactEntityId] = useState<string | null>(null)
  const [savingAddUserAsContact, setSavingAddUserAsContact] = useState(false)

  const loadSubcontractors = useCallback(async () => {
    setLoadingSubs(true)
    try {
      const data = await fetchSubcontractors({ includeInactive: showInactive })
      setSubcontractors(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load subcontractors')
    } finally {
      setLoadingSubs(false)
    }
  }, [showInactive])

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true)
    try {
      const data = await fetchSuppliers({ includeInactive: showInactive })
      setSuppliers(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load suppliers')
    } finally {
      setLoadingSuppliers(false)
    }
  }, [showInactive])

  const loadDevelopers = useCallback(async () => {
    setLoadingDevs(true)
    try {
      const data = await fetchDevelopers({ includeInactive: showInactive })
      setDevelopers(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load developers')
    } finally {
      setLoadingDevs(false)
    }
  }, [showInactive])

  const loadMunicipalities = useCallback(async () => {
    setLoadingMunicipalities(true)
    try {
      const data = await fetchMunicipalities({ includeInactive: showInactive })
      setMunicipalities(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load municipalities')
    } finally {
      setLoadingMunicipalities(false)
    }
  }, [showInactive])

  const loadLenders = useCallback(async () => {
    setLoadingLenders(true)
    try {
      const data = await fetchLenders({ includeInactive: showInactive })
      setLenders(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load lenders')
    } finally {
      setLoadingLenders(false)
    }
  }, [showInactive])

  const loadContacts = useCallback(async (label?: string) => {
    setLoadingContacts(true)
    try {
      const data = await fetchContacts(label ? { label } : {})
      setContacts(data)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to load contacts')
    } finally {
      setLoadingContacts(false)
    }
  }, [])

  const loadEntityContacts = useCallback(async (entityId: string, key: 'subcontractorId' | 'supplierId' | 'developerId' | 'municipalityId' | 'lenderId') => {
    try {
      const data = await fetchContacts({ [key]: entityId })
      setEntityContacts((prev) => ({ ...prev, [entityId]: data }))
    } catch (e: any) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (mainTab === 'people') {
      loadContacts(peopleLabel)
    }
  }, [mainTab, peopleLabel, loadContacts])

  useEffect(() => {
    if (mainTab !== 'partners') return
    if (partnerTab === 'subcontractors') loadSubcontractors()
    else if (partnerTab === 'suppliers') loadSuppliers()
    else if (partnerTab === 'developers') loadDevelopers()
    else if (partnerTab === 'municipalities') loadMunicipalities()
    else if (partnerTab === 'lenders') loadLenders()
  }, [mainTab, partnerTab, showInactive, loadSubcontractors, loadSuppliers, loadDevelopers, loadMunicipalities, loadLenders])

  useEffect(() => {
    if (!expandedEntityId) return
    if (partnerTab === 'subcontractors') loadEntityContacts(expandedEntityId, 'subcontractorId')
    else if (partnerTab === 'suppliers') loadEntityContacts(expandedEntityId, 'supplierId')
    else if (partnerTab === 'developers') loadEntityContacts(expandedEntityId, 'developerId')
    else if (partnerTab === 'municipalities') loadEntityContacts(expandedEntityId, 'municipalityId')
    else if (partnerTab === 'lenders') loadEntityContacts(expandedEntityId, 'lenderId')
  }, [expandedEntityId, partnerTab, loadEntityContacts])

  useEffect(() => {
    if (isAdmin) {
      getOrganizationUsersByEmail().then(setOrgUsersByEmail).catch(() => setOrgUsersByEmail(new Map()))
      getOrganizationUsers().then(setOrgUsersList).catch(() => setOrgUsersList([]))
      fetchContacts().then(setAllContactsForOrg).catch(() => setAllContactsForOrg([]))
    }
  }, [isAdmin])

  const usersWithoutContact = React.useMemo(() => {
    if (!isAdmin) return []
    const emailSet = new Set(
      allContactsForOrg
        .map((c) => c.email?.toLowerCase().trim())
        .filter(Boolean) as string[]
    )
    return orgUsersList.filter((u) => u.email && !emailSet.has(u.email.toLowerCase().trim()))
  }, [isAdmin, orgUsersList, allContactsForOrg])

  useEffect(() => {
    if (!addUserAsContactProfile || addUserAsContactMode !== 'under_entity' || !addUserAsContactEntityType) return
    if (addUserAsContactEntityType === 'subcontractors' && subcontractors.length === 0) loadSubcontractors()
    else if (addUserAsContactEntityType === 'suppliers' && suppliers.length === 0) loadSuppliers()
    else if (addUserAsContactEntityType === 'developers' && developers.length === 0) loadDevelopers()
    else if (addUserAsContactEntityType === 'municipalities' && municipalities.length === 0) loadMunicipalities()
    else if (addUserAsContactEntityType === 'lenders' && lenders.length === 0) loadLenders()
  }, [addUserAsContactProfile, addUserAsContactMode, addUserAsContactEntityType])

  const getAppUserForContact = (c: Contact): UserProfile | null => {
    const email = c.email?.toLowerCase().trim()
    return email ? (orgUsersByEmail.get(email) ?? null) : null
  }

  const openAccessDialog = (contact: Contact) => {
    const profile = getAppUserForContact(contact)
    setAccessDialogContact(contact)
    setAccessDialogProfile(profile)
    setAccessDialogRole((profile?.role as UserRole) ?? 'viewer')
    setAccessDialogOpen(true)
  }

  const openInviteInfo = (contact: Contact) => {
    setInviteInfoContact(contact)
  }

  const handleSaveAccess = async () => {
    if (!accessDialogProfile) return
    setSavingAccess(true)
    try {
      await updateUserRole(accessDialogProfile.id, accessDialogRole)
      const next = await getOrganizationUsersByEmail()
      setOrgUsersByEmail(next)
      setAccessDialogOpen(false)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update role')
    } finally {
      setSavingAccess(false)
    }
  }

  const handleRevokeOrReactivate = async () => {
    if (!accessDialogProfile) return
    const nextActive = accessDialogProfile.is_active === false
    setSavingAccess(true)
    try {
      await setUserActive(accessDialogProfile.id, nextActive)
      const next = await getOrganizationUsersByEmail()
      setOrgUsersByEmail(next)
      setAccessDialogOpen(false)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update access')
    } finally {
      setSavingAccess(false)
    }
  }

  const openAddUserAsContact = (profile: UserProfile) => {
    setAddUserAsContactProfile(profile)
    setAddUserAsContactMode('standalone')
    setAddUserAsContactLabel('USER')
    setAddUserAsContactEntityType(null)
    setAddUserAsContactEntityId(null)
  }

  const handleAddUserAsContact = async () => {
    if (!addUserAsContactProfile?.email) return
    const name = (addUserAsContactProfile.full_name?.trim() || addUserAsContactProfile.email.split('@')[0] || addUserAsContactProfile.email).trim()
    if (!name) return
    setSavingAddUserAsContact(true)
    try {
      if (addUserAsContactMode === 'standalone') {
        await createContact({
          label: addUserAsContactLabel,
          name,
          email: addUserAsContactProfile.email.trim(),
          phone: null,
          role: null,
          notes: null,
        })
      } else {
        if (!addUserAsContactEntityType || !addUserAsContactEntityId) {
          alert('Please select a partner and company.')
          return
        }
        const entityLabel = addUserAsContactEntityType === 'subcontractors' ? 'SUBCONTRACTOR' : addUserAsContactEntityType === 'suppliers' ? 'SUPPLIER' : addUserAsContactEntityType === 'developers' ? 'DEVELOPER' : addUserAsContactEntityType === 'municipalities' ? 'MUNICIPALITY' : 'LENDER'
        const input: ContactInput = {
          label: entityLabel,
          name,
          email: addUserAsContactProfile.email.trim(),
          phone: null,
          role: null,
          notes: null,
        }
        if (addUserAsContactEntityType === 'subcontractors') input.subcontractorId = addUserAsContactEntityId
        else if (addUserAsContactEntityType === 'suppliers') input.supplierId = addUserAsContactEntityId
        else if (addUserAsContactEntityType === 'developers') input.developerId = addUserAsContactEntityId
        else if (addUserAsContactEntityType === 'municipalities') input.municipalityId = addUserAsContactEntityId
        else input.lenderId = addUserAsContactEntityId
        await createContact(input)
      }
      setAddUserAsContactProfile(null)
      const [nextContacts, nextMap] = await Promise.all([fetchContacts(), getOrganizationUsersByEmail()])
      setAllContactsForOrg(nextContacts)
      setOrgUsersByEmail(nextMap)
      if (mainTab === 'people') loadContacts(peopleLabel)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to add contact')
    } finally {
      setSavingAddUserAsContact(false)
    }
  }

  const entityListForAddUser = (): { id: string; name: string }[] => {
    if (!addUserAsContactEntityType) return []
    if (addUserAsContactEntityType === 'subcontractors') return subcontractors.map((s) => ({ id: s.id, name: s.name }))
    if (addUserAsContactEntityType === 'suppliers') return suppliers.map((s) => ({ id: s.id, name: s.name }))
    if (addUserAsContactEntityType === 'developers') return developers.map((d) => ({ id: d.id, name: d.name }))
    if (addUserAsContactEntityType === 'municipalities') return municipalities.map((m) => ({ id: m.id, name: m.name }))
    if (addUserAsContactEntityType === 'lenders') return lenders.map((l) => ({ id: l.id, name: l.name }))
    return []
  }

  const peopleContacts = mainTab === 'people' ? contacts : []
  const currentPartnerList =
    partnerTab === 'subcontractors' ? subcontractors
    : partnerTab === 'suppliers' ? suppliers
    : partnerTab === 'developers' ? developers
    : partnerTab === 'municipalities' ? municipalities
    : lenders
  const isLoadingPartners =
    partnerTab === 'subcontractors' ? loadingSubs
    : partnerTab === 'suppliers' ? loadingSuppliers
    : partnerTab === 'developers' ? loadingDevs
    : partnerTab === 'municipalities' ? loadingMunicipalities
    : loadingLenders

  const openAddContact = (entity?: { type: 'subcontractor' | 'supplier' | 'developer' | 'municipality' | 'lender'; id: string; name: string }) => {
    setContactFormEntity(entity ?? null)
    const entityLabel: ContactLabel = entity
      ? (entity.type === 'subcontractor' ? 'SUBCONTRACTOR' : entity.type === 'supplier' ? 'SUPPLIER' : entity.type === 'developer' ? 'DEVELOPER' : entity.type === 'municipality' ? 'MUNICIPALITY' : 'LENDER')
      : peopleLabel
    setContactFormLabel(entityLabel)
    setContactForm({ name: '', email: '', phone: '', role: '', notes: '' })
    setEditingContactId(null)
    setContactFormOpen(true)
  }

  const openEditContact = (c: Contact) => {
    setContactFormEntity(
      c.subcontractorId ? { type: 'subcontractor', id: c.subcontractorId, name: '' } :
      c.supplierId ? { type: 'supplier', id: c.supplierId, name: '' } :
      c.developerId ? { type: 'developer', id: c.developerId, name: '' } :
      c.municipalityId ? { type: 'municipality', id: c.municipalityId, name: '' } :
      c.lenderId ? { type: 'lender', id: c.lenderId, name: '' } : null
    )
    setContactFormLabel(c.label as ContactLabel)
    setContactForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      role: c.role ?? '',
      notes: c.notes ?? '',
    })
    setEditingContactId(c.id)
    setContactFormOpen(true)
  }

  const handleSaveContact = async () => {
    if (!contactForm.name.trim()) {
      alert('Name is required.')
      return
    }
    setSavingContact(true)
    try {
      if (editingContactId) {
        await updateContact(editingContactId, {
          label: contactFormLabel,
          name: contactForm.name.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          role: contactForm.role.trim() || null,
          notes: contactForm.notes.trim() || null,
        })
      } else {
        const input: ContactInput = {
          label: contactFormLabel,
          name: contactForm.name.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          role: contactForm.role.trim() || null,
          notes: contactForm.notes.trim() || null,
        }
        if (contactFormEntity) {
          if (contactFormEntity.type === 'subcontractor') input.subcontractorId = contactFormEntity.id
          else if (contactFormEntity.type === 'supplier') input.supplierId = contactFormEntity.id
          else if (contactFormEntity.type === 'developer') input.developerId = contactFormEntity.id
          else if (contactFormEntity.type === 'municipality') input.municipalityId = contactFormEntity.id
          else input.lenderId = contactFormEntity.id
        }
        await createContact(input)
      }
      setContactFormOpen(false)
      if (mainTab === 'people') loadContacts(peopleLabel)
      if (expandedEntityId) {
        const key = partnerTab === 'subcontractors' ? 'subcontractorId' : partnerTab === 'suppliers' ? 'supplierId' : partnerTab === 'developers' ? 'developerId' : partnerTab === 'municipalities' ? 'municipalityId' : 'lenderId'
        loadEntityContacts(expandedEntityId, key)
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to save contact')
    } finally {
      setSavingContact(false)
    }
  }

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Delete this contact?')) return
    try {
      await deleteContact(id)
      if (mainTab === 'people') loadContacts(peopleLabel)
      if (expandedEntityId) {
        const key = partnerTab === 'subcontractors' ? 'subcontractorId' : partnerTab === 'suppliers' ? 'supplierId' : partnerTab === 'developers' ? 'developerId' : partnerTab === 'municipalities' ? 'municipalityId' : 'lenderId'
        loadEntityContacts(expandedEntityId, key)
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to delete contact')
    }
  }

  const openAddDeveloper = () => {
    setDeveloperForm({
      name: '',
      type: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      notes: '',
      isActive: true,
    })
    setEditingDeveloperId(null)
    setDeveloperFormOpen(true)
  }

  const openEditDeveloper = (d: Developer) => {
    setDeveloperForm({
      name: d.name,
      type: d.type ?? '',
      contactName: d.contactName ?? '',
      email: d.email ?? '',
      phone: d.phone ?? '',
      website: d.website ?? '',
      notes: d.notes ?? '',
      isActive: d.isActive,
    })
    setEditingDeveloperId(d.id)
    setDeveloperFormOpen(true)
  }

  const handleSaveDeveloper = async () => {
    if (!developerForm.name.trim()) {
      alert('Name is required.')
      return
    }
    setSavingDeveloper(true)
    try {
      const payload: DeveloperInput = {
        name: developerForm.name.trim(),
        type: developerForm.type.trim() || null,
        contactName: developerForm.contactName.trim() || null,
        email: developerForm.email.trim() || null,
        phone: developerForm.phone.trim() || null,
        website: developerForm.website.trim() || null,
        notes: developerForm.notes.trim() || null,
        isActive: developerForm.isActive,
      }
      if (editingDeveloperId) {
        await updateDeveloper(editingDeveloperId, payload)
      } else {
        await createDeveloper(payload)
      }
      setDeveloperFormOpen(false)
      loadDevelopers()
    } catch (e: any) {
      alert(e?.message || 'Failed to save developer')
    } finally {
      setSavingDeveloper(false)
    }
  }

  const openAddPartner = (mode: PartnerTab) => {
    setPartnerFormMode(mode)
    setPartnerForm({
      name: '',
      tradeOrCategory: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      notes: '',
      isActive: true,
    })
    setEditingPartnerId(null)
    setPartnerFormOpen(true)
  }

  const openEditMunicipality = (m: Municipality) => {
    setPartnerFormMode('municipalities')
    setPartnerForm({
      name: m.name,
      tradeOrCategory: '',
      contactName: m.contactName ?? '',
      email: m.email ?? '',
      phone: m.phone ?? '',
      website: m.website ?? '',
      notes: m.notes ?? '',
      isActive: m.isActive,
    })
    setEditingPartnerId(m.id)
    setPartnerFormOpen(true)
  }

  const openEditLender = (l: Lender) => {
    setPartnerFormMode('lenders')
    setPartnerForm({
      name: l.name,
      tradeOrCategory: l.type ?? '',
      contactName: l.contactName ?? '',
      email: l.email ?? '',
      phone: l.phone ?? '',
      website: l.website ?? '',
      notes: l.notes ?? '',
      isActive: l.isActive,
    })
    setEditingPartnerId(l.id)
    setPartnerFormOpen(true)
  }

  const openEditSubcontractor = (s: Subcontractor) => {
    setPartnerFormMode('subcontractors')
    setPartnerForm({
      name: s.name,
      tradeOrCategory: s.trade ?? '',
      contactName: s.contactName ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      website: s.website ?? '',
      notes: s.notes ?? '',
      isActive: s.isActive,
    })
    setEditingPartnerId(s.id)
    setPartnerFormOpen(true)
  }

  const openEditSupplier = (s: Supplier) => {
    setPartnerFormMode('suppliers')
    setPartnerForm({
      name: s.name,
      tradeOrCategory: s.category ?? '',
      contactName: s.contactName ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      website: s.website ?? '',
      notes: s.notes ?? '',
      isActive: s.isActive,
    })
    setEditingPartnerId(s.id)
    setPartnerFormOpen(true)
  }

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim()) {
      alert('Name is required.')
      return
    }
    setSavingPartner(true)
    try {
      if (partnerFormMode === 'subcontractors') {
        const payload: SubcontractorInput = {
          name: partnerForm.name.trim(),
          trade: partnerForm.tradeOrCategory.trim() || null,
          contactName: partnerForm.contactName.trim() || null,
          email: partnerForm.email.trim() || null,
          phone: partnerForm.phone.trim() || null,
          website: partnerForm.website.trim() || null,
          notes: partnerForm.notes.trim() || null,
          isActive: partnerForm.isActive,
        }
        if (editingPartnerId) {
          await updateSubcontractor(editingPartnerId, payload)
          await loadSubcontractors()
        } else {
          await createSubcontractor(payload)
          await loadSubcontractors()
        }
      } else if (partnerFormMode === 'suppliers') {
        const payload: SupplierInput = {
          name: partnerForm.name.trim(),
          category: partnerForm.tradeOrCategory.trim() || null,
          contactName: partnerForm.contactName.trim() || null,
          email: partnerForm.email.trim() || null,
          phone: partnerForm.phone.trim() || null,
          website: partnerForm.website.trim() || null,
          notes: partnerForm.notes.trim() || null,
          isActive: partnerForm.isActive,
        }
        if (editingPartnerId) {
          await updateSupplier(editingPartnerId, payload)
          await loadSuppliers()
        } else {
          await createSupplier(payload)
          await loadSuppliers()
        }
      } else if (partnerFormMode === 'municipalities') {
        const payload: MunicipalityInput = {
          name: partnerForm.name.trim(),
          contactName: partnerForm.contactName.trim() || null,
          email: partnerForm.email.trim() || null,
          phone: partnerForm.phone.trim() || null,
          website: partnerForm.website.trim() || null,
          notes: partnerForm.notes.trim() || null,
          isActive: partnerForm.isActive,
        }
        if (editingPartnerId) {
          await updateMunicipality(editingPartnerId, payload)
          await loadMunicipalities()
        } else {
          await createMunicipality(payload)
          await loadMunicipalities()
        }
      } else if (partnerFormMode === 'lenders') {
        const payload: LenderInput = {
          name: partnerForm.name.trim(),
          type: partnerForm.tradeOrCategory.trim() || null,
          contactName: partnerForm.contactName.trim() || null,
          email: partnerForm.email.trim() || null,
          phone: partnerForm.phone.trim() || null,
          website: partnerForm.website.trim() || null,
          notes: partnerForm.notes.trim() || null,
          isActive: partnerForm.isActive,
        }
        if (editingPartnerId) {
          await updateLender(editingPartnerId, payload)
          await loadLenders()
        } else {
          await createLender(payload)
          await loadLenders()
        }
      }
      setPartnerFormOpen(false)
      setEditingPartnerId(null)
    } catch (e: any) {
      alert(e?.message || 'Failed to save')
    } finally {
      setSavingPartner(false)
    }
  }

  const handleTogglePartnerActive = async (entity: Subcontractor | Supplier | Municipality | Lender) => {
    try {
      const next = !entity.isActive
      if (partnerTab === 'subcontractors') {
        await setSubcontractorActive(entity.id, next)
        await loadSubcontractors()
      } else if (partnerTab === 'suppliers') {
        await setSupplierActive(entity.id, next)
        await loadSuppliers()
      } else if (partnerTab === 'municipalities') {
        await setMunicipalityActive(entity.id, next)
        await loadMunicipalities()
      } else if (partnerTab === 'lenders') {
        await setLenderActive(entity.id, next)
        await loadLenders()
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to update')
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedEntityId((prev) => (prev === id ? null : id))
  }

  const labelDisplay = STANDALONE_CONTACT_LABELS.find((l) => l.value === peopleLabel)?.label ?? peopleLabel

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" className="mb-3 px-0" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-slate-900">Contact Directory</h1>
            <p className="text-sm text-slate-600 mt-1">
              People & partners by label. Add standalone contacts or additional contacts under subcontractors, suppliers, and developers.
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            if (mainTab === 'people') loadContacts(peopleLabel)
            else if (partnerTab === 'subcontractors') loadSubcontractors()
            else if (partnerTab === 'suppliers') loadSuppliers()
            else if (partnerTab === 'developers') loadDevelopers()
            else if (partnerTab === 'municipalities') loadMunicipalities()
            else loadLenders()
          }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex rounded-lg border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setMainTab('people')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                mainTab === 'people' ? 'bg-[#0E79C9] text-white shadow' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              People
            </button>
            <button
              type="button"
              onClick={() => setMainTab('partners')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                mainTab === 'partners' ? 'bg-[#0E79C9] text-white shadow' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Partners
            </button>
          </div>

          {mainTab === 'people' && (
            <Select value={peopleLabel} onValueChange={(v) => setPeopleLabel(v as StandaloneContactLabel)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STANDALONE_CONTACT_LABELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {mainTab === 'partners' && (
            <>
              <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setPartnerTab('subcontractors')}
                  className={`px-3 py-1.5 text-sm rounded ${partnerTab === 'subcontractors' ? 'bg-slate-200 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Subcontractors
                </button>
                <button
                  type="button"
                  onClick={() => setPartnerTab('suppliers')}
                  className={`px-3 py-1.5 text-sm rounded ${partnerTab === 'suppliers' ? 'bg-slate-200 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Suppliers
                </button>
                <button
                  type="button"
                  onClick={() => setPartnerTab('developers')}
                  className={`px-3 py-1.5 text-sm rounded ${partnerTab === 'developers' ? 'bg-slate-200 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Developers
                </button>
                <button
                  type="button"
                  onClick={() => setPartnerTab('municipalities')}
                  className={`px-3 py-1.5 text-sm rounded ${partnerTab === 'municipalities' ? 'bg-slate-200 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Municipalities
                </button>
                <button
                  type="button"
                  onClick={() => setPartnerTab('lenders')}
                  className={`px-3 py-1.5 text-sm rounded ${partnerTab === 'lenders' ? 'bg-slate-200 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Lenders
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Show inactive
              </label>
              {partnerTab === 'subcontractors' && (
                <Button size="sm" onClick={() => openAddPartner('subcontractors')}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Subcontractor
                </Button>
              )}
              {partnerTab === 'suppliers' && (
                <Button size="sm" onClick={() => openAddPartner('suppliers')}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Supplier
                </Button>
              )}
              {partnerTab === 'municipalities' && (
                <Button size="sm" onClick={() => openAddPartner('municipalities')}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Municipality
                </Button>
              )}
              {partnerTab === 'lenders' && (
                <Button size="sm" onClick={() => openAddPartner('lenders')}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Lender
                </Button>
              )}
              {partnerTab === 'developers' && (
                <Button size="sm" onClick={openAddDeveloper}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Developer
                </Button>
              )}
            </>
          )}
        </div>

        {isAdmin && usersWithoutContact.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="text-base">Users without a contact</CardTitle>
              <CardDescription>
                These app users don&apos;t have a directory contact yet. Add them as a standalone contact or under a partner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {usersWithoutContact.map((u) => (
                  <div key={u.id} className="flex items-center justify-between border border-amber-200 rounded-lg p-3 text-sm bg-white">
                    <div>
                      <span className="font-medium">{u.full_name?.trim() || u.email}</span>
                      <div className="text-slate-600 text-xs mt-0.5">{u.email}</div>
                      {u.is_active === false && (
                        <span className="text-xs text-amber-700">Inactive</span>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openAddUserAsContact(u)}>
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add as contact
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {mainTab === 'people' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{labelDisplay}</CardTitle>
              <Button size="sm" onClick={() => openAddContact()}>
                <Plus className="w-4 h-4 mr-1" />
                Add Contact
              </Button>
            </CardHeader>
            <CardContent>
              {loadingContacts ? (
                <p className="text-sm text-slate-500 py-8">Loading...</p>
              ) : peopleContacts.length === 0 ? (
                <p className="text-sm text-slate-500 py-8">No contacts in this category. Add one above.</p>
              ) : (
                <div className="space-y-2">
                  {peopleContacts.map((c) => {
                    const appUser = isAdmin && c.email ? getAppUserForContact(c) : null
                    return (
                      <div key={c.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                        <div>
                          <span className="font-medium">{c.name}</span>
                          {c.role && <span className="text-slate-500 ml-2">({c.role})</span>}
                          <div className="text-slate-600 text-xs mt-1">
                            {c.email && <span>{c.email}</span>}
                            {c.phone && <span className="ml-2">{c.phone}</span>}
                          </div>
                          {isAdmin && c.email && (
                            <div className="mt-1 flex items-center gap-2">
                              {appUser ? (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${appUser.is_active === false ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                  {appUser.is_active === false ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                                  App: {appUser.is_active === false ? 'Inactive' : appUser.role}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">No app access</span>
                              )}
                            </div>
                          )}
                          {c.notes && <p className="text-slate-500 text-xs mt-1">{c.notes}</p>}
                        </div>
                        <div className="flex gap-1 items-center">
                          {isAdmin && c.email && (
                            appUser
                              ? <Button variant="outline" size="sm" onClick={() => openAccessDialog(c)}>Edit access</Button>
                              : <Button variant="outline" size="sm" onClick={() => openInviteInfo(c)}><UserPlus className="w-4 h-4 mr-1" />Invite to app</Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEditContact(c)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteContact(c.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {mainTab === 'partners' && (
          <Card>
            <CardHeader>
              <CardTitle>
                {partnerTab === 'subcontractors' && 'Subcontractors'}
                {partnerTab === 'suppliers' && 'Suppliers'}
                {partnerTab === 'developers' && 'Developers'}
                {partnerTab === 'municipalities' && 'Municipalities'}
                {partnerTab === 'lenders' && 'Lenders'}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Primary contact is on the company row. Expand a row to see and add additional contacts.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingPartners ? (
                <p className="text-sm text-slate-500 py-8">Loading...</p>
              ) : currentPartnerList.length === 0 ? (
                <p className="text-sm text-slate-500 py-8">
                  No {partnerTab === 'subcontractors' ? 'subcontractors' : partnerTab === 'suppliers' ? 'suppliers' : partnerTab === 'developers' ? 'developers' : partnerTab === 'municipalities' ? 'municipalities' : 'lenders'} yet. Add one to get started.
                </p>
              ) : (
                <div className="space-y-1">
                  {currentPartnerList.map((entity) => {
                    const isSub = partnerTab === 'subcontractors'
                    const isSupplier = partnerTab === 'suppliers'
                    const isMunicipality = partnerTab === 'municipalities'
                    const isLender = partnerTab === 'lenders'
                    const name = entity.name
                    const primaryContact = (entity as Subcontractor & Supplier & Developer & Municipality & Lender).contactName || '—'
                    const email = (entity as Subcontractor & Supplier & Developer & Municipality & Lender).email || '—'
                    const phone = (entity as Subcontractor & Supplier & Developer & Municipality & Lender).phone || '—'
                    const expanded = expandedEntityId === entity.id
                    const extraContacts = entityContacts[entity.id] ?? []

                    return (
                      <div key={entity.id} className="border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-2 p-3 bg-white hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleExpand(entity.id)}
                        >
                          {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{name}</span>
                            <span className="text-slate-500 text-sm ml-2">
                              {isSub && (entity as Subcontractor).trade}
                              {isSupplier && (entity as Supplier).category}
                              {partnerTab === 'developers' && (entity as Developer).type}
                              {isLender && (entity as Lender).type}
                            </span>
                            <div className="text-slate-600 text-xs mt-1">
                              Primary: {primaryContact} · {email} · {phone}
                            </div>
                          </div>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {partnerTab === 'subcontractors' && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEditSubcontractor(entity as Subcontractor)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePartnerActive(entity as Subcontractor)}
                                  title={entity.isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {entity.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                                </Button>
                              </>
                            )}
                            {partnerTab === 'suppliers' && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEditSupplier(entity as Supplier)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePartnerActive(entity as Supplier)}
                                  title={entity.isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {entity.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                                </Button>
                              </>
                            )}
                            {partnerTab === 'municipalities' && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEditMunicipality(entity as Municipality)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePartnerActive(entity as Municipality)}
                                  title={entity.isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {entity.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                                </Button>
                              </>
                            )}
                            {partnerTab === 'lenders' && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEditLender(entity as Lender)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePartnerActive(entity as Lender)}
                                  title={entity.isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {entity.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                                </Button>
                              </>
                            )}
                            {partnerTab === 'developers' && (
                              <Button variant="ghost" size="sm" onClick={() => openEditDeveloper(entity as Developer)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div className="border-t bg-slate-50 p-3 text-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-slate-700">Additional contacts</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openAddContact({
                                    type: partnerTab as 'subcontractor' | 'supplier' | 'developer',
                                    id: entity.id,
                                    name,
                                  })
                                }
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add contact
                              </Button>
                            </div>
                            {extraContacts.length === 0 ? (
                              <p className="text-slate-500 text-xs">No additional contacts. Add one above.</p>
                            ) : (
                              <ul className="space-y-2">
                                {extraContacts.map((c) => {
                                  const appUser = isAdmin && c.email ? getAppUserForContact(c) : null
                                  return (
                                    <li key={c.id} className="flex justify-between items-start border-b border-slate-100 pb-2">
                                      <div>
                                        <span className="font-medium">{c.name}</span>
                                        {c.role && <span className="text-slate-500 ml-1">({c.role})</span>}
                                        <div className="text-slate-600 text-xs">
                                          {c.email && <span>{c.email}</span>}
                                          {c.phone && <span className="ml-2">{c.phone}</span>}
                                        </div>
                                        {isAdmin && c.email && (
                                          <div className="mt-1">
                                            {appUser ? (
                                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${appUser.is_active === false ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                                {appUser.is_active === false ? 'Inactive' : appUser.role}
                                              </span>
                                            ) : (
                                              <span className="text-xs text-slate-500">No app access</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        {isAdmin && c.email && (
                                          appUser
                                            ? <Button variant="outline" size="sm" onClick={() => openAccessDialog(c)}>Edit access</Button>
                                            : <Button variant="outline" size="sm" onClick={() => openInviteInfo(c)}><UserPlus className="w-4 h-4 mr-1" />Invite</Button>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => openEditContact(c)}>
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteContact(c.id)}>
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={contactFormOpen} onOpenChange={setContactFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContactId ? 'Edit Contact' : contactFormEntity ? 'Add Contact (Partner)' : 'Add Contact'}</DialogTitle>
              <DialogDescription>
                {contactFormEntity
                  ? `Additional contact for ${contactFormEntity.name}.`
                  : 'Standalone contact. Choose a label.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {!contactFormEntity && (
                <div>
                  <Label>Label</Label>
                  <Select value={contactFormLabel} onValueChange={(v) => setContactFormLabel(v as StandaloneContactLabel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDALONE_CONTACT_LABELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Name *</Label>
                <Input value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              {contactFormEntity?.type === 'municipality' ? (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={MUNICIPALITY_CONTACT_ROLES.some((r) => r.value === contactForm.role) ? contactForm.role : '__other__'}
                    onValueChange={(v) =>
                      setContactForm((f) => ({ ...f, role: v === '__other__' ? (f.role && !MUNICIPALITY_CONTACT_ROLES.some((r) => r.value === f.role) ? f.role : '') : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {MUNICIPALITY_CONTACT_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="__other__">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {!MUNICIPALITY_CONTACT_ROLES.some((r) => r.value === contactForm.role) && (
                    <Input
                      value={contactForm.role}
                      onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
                      placeholder="Custom role"
                    />
                  )}
                </div>
              ) : (
                <div>
                  <Label>Role / Title</Label>
                  <Input value={contactForm.role} onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. Project Manager" />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Input value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setContactFormOpen(false)} disabled={savingContact}>
                Cancel
              </Button>
              <Button onClick={handleSaveContact} disabled={savingContact || !contactForm.name.trim()}>
                {savingContact ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={developerFormOpen} onOpenChange={setDeveloperFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDeveloperId ? 'Edit Developer' : 'Add Developer'}</DialogTitle>
              <DialogDescription>Company or developer entity. Primary contact is on this form.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={developerForm.name} onChange={(e) => setDeveloperForm((f) => ({ ...f, name: e.target.value }))} placeholder="Company name" />
              </div>
              <div>
                <Label>Type</Label>
                <Input value={developerForm.type} onChange={(e) => setDeveloperForm((f) => ({ ...f, type: e.target.value }))} placeholder="e.g. Residential" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Primary contact name</Label>
                  <Input value={developerForm.contactName} onChange={(e) => setDeveloperForm((f) => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={developerForm.email} onChange={(e) => setDeveloperForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input value={developerForm.phone} onChange={(e) => setDeveloperForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={developerForm.website} onChange={(e) => setDeveloperForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={developerForm.notes} onChange={(e) => setDeveloperForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={developerForm.isActive} onChange={(e) => setDeveloperForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeveloperFormOpen(false)} disabled={savingDeveloper}>
                Cancel
              </Button>
              <Button onClick={handleSaveDeveloper} disabled={savingDeveloper || !developerForm.name.trim()}>
                {savingDeveloper ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={partnerFormOpen} onOpenChange={setPartnerFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPartnerId
                  ? `Edit ${partnerFormMode === 'subcontractors' ? 'Subcontractor' : partnerFormMode === 'suppliers' ? 'Supplier' : partnerFormMode === 'municipalities' ? 'Municipality' : partnerFormMode === 'lenders' ? 'Lender' : 'Developer'}`
                  : `Add ${partnerFormMode === 'subcontractors' ? 'Subcontractor' : partnerFormMode === 'suppliers' ? 'Supplier' : partnerFormMode === 'municipalities' ? 'Municipality' : partnerFormMode === 'lenders' ? 'Lender' : 'Developer'}`}
              </DialogTitle>
              <DialogDescription>
                Company name and primary contact. You can add more contacts by expanding the row in the list.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={partnerForm.name}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Company name"
                />
              </div>
              {(partnerFormMode !== 'municipalities') && (
                <div>
                  <Label>
                    {partnerFormMode === 'subcontractors' ? 'Trade / Specialty' :
                      partnerFormMode === 'suppliers' ? 'Category' :
                      partnerFormMode === 'lenders' ? 'Type' : 'Type'}
                  </Label>
                  <Input
                    value={partnerForm.tradeOrCategory}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, tradeOrCategory: e.target.value }))}
                    placeholder={
                      partnerFormMode === 'subcontractors' ? 'e.g. Framing' :
                      partnerFormMode === 'suppliers' ? 'e.g. Lumber' :
                      partnerFormMode === 'lenders' ? 'e.g. Construction Loan' : 'e.g. Residential'
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Primary contact name</Label>
                  <Input
                    value={partnerForm.contactName}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, contactName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={partnerForm.email}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={partnerForm.phone}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    value={partnerForm.website}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={partnerForm.notes}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={partnerForm.isActive}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPartnerFormOpen(false)} disabled={savingPartner}>
                Cancel
              </Button>
              <Button onClick={handleSavePartner} disabled={savingPartner || !partnerForm.name.trim()}>
                {savingPartner ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* App access: change role or revoke/reactivate (admin only) */}
        <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>App access</DialogTitle>
              <DialogDescription>
                {accessDialogContact && (
                  <>Manage app access for {accessDialogContact.name} ({accessDialogContact.email}).</>
                )}
              </DialogDescription>
            </DialogHeader>
            {accessDialogProfile && (
              <div className="space-y-4">
                <div>
                  <Label>Role</Label>
                  <Select value={accessDialogRole} onValueChange={(v) => setAccessDialogRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveAccess} disabled={savingAccess}>
                    {savingAccess ? 'Saving...' : 'Save role'}
                  </Button>
                  {accessDialogProfile.id !== userProfile?.id && (
                    accessDialogProfile.is_active === false
                      ? <Button variant="outline" onClick={handleRevokeOrReactivate} disabled={savingAccess}>Reactivate access</Button>
                      : <Button variant="outline" className="text-amber-600" onClick={handleRevokeOrReactivate} disabled={savingAccess}>Revoke access</Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invite to app: info for contacts not yet users */}
        <Dialog open={!!inviteInfoContact} onOpenChange={(open) => !open && setInviteInfoContact(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite to app</DialogTitle>
              <DialogDescription>
                This contact doesn&apos;t have app access yet.
              </DialogDescription>
            </DialogHeader>
            {inviteInfoContact && (
              <div className="space-y-3 text-sm">
                <p>
                  Have them sign up at <strong>{typeof window !== 'undefined' ? window.location.origin : ''}</strong> using
                  the email <strong>{inviteInfoContact.email}</strong>. After they join your organization, you can set their role here (Edit access).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.origin : ''
                    navigator.clipboard?.writeText(url)
                    alert('Link copied to clipboard.')
                  }}
                >
                  Copy sign-up link
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add user as contact: standalone or under a partner */}
        <Dialog open={!!addUserAsContactProfile} onOpenChange={(open) => !open && setAddUserAsContactProfile(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add as contact</DialogTitle>
              <DialogDescription>
                {addUserAsContactProfile && (
                  <>Add <strong>{addUserAsContactProfile.full_name?.trim() || addUserAsContactProfile.email}</strong> to the directory.</>
                )}
              </DialogDescription>
            </DialogHeader>
            {addUserAsContactProfile && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Add as</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="addUserMode"
                        checked={addUserAsContactMode === 'standalone'}
                        onChange={() => { setAddUserAsContactMode('standalone'); setAddUserAsContactEntityType(null); setAddUserAsContactEntityId(null) }}
                      />
                      <span>Standalone</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="addUserMode"
                        checked={addUserAsContactMode === 'under_entity'}
                        onChange={() => setAddUserAsContactMode('under_entity')}
                      />
                      <span>Under a partner</span>
                    </label>
                  </div>
                </div>
                {addUserAsContactMode === 'standalone' && (
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Select value={addUserAsContactLabel} onValueChange={(v) => setAddUserAsContactLabel(v as StandaloneContactLabel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDALONE_CONTACT_LABELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {addUserAsContactMode === 'under_entity' && (
                  <>
                    <div className="space-y-2">
                      <Label>Partner type</Label>
                      <Select
                        value={addUserAsContactEntityType ?? ''}
                        onValueChange={(v) => { setAddUserAsContactEntityType(v as PartnerTab); setAddUserAsContactEntityId(null) }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subcontractors">Subcontractors</SelectItem>
                          <SelectItem value="suppliers">Suppliers</SelectItem>
                          <SelectItem value="developers">Developers</SelectItem>
                          <SelectItem value="municipalities">Municipalities</SelectItem>
                          <SelectItem value="lenders">Lenders</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {addUserAsContactEntityType && (
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Select
                          value={addUserAsContactEntityId ?? ''}
                          onValueChange={(v) => setAddUserAsContactEntityId(v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            {entityListForAddUser().map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddUserAsContactProfile(null)}>Cancel</Button>
                  <Button onClick={handleAddUserAsContact} disabled={savingAddUserAsContact}>
                    {savingAddUserAsContact ? 'Adding...' : 'Add contact'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
