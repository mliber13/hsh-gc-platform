// Accessory UI helpers — parity with FieldMeasurementStage.jsx MATERIAL_OPTIONS + getters

export const FIELD_MATERIAL_OPTIONS: { category: string; items: string[] }[] = [
  {
    category: 'Corner Bead',
    items: ['Square Bead', 'Bullnose', 'Splay', 'Arch', 'Tearaway'],
  },
  {
    category: 'Joint Compound',
    items: [
      'All Purpose Joint Compound',
      'Lite Weight Joint Compound',
      'Easy Sand 90',
      'Easy Sand 45',
      'Easy Sand 20',
      'Easy Sand 5',
    ],
  },
  { category: 'Adhesives', items: ['TiteBond Foam', 'Spray Adhesive'] },
  {
    category: 'Fasteners',
    items: [
      'Drywall Screws 1"',
      'Drywall Screws 1-1/4"',
      'Drywall Screws 1-5/8"',
      'Drywall Screws 2"',
      'Drywall Screws 2-1/2"',
      'Drywall Screws 3"',
    ],
  },
  { category: 'Tape', items: ["500' Paper Tape", "300' Mesh Tape", 'No Coat 325'] },
  {
    category: 'Metal Studs',
    items: [
      '25 Gauge - 1-5/8"',
      '25 Gauge - 2-1/2"',
      '25 Gauge - 3-5/8"',
      '25 Gauge - 4"',
      '25 Gauge - 6"',
      '20 Gauge - 1-5/8"',
      '20 Gauge - 2-1/2"',
      '20 Gauge - 3-5/8"',
      '20 Gauge - 4"',
      '20 Gauge - 6"',
      '18 Gauge - 3-5/8"',
      '18 Gauge - 6"',
    ],
  },
  {
    category: 'Metal Track',
    items: [
      '25 Gauge - 1-5/8"',
      '25 Gauge - 2-1/2"',
      '25 Gauge - 3-5/8"',
      '25 Gauge - 4"',
      '25 Gauge - 6"',
      '20 Gauge - 1-5/8"',
      '20 Gauge - 2-1/2"',
      '20 Gauge - 3-5/8"',
      '20 Gauge - 4"',
      '20 Gauge - 6"',
      '18 Gauge - 3-5/8"',
      '18 Gauge - 6"',
    ],
  },
  {
    category: 'Acoustic Ceiling',
    items: [
      "2'x2' Tiles",
      "2'x4' Tiles",
      'Main Runners',
      "Cross Tees 4'",
      "Cross Tees 2'",
      'Wall Angle',
      'Hanger Wire',
    ],
  },
  {
    category: 'Suspended Drywall Grid',
    items: [
      'Main Runners',
      "Cross Tees 4'",
      "Cross Tees 2'",
      'Wall Angle',
      'Hanger Wire',
      'Transition Molding',
    ],
  },
  {
    category: 'FRP (Fiber Reinforced Panels)',
    items: [
      "4'x8' Panels",
      "4'x10' Panels",
      'Divider Bars',
      'Inside Corner',
      'Outside Corner',
      'FRP Adhesive',
    ],
  },
  {
    category: 'Insulation',
    items: [
      'R-13 Batts',
      'R-19 Batts',
      'R-21 Batts',
      'R-30 Batts',
      'R-38 Batts',
      'Sound Attenuation Batts',
      'Rigid Insulation 1"',
      'Rigid Insulation 2"',
    ],
  },
  { category: 'Hat Channel', items: ['7/8" Hat Channel', '1-1/2" Hat Channel', 'Z-Furring Channel'] },
  { category: 'RC Channel', items: ['RC-1 Channel'] },
]

export function getSubtypeOptions(type: string): string[] {
  const category = FIELD_MATERIAL_OPTIONS.find((cat) => cat.category === type)
  return category ? category.items : []
}

export function getUnitOptions(type: string): string[] {
  if (type === 'Corner Bead') return ['pcs']
  if (type === 'Joint Compound') return ['Bucket', 'Box', 'Bags']
  if (type === 'Adhesives') return ['Tube', 'Can', 'Gallon']
  if (type === 'Fasteners') return ['Box', 'lbs', 'pcs']
  if (type === 'Tape') return ['Roll']
  if (type === 'Metal Studs' || type === 'Metal Track') return ['pcs', 'bundle', 'linear ft']
  if (type === 'Acoustic Ceiling' || type === 'Suspended Drywall Grid') {
    return ['box', 'pcs', 'carton', 'roll']
  }
  if (type === 'FRP (Fiber Reinforced Panels)') {
    return ['pcs', 'pallet', 'bucket', 'tube', 'box']
  }
  if (type === 'Insulation') return ['bag', 'pallet', 'sqft', 'sheet', 'bundle']
  if (type === 'Hat Channel' || type === 'RC Channel') return ['pcs', 'bundle', 'linear ft']
  return ['pcs']
}

export function getDefaultUnit(type: string, subtype: string): string {
  if (type === 'Corner Bead') return 'pcs'
  if (type === 'Joint Compound') {
    if (subtype?.includes('Easy Sand')) return 'Bags'
    if (subtype === 'All Purpose Joint Compound' || subtype === 'Lite Weight Joint Compound') {
      return 'Box'
    }
    return 'Bucket'
  }
  if (type === 'Adhesives') return 'Tube'
  if (type === 'Fasteners') return 'Box'
  if (type === 'Tape') return 'Roll'
  if (type === 'Metal Studs' || type === 'Metal Track') return 'pcs'
  if (type === 'Acoustic Ceiling') {
    if (subtype?.includes('Tiles')) return 'box'
    if (subtype?.includes('Wire')) return 'roll'
    return 'pcs'
  }
  if (type === 'Suspended Drywall Grid') {
    if (subtype?.includes('Wire')) return 'roll'
    return 'pcs'
  }
  if (type === 'FRP (Fiber Reinforced Panels)') {
    if (subtype?.includes('Panels')) return 'pcs'
    if (subtype?.includes('Adhesive')) return 'bucket'
    return 'pcs'
  }
  if (type === 'Insulation') {
    if (subtype?.includes('Batts')) return 'bag'
    if (subtype?.includes('Rigid')) return 'sheet'
    return 'bag'
  }
  if (type === 'Hat Channel' || type === 'RC Channel') return 'pcs'
  return 'pcs'
}

export function getLengthOptions(type: string, subtype: string): string[] {
  if (type === 'Corner Bead') {
    if (subtype === 'Tearaway') return ["10'"]
    return ["12'", "10'", "9'", "8'"]
  }
  if (type === 'Metal Studs' || type === 'Metal Track') {
    return ["8'", "9'", "10'", "12'", "14'", "16'", "20'", "24'"]
  }
  if (type === 'Hat Channel' || type === 'RC Channel') {
    return ["8'", "10'", "12'"]
  }
  if (type === 'Suspended Drywall Grid' || type === 'Acoustic Ceiling') {
    if (subtype?.includes('Main') || subtype?.includes('Runner')) {
      return ["12'", "14'"]
    }
    if (subtype?.includes('Cross Tees')) return ["2'", "4'"]
    if (subtype?.includes('Wall Angle')) return ["10'", "12'"]
  }
  return []
}

export function getThreadTypeOptions(type: string): string[] {
  if (type === 'Fasteners') return ['Coarse Thread', 'Fine Thread']
  if (type === 'Metal Studs' || type === 'Metal Track') {
    return ['Standard', 'EQ (Equivalent Gauge)', 'Structural']
  }
  return []
}

export function shouldShowLength(type: string): boolean {
  return (
    type === 'Corner Bead' ||
    type === 'Metal Studs' ||
    type === 'Metal Track' ||
    type === 'Hat Channel' ||
    type === 'RC Channel' ||
    type === 'Suspended Drywall Grid' ||
    type === 'Acoustic Ceiling'
  )
}

export function shouldShowThreadType(type: string): boolean {
  return type === 'Fasteners' || type === 'Metal Studs' || type === 'Metal Track'
}
