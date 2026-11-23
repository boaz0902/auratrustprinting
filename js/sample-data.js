// AuraTrust's published price list. Missing prices stay unset until confirmed.
export const priceList = [
  {
    id: "rush-id-prints",
    name: "Rush ID Prints",
    category: "Rush ID Prints",
    description: "Rush ID photo sets in the sizes and combinations listed below.",
    unit: "per set",
    billing: "unit",
    price: null,
    variants: [
      { label: "6 pcs 2×2", price: 45 },
      { label: "4 pcs 2×2", price: 45 },
      { label: "8 pcs 2×2", price: null },
      { label: "8 pcs 1×1", price: 30 },
      { label: "9 pcs Passport size", price: 40 },
      { label: "3 pcs 2×2 + 4 pcs 1×1 + 3 pcs Passport size", price: 45 }
    ],
    addons: [
      { id: "add-name", label: "Add name", price: 2 },
      { id: "email-soft-copy", label: "Send soft copy to email", price: 10 }
    ],
    file_kinds: ["id-photo"],
    popular: false,
    visible: true,
    sort_order: 1
  },
  {
    id: "docx-text-only",
    name: "DOCX | Text Only",
    category: "DOCX",
    description: "Text-only Word documents, priced by print mode and paper size.",
    unit: "per page",
    billing: "page",
    price: null,
    suggested_variant: "Black and White · Short",
    variants: [
      { label: "Black and White · Short", price: 3, paper: "short", color: "bw" },
      { label: "Black and White · Long", price: 3, paper: "long", color: "bw" },
      { label: "Black and White · A4", price: 3, paper: "a4", color: "bw" },
      { label: "Partially Colored · Short", price: 6, paper: "short", color: "color" },
      { label: "Partially Colored · Long", price: 6, paper: "long", color: "color" },
      { label: "Partially Colored · A4", price: 6, paper: "a4", color: "color" },
      { label: "Whole Page Colored · Short", price: 6, paper: "short", color: "color" },
      { label: "Whole Page Colored · Long", price: 6, paper: "long", color: "color" },
      { label: "Whole Page Colored · A4", price: 6, paper: "a4", color: "color" }
    ],
    file_kinds: ["docx"],
    popular: false,
    visible: true,
    sort_order: 2
  },
  {
    id: "docx-text-with-image",
    name: "DOCX | Text with Image",
    category: "DOCX",
    description: "Word documents with text and images, priced by print mode and paper size.",
    unit: "per page",
    billing: "page",
    price: null,
    variants: [
      { label: "Black and White · Short", price: 6, paper: "short", color: "bw" },
      { label: "Black and White · Long", price: 6, paper: "long", color: "bw" },
      { label: "Black and White · A4", price: 6, paper: "a4", color: "bw" },
      { label: "Partially Colored · Short", price: 10, paper: "short", color: "color" },
      { label: "Partially Colored · Long", price: 10, paper: "long", color: "color" },
      { label: "Partially Colored · A4", price: 10, paper: "a4", color: "color" },
      { label: "Whole Page Colored · Short", price: 10, paper: "short", color: "color" },
      { label: "Whole Page Colored · Long", price: 10, paper: "long", color: "color" },
      { label: "Whole Page Colored · A4", price: 10, paper: "a4", color: "color" }
    ],
    file_kinds: ["docx"],
    popular: false,
    visible: true,
    sort_order: 3
  },
  {
    id: "docx-image-only",
    name: "DOCX | Image Only",
    category: "DOCX",
    description: "Word documents containing images only.",
    unit: "per page",
    billing: "page",
    price: null,
    variants: [
      { label: "Black and White · Short", price: null, paper: "short", color: "bw" },
      { label: "Black and White · Long", price: null, paper: "long", color: "bw" },
      { label: "Black and White · A4", price: null, paper: "a4", color: "bw" },
      { label: "Partially Colored · Short", price: null, paper: "short", color: "color" },
      { label: "Partially Colored · Long", price: null, paper: "long", color: "color" },
      { label: "Partially Colored · A4", price: null, paper: "a4", color: "color" },
      { label: "Whole Page Colored · Short", price: null, paper: "short", color: "color" },
      { label: "Whole Page Colored · Long", price: null, paper: "long", color: "color" },
      { label: "Whole Page Colored · A4", price: null, paper: "a4", color: "color" }
    ],
    file_kinds: ["docx"],
    popular: false,
    visible: true,
    sort_order: 4
  },
  {
    id: "xerox",
    name: "Xerox",
    category: "Xerox and Scan",
    description: "Xerox service by print mode and paper size.",
    unit: "per page",
    billing: "page",
    price: null,
    variants: [
      { label: "Black and White · Short", price: null, paper: "short", color: "bw" },
      { label: "Black and White · Long", price: null, paper: "long", color: "bw" },
      { label: "Black and White · A4", price: null, paper: "a4", color: "bw" },
      { label: "Whole Page Colored · Short", price: null, paper: "short", color: "color" },
      { label: "Whole Page Colored · Long", price: null, paper: "long", color: "color" },
      { label: "Whole Page Colored · A4", price: null, paper: "a4", color: "color" }
    ],
    file_kinds: ["pdf", "doc", "xls", "xlsx", "ppt", "pptx", "txt"],
    popular: false,
    visible: true,
    sort_order: 5
  },
  {
    id: "scan",
    name: "Scan",
    category: "Xerox and Scan",
    description: "Scan documents and request a soft copy by email.",
    unit: "per item",
    billing: "unit",
    price: null,
    variants: [
      { label: "A4 and below", price: null },
      { label: "Soft copy via email", price: null }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 6
  },
  {
    id: "photo-prints",
    name: "Photo Printing",
    category: "Photo Printing",
    description: "Photo print sizes and borderless options.",
    unit: "per print",
    billing: "unit",
    price: null,
    variants: [
      { label: "2R", price: null },
      { label: "3R", price: null },
      { label: "4R", price: null },
      { label: "5R", price: null },
      { label: "A4", price: null },
      { label: "Borderless 3R", price: null },
      { label: "Borderless 4R", price: null },
      { label: "Borderless 5R", price: null }
    ],
    file_kinds: ["image"],
    popular: false,
    visible: true,
    sort_order: 7
  },
  {
    id: "instax-polaroid",
    name: "Instax and Polaroid",
    category: "Instax and Polaroid",
    description: "Polaroid print styles.",
    unit: "per print",
    billing: "unit",
    price: null,
    variants: [
      { label: "Polaroid Mini", price: null },
      { label: "Polaroid Regular", price: null },
      { label: "Polaroid Wide", price: null },
      { label: "Polaroid with Design", price: null }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 8
  },
  {
    id: "photo-strip-booth",
    name: "Photo Strip and Photo Booth",
    category: "Photo Strip and Photo Booth",
    description: "Photo strip and photo booth options.",
    unit: "per item",
    billing: "unit",
    price: null,
    variants: [
      { label: "Photo Strip Mini", price: null },
      { label: "Photo Booth", price: null },
      { label: "Per Design", price: null },
      { label: "Back to Back", price: null },
      { label: "Photo Top", price: null }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 9
  },
  {
    id: "photo-cards",
    name: "Photo Cards",
    category: "Photo Cards",
    description: "Photo card styles and finishes.",
    unit: "per item",
    billing: "unit",
    price: null,
    variants: [
      { label: "Photo Cards", price: null },
      { label: "Photo Cards Front and Back to Back", price: null },
      { label: "Uncoated", price: null },
      { label: "Glossy/Matte", price: null },
      { label: "Glittered", price: null },
      { label: "Halo", price: null }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 10
  },
  {
    id: "button-pins-25mm",
    name: "Button Pins | 25mm",
    category: "Button Pins",
    description: "Choose a finish and backing.",
    unit: "per piece",
    billing: "unit",
    price: null,
    variants: [
      { label: "Plastic Coat · Plastic Back", price: 10 },
      { label: "Plastic Coat · Metal Back", price: 8 },
      { label: "Glossy/Matte Coat · Plastic Back", price: 12 },
      { label: "Glossy/Matte Coat · Metal Back", price: 10 },
      { label: "Glittered · Plastic Back", price: 15 },
      { label: "Glittered · Metal Back", price: 12 }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 11
  },
  {
    id: "button-pins-32mm",
    name: "Button Pins | 32mm",
    category: "Button Pins",
    description: "Choose a finish and backing.",
    unit: "per piece",
    billing: "unit",
    price: null,
    variants: [
      { label: "Plastic Coat · Plastic Back", price: 13 },
      { label: "Plastic Coat · Metal Back", price: 10 },
      { label: "Glossy/Matte Coat · Plastic Back", price: 18 },
      { label: "Glossy/Matte Coat · Metal Back", price: 15 },
      { label: "Glittered · Plastic Back", price: 20 },
      { label: "Glittered · Metal Back", price: 20 }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 12
  },
  {
    id: "button-pins-58mm",
    name: "Button Pins | 58mm",
    category: "Button Pins",
    description: "Choose a finish and backing.",
    unit: "per piece",
    billing: "unit",
    price: null,
    variants: [
      { label: "Plastic Coat · Plastic Back", price: 15 },
      { label: "Plastic Coat · Metal Back", price: 12 },
      { label: "Glossy/Matte Coat · Plastic Back", price: 25 },
      { label: "Glossy/Matte Coat · Metal Back", price: 20 },
      { label: "Glittered · Plastic Back", price: 30 },
      { label: "Glittered · Metal Back", price: 25 }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 13
  },
  {
    id: "keychain-mini",
    name: "Keychain Mini",
    category: "Keychains",
    description: "Mini keychain quantities and optional photo top.",
    unit: "per set",
    billing: "unit",
    price: null,
    variants: [
      { label: "Back to Back", price: 20 },
      { label: "5 for", price: 80 }
    ],
    addons: [
      { id: "photo-top", label: "Additional photo top (optional)", price: 5 }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 14
  },
  {
    id: "keychain-photo-strip",
    name: "Keychain Photo Strip",
    category: "Keychains",
    description: "Photo strip keychain quantities and optional photo top.",
    unit: "per set",
    billing: "unit",
    price: null,
    variants: [
      { label: "Back to Back", price: 35 },
      { label: "2 for", price: 60 }
    ],
    addons: [
      { id: "photo-top", label: "Additional photo top (optional)", price: 5 }
    ],
    file_kinds: [],
    popular: false,
    visible: true,
    sort_order: 15
  }
];
