import { describe, expect, it } from 'vitest'
import { UPLOAD_LIMITS, formatBytes, uploadRejectionReason } from './uploadLimits'

function file(over: Partial<{ name: string; size: number; type: string }> = {}) {
  return { name: 'plans.pdf', size: 1_000_000, type: 'application/pdf', ...over }
}

describe('uploadRejectionReason', () => {
  it('accepts an ordinary plan set', () => {
    expect(uploadRejectionReason(file(), 'project-documents')).toBeNull()
  })

  it('accepts the largest document already in storage', () => {
    // 22.8 MB, uploaded April 2026. A tighter cap would have refused a real file.
    expect(uploadRejectionReason(file({ size: 23_913_987 }), 'project-documents')).toBeNull()
  })

  it('refuses a file over the bucket limit, naming the file and the limit', () => {
    const reason = uploadRejectionReason(file({ size: 150 * 1_048_576 }), 'project-documents')
    expect(reason).toContain('plans.pdf')
    expect(reason).toContain('150 MB')
    expect(reason).toContain('100 MB')
  })

  it('refuses an empty file', () => {
    expect(uploadRejectionReason(file({ size: 0 }), 'project-documents')).toContain('empty')
  })

  it('refuses a type the bucket does not allow', () => {
    const reason = uploadRejectionReason(
      file({ name: 'design.dwg', type: 'image/vnd.dwg' }),
      'project-documents',
    )
    expect(reason).toContain('design.dwg')
    expect(reason).toContain('image/vnd.dwg')
  })

  it('lets a blank type through — the server is the authority', () => {
    // Browsers leave `type` empty for plenty of ordinary files; guessing here would refuse
    // uploads Storage would have accepted.
    expect(uploadRejectionReason(file({ type: '' }), 'project-documents')).toBeNull()
  })

  it('ignores case on the mime type', () => {
    expect(uploadRejectionReason(file({ type: 'APPLICATION/PDF' }), 'project-documents')).toBeNull()
  })

  it('applies each bucket its own limits', () => {
    // A 20 MB photo is fine as a project document and too big for a field photo.
    const photo = file({ name: 'wall.jpg', size: 20 * 1_048_576, type: 'image/jpeg' })
    expect(uploadRejectionReason(photo, 'project-documents')).toBeNull()
    expect(uploadRejectionReason(photo, 'drywall-field-photos')).toContain('10 MB')
    // And a PDF is not a field photo at all.
    expect(uploadRejectionReason(file(), 'drywall-field-photos')).toContain('application/pdf')
  })
})

describe('UPLOAD_LIMITS mirrors the live bucket configuration', () => {
  it('holds the byte limits Storage reported on 2026-09-29', () => {
    // If a bucket is reconfigured, this is the line that should fail rather than an upload.
    expect(UPLOAD_LIMITS['project-documents'].maxBytes).toBe(104_857_600)
    expect(UPLOAD_LIMITS['deal-documents'].maxBytes).toBe(52_428_800)
    expect(UPLOAD_LIMITS['drywall-field-photos'].maxBytes).toBe(10_485_760)
  })

  it('accepts heic and heif for field photos — iPhones send them', () => {
    const mimes = UPLOAD_LIMITS['drywall-field-photos'].mimeTypes
    expect(mimes).toContain('image/heic')
    expect(mimes).toContain('image/heif')
  })
})

describe('formatBytes', () => {
  it('reads the way a person would write it', () => {
    expect(formatBytes(104_857_600)).toBe('100 MB')
    expect(formatBytes(10_485_760)).toBe('10 MB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(512)).toBe('512 bytes')
  })
})
