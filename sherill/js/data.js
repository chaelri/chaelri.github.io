/* ==========================================================================
   drive-with-sherill — all site content lives here.
   Edit this file to update prices, variants, colors and promos.
   Prices are SRP, VAT-inclusive, taken from the Nissan Quezon Avenue
   price list Sherill issued (August 2026). Always confirm before quoting.
   ========================================================================== */

const AGENT = {
  name: 'Sherill Obillo',
  role: 'Nissan Marketing Professional',
  dealer: 'Nissan Quezon Avenue',
  tagline: 'Your Nissan. Your Way.',
  mobile: '09778093768',
  mobileIntl: '+639778093768',
  email: 'sherillf20@gmail.com',
  address: '138 Quezon Ave, Brgy. Tatalon, Quezon City, Metro Manila',
  mapQuery: 'Nissan Quezon Avenue, Quezon City',
  hours: 'Mon–Sat · 8:00 AM – 6:00 PM  |  Sun · by appointment',
  promoWindow: 'August 1 – September 30, 2026',
};

/* Body silhouettes used by the 3D viewer: sedan | mpv | crossover | suv | pickup | van */
const MODELS = [
  /* ------------------------------------------------------------------ */
  {
    id: 'almera',
    name: 'Almera',
    full: 'Nissan Almera',
    kicker: 'Subcompact Sedan',
    body: 'sedan',
    tagline: 'Smart. Stylish. Turbocharged.',
    sub: 'Built for everyday confidence.',
    priceFrom: 845000,
    seats: 5,
    heroColor: '#9aa0a6',
    highlights: [
      { icon: 'groups', title: 'Spacious comfort', desc: 'Best-in-class rear legroom for its size.' },
      { icon: 'verified_user', title: 'Advanced safety', desc: 'Multiple airbags, VDC, hill start assist.' },
      { icon: 'local_gas_station', title: 'Fuel efficient', desc: '1.0L 3-cylinder turbo with CVT.' },
      { icon: 'wifi', title: 'NissanConnect', desc: 'Remote engine start, vehicle tracking, geo-fencing.' },
    ],
    variants: [
      { name: 'Almera 1.0 EL Turbo MT', trans: 'Manual', price: 845000 },
      { name: 'Almera 1.0 EL Turbo MT (Premium Color)', trans: 'Manual', price: 865000 },
      { name: 'Almera 1.0 VE Turbo CVT with NissanConnect', trans: 'CVT', price: 1099000 },
      { name: 'Almera 1.0 VE Turbo CVT with NissanConnect (Premium Color)', trans: 'CVT', price: 1119000 },
      { name: 'Almera 1.0 VL Turbo CVT with NissanConnect', trans: 'CVT', price: 1199000 },
      { name: 'Almera 1.0 VL Turbo CVT with NissanConnect (Premium Color)', trans: 'CVT', price: 1219000 },
    ],
    colorGroups: [
      {
        label: 'Available colors (VL)',
        colors: [
          { name: 'Moonstone Pearl Gray with Black Roof', hex: '#8d9095', roof: '#151515' },
          { name: 'Gun Metallic', hex: '#5b5f63' },
          { name: 'Pearl White', hex: '#eef0f1', extra: 20000 },
        ],
      },
      {
        label: 'Available colors (VE)',
        colors: [
          { name: 'Cayenne Red', hex: '#a1131f' },
          { name: 'Pearl White', hex: '#eef0f1', extra: 20000 },
          { name: 'Gun Metallic', hex: '#5b5f63' },
          { name: 'Galaxy Black', hex: '#111214' },
        ],
      },
      {
        label: 'Available colors (EL)',
        colors: [
          { name: 'Pearl White', hex: '#eef0f1', extra: 20000 },
          { name: 'Gun Metallic', hex: '#5b5f63' },
          { name: 'Galaxy Black', hex: '#111214' },
        ],
      },
    ],
    specs: [
      ['Engine', '1.0L HRA0 3-cylinder Turbo'],
      ['Power / Torque', '100 PS / 152 Nm'],
      ['Transmission', 'Xtronic CVT'],
      ['Seating', '5'],
      ['Key features', 'LED headlamps, 8" display, Apple CarPlay & Android Auto, around-view monitor (VL)'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'kicks',
    name: 'KICKS e-POWER',
    full: 'Nissan KICKS e-POWER',
    kicker: 'Electrified Crossover',
    body: 'crossover',
    tagline: '100% electric drive. Zero charging.',
    sub: 'The EV feel, powered by petrol.',
    priceFrom: 1179000,
    seats: 5,
    featured: true,
    heroColor: '#c3002f',
    highlights: [
      { icon: 'bolt', title: '100% electric drive', desc: 'Wheels are always driven by the electric motor.' },
      { icon: 'ev_station', title: 'No plug, no charging', desc: 'The 1.2L engine charges the battery for you.' },
      { icon: 'speed', title: '280 Nm instant torque', desc: 'Full torque from a standstill — quiet and quick.' },
      { icon: 'eco', title: 'Excellent economy', desc: 'Engine runs at its most efficient point only.' },
    ],
    variants: [
      { name: 'KICKS e-POWER EL', trans: 'e-POWER AT', price: 1179000 },
      { name: 'KICKS e-POWER EL (Premium Color)', trans: 'e-POWER AT', price: 1199000 },
      { name: 'KICKS e-POWER VE', trans: 'e-POWER AT', price: 1279000 },
      { name: 'KICKS e-POWER VE (Premium Color)', trans: 'e-POWER AT', price: 1299000 },
      { name: 'KICKS e-POWER VL', trans: 'e-POWER AT', price: 1479000 },
      { name: 'KICKS e-POWER VL (Premium Color)', trans: 'e-POWER AT', price: 1499000 },
    ],
    colorGroups: [
      {
        label: 'Available colors',
        colors: [
          { name: 'Monarch Orange with Black Roof', hex: '#d8630f', roof: '#151515' },
          { name: 'Pearl White with Black Roof', hex: '#eef0f1', roof: '#151515' },
          { name: 'Burgundy with Black Roof', hex: '#6d1524', roof: '#151515' },
          { name: 'Pearl White', hex: '#eef0f1' },
          { name: 'Gun Metallic', hex: '#5b5f63' },
          { name: 'Galaxy Black', hex: '#111214' },
        ],
      },
    ],
    specs: [
      ['System', 'e-POWER series hybrid — engine is a generator only'],
      ['Engine', '1.2L 3-cylinder (charges the battery)'],
      ['Electric motor', '129–136 PS / 280 Nm'],
      ['Drive', 'Front-wheel drive, single-speed'],
      ['Charging', 'None required — you just refuel'],
      ['Seating', '5'],
      ['Key features', 'e-Pedal, Intelligent Around View Monitor, ProPILOT (variant-dependent)'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'livina',
    name: 'Livina',
    full: 'Nissan Livina',
    kicker: '7-Seater MPV',
    body: 'mpv',
    tagline: 'Spacious. Versatile. Reliable.',
    sub: 'Built for every journey.',
    priceFrom: 1214000,
    seats: 7,
    heroColor: '#d8630f',
    highlights: [
      { icon: 'groups', title: 'Spacious 7-seater', desc: 'Three rows with a flexible cargo setup.' },
      { icon: 'weekend', title: 'Comfortable & flexible', desc: 'Fold-flat seating for long-haul family trips.' },
      { icon: 'verified_user', title: 'Advanced safety', desc: 'Dual airbags, ABS with EBD, VDC.' },
      { icon: 'local_gas_station', title: 'Fuel efficient', desc: '1.5L engine tuned for city driving.' },
    ],
    variants: [
      { name: 'Livina 1.5 VE AT — New Display Audio', trans: '4-speed Automatic', price: 1214000 },
      { name: 'Livina 1.5 VE AT (Premium Color) — New Display Audio', trans: '4-speed Automatic', price: 1234000 },
      { name: 'Livina 1.5 VL AT — New Display Audio', trans: '4-speed Automatic', price: 1274000 },
      { name: 'Livina 1.5 VL AT (Premium Color) — New Display Audio', trans: '4-speed Automatic', price: 1294000 },
    ],
    colorGroups: [
      {
        label: 'Available colors (VL and VE AT)',
        colors: [
          { name: 'Royal Ruby Red', hex: '#8f1420' },
          { name: 'Moonstone Grey', hex: '#6a6d70' },
          { name: 'Diamond Pearl White', hex: '#eef0f1', extra: 20000 },
          { name: 'Onyx Black', hex: '#111214' },
          { name: 'Platinum Silver', hex: '#b9bcbf' },
        ],
      },
    ],
    specs: [
      ['Engine', '1.5L 4-cylinder petrol'],
      ['Transmission', '4-speed Automatic'],
      ['Seating', '7'],
      ['Key features', 'Floating 8" display, keyless entry, push-start, roof-mounted rear A/C'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'xtrail',
    name: 'X-Trail e-POWER',
    full: 'Nissan X-Trail e-POWER',
    kicker: 'Electrified Midsize SUV',
    body: 'crossover',
    tagline: 'Electrified. Elevated.',
    sub: 'Premium comfort with e-POWER drive.',
    priceFrom: 2290000,
    seats: 5,
    heroColor: '#96131f',
    highlights: [
      { icon: 'bolt', title: 'e-POWER drive', desc: 'Electric-motor drive, no charging needed.' },
      { icon: 'chair', title: 'Premium cabin', desc: 'Quiet, refined, generously equipped.' },
      { icon: 'shield', title: 'Nissan Safety Shield 360', desc: 'A full suite of driver-assist tech.' },
      { icon: 'terrain', title: 'Confident everywhere', desc: 'Drive modes for every road condition.' },
    ],
    variants: [
      { name: 'X-Trail e-POWER (Cardinal Red Metallic / Sahara Dune Metallic)', trans: 'e-POWER AT', price: 2290000 },
      { name: 'X-Trail e-POWER Premium Monotone (Everest White / Stealth Pearl Gray)', trans: 'e-POWER AT', price: 2310000 },
      { name: 'X-Trail e-POWER 2-Tone (Sahara Dune Metallic with Black Roof)', trans: 'e-POWER AT', price: 2310000 },
      { name: 'X-Trail e-POWER Premium 2-Tone (Everest White / Stealth Pearl Gray with Black Roof)', trans: 'e-POWER AT', price: 2320000 },
    ],
    colorGroups: [
      {
        label: 'Monotone',
        colors: [
          { name: 'Cardinal Red Metallic', hex: '#96131f' },
          { name: 'Sahara Dune Metallic', hex: '#bfae95' },
          { name: 'Everest White', hex: '#eef0f1', extra: 20000 },
          { name: 'Stealth Pearl Gray', hex: '#a8adb1', extra: 20000 },
        ],
      },
      {
        label: '2-tone with black roof',
        colors: [
          { name: 'Sahara Dune Metallic with Black Roof', hex: '#bfae95', roof: '#151515', extra: 20000 },
          { name: 'Everest White with Black Roof', hex: '#eef0f1', roof: '#151515', extra: 30000 },
          { name: 'Stealth Pearl Gray with Black Roof', hex: '#a8adb1', roof: '#151515', extra: 30000 },
        ],
      },
    ],
    specs: [
      ['System', 'e-POWER series hybrid'],
      ['Drive', 'Electric motor drive'],
      ['Charging', 'None required'],
      ['Seating', '5'],
      ['Key features', 'ProPILOT, Intelligent Around View Monitor, panoramic sunroof, digital cockpit'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'terra',
    name: 'Terra',
    full: 'Nissan Terra',
    kicker: '7-Seater Midsize SUV',
    body: 'suv',
    tagline: 'Dominate every journey.',
    sub: 'Power. Presence. Purpose.',
    priceFrom: 1729000,
    seats: 7,
    heroColor: '#8a9096',
    highlights: [
      { icon: 'bolt', title: 'Commanding performance', desc: '2.5L diesel with 7-speed automatic.' },
      { icon: 'verified_user', title: 'Advanced safety', desc: 'Intelligent Around View Monitor, VDC, hill descent.' },
      { icon: 'chair', title: 'Premium comfort', desc: 'Leather seating, tri-zone comfort for 7.' },
      { icon: 'local_gas_station', title: 'Fuel efficient', desc: 'Efficient diesel tuned for long drives.' },
      { icon: 'wifi', title: 'NissanConnect Services', desc: 'Remote start, tracking, security alerts.' },
    ],
    variants: [
      { name: 'Terra 2.5L EL MT 4x2', trans: '6-speed Manual', price: 1729000 },
      { name: 'Terra 2.5L VE AT 4x2', trans: '7-speed Automatic', price: 1969000 },
      { name: 'Terra 2.5L VE AT 4x2 (Premium Color)', trans: '7-speed Automatic', price: 1989000 },
      { name: 'Terra 2.5L VL AT 4x2', trans: '7-speed Automatic', price: 2119000 },
      { name: 'Terra 2.5L VL AT 4x2 (Premium Color)', trans: '7-speed Automatic', price: 2139000 },
      { name: 'Terra 2.5L VL AT 4x4', trans: '7-speed Automatic', price: 2409000 },
      { name: 'Terra 2.5L VL AT 4x4 (Premium Color)', trans: '7-speed Automatic', price: 2429000 },
      { name: 'Terra 2.5L Sport AT 4x2', trans: '7-speed Automatic', price: 2179000 },
      { name: 'Terra 2.5L Sport AT 4x2 (Premium Color)', trans: '7-speed Automatic', price: 2199000 },
      { name: 'Terra 2.5L Sport AT 4x4', trans: '7-speed Automatic', price: 2469000 },
      { name: 'Terra 2.5L Sport AT 4x4 (Premium Color)', trans: '7-speed Automatic', price: 2489000 },
    ],
    colorGroups: [
      {
        label: 'Available colors (VL & VE)',
        colors: [
          { name: 'Nebula Metallic Red', hex: '#8e1a1f' },
          { name: 'Forged Metallic Copper', hex: '#b8621f' },
          { name: 'Lunar Metallic Gray', hex: '#575b5f' },
          { name: 'Galaxy Black', hex: '#111214' },
          { name: 'Brilliant Silver', hex: '#c2c5c8' },
          { name: 'Aspen Pearl White', hex: '#eef0f1', extra: 20000 },
        ],
      },
      {
        label: 'Available colors (Sport)',
        colors: [
          { name: 'Aspen Pearl White', hex: '#eef0f1', extra: 20000 },
          { name: 'Stealth Pearl Gray', hex: '#7d8286', extra: 20000 },
          { name: 'Fiery Red', hex: '#b01220' },
          { name: 'Galaxy Black', hex: '#111214' },
        ],
      },
    ],
    specs: [
      ['Engine', '2.5L 4-cylinder turbo diesel'],
      ['Transmission', '7-speed Automatic'],
      ['Drivetrain', '4x2 / 4x4'],
      ['Seating', '7'],
      ['Key features', 'Intelligent Around View Monitor, 8" display, power tailgate (variant-dependent)'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'navara',
    name: 'Navara',
    full: 'Nissan Navara',
    kicker: 'Pickup',
    body: 'pickup',
    tagline: 'Built to work. Ready to play.',
    sub: 'Tough, refined, and everyday-usable.',
    priceFrom: 1240000,
    seats: 5,
    heroColor: '#3a4147',
    highlights: [
      { icon: 'fitness_center', title: 'Serious payload', desc: 'Work-ready bed with a comfortable cabin.' },
      { icon: 'terrain', title: '4x4 capability', desc: 'Electronic diff lock on 4x4 variants.' },
      { icon: 'verified_user', title: 'Safety tech', desc: 'Around View Monitor and VDC on higher trims.' },
      { icon: 'local_gas_station', title: '2.5L turbo diesel', desc: 'Proven, efficient, easy to service.' },
    ],
    variants: [
      { name: 'Navara 2.5L EL MT 4x2', trans: 'Manual', price: 1240000 },
      { name: 'Navara 2.5L VE Calibre MT 4x2', trans: 'Manual', price: 1595000 },
      { name: 'Navara 2.5L VE Calibre AT 4x2', trans: 'Automatic', price: 1695000 },
      { name: 'Navara 2.5L VE MT 4x4', trans: 'Manual', price: 1750000 },
      { name: 'Navara 2.5L VL Calibre AT 4x2', trans: 'Automatic', price: 1870000 },
      { name: 'Navara 2.5L VL Calibre AT 4x2 (Premium Color)', trans: 'Automatic', price: 1890000 },
      { name: 'Navara 2.5L Calibre-X AT 4x2', trans: 'Automatic', price: 1965000 },
      { name: 'Navara 2.5L Calibre-X AT 4x2 (Premium Color)', trans: 'Automatic', price: 1985000 },
      { name: 'Navara 2.5L VL MT 4x4', trans: 'Manual', price: 1990000 },
      { name: 'Navara 2.5L VL MT 4x4 (Premium Color)', trans: 'Manual', price: 2010000 },
      { name: 'Navara 2.5L VL AT 4x4', trans: 'Automatic', price: 2090000 },
      { name: 'Navara 2.5L VL AT 4x4 (Premium Color)', trans: 'Automatic', price: 2110000 },
      { name: 'Navara 2.5L PRO-4X AT 4x4', trans: 'Automatic', price: 2220000 },
      { name: 'Navara 2.5L PRO-4X AT 4x4 (Premium Color)', trans: 'Automatic', price: 2240000 },
    ],
    /* PRO-4X 4x4 AT and Calibre-X AT 4x2 have no colour list yet — Sherill's
       2026-08-13 message covered VL, VE Calibre and EL only. Ask her. */
    colorGroups: [
      {
        label: 'Available colors (VL 4x2 & 4x4)',
        colors: [
          { name: 'Aspen Pearl White', hex: '#eef0f1', extra: 20000 },
          { name: 'Forged Metallic Copper', hex: '#b8621f' },
          { name: 'Galaxy Black', hex: '#111214' },
          { name: 'Lunar Metallic Gray', hex: '#575b5f' },
        ],
      },
      {
        label: 'Available colors (VE Calibre 4x2 MT & AT)',
        colors: [
          { name: 'Galaxy Black', hex: '#111214' },
          { name: 'Brilliant Silver', hex: '#c2c5c8' },
          { name: 'Alpine White', hex: '#eef0f1' },
          { name: 'Forged Metallic Copper', hex: '#b8621f' },
          { name: 'Lunar Metallic Gray', hex: '#575b5f' },
        ],
      },
      {
        label: 'Available colors (EL 4x2 MT & VE 4x4 MT)',
        colors: [
          { name: 'Galaxy Black', hex: '#111214' },
          { name: 'Alpine White', hex: '#eef0f1' },
          { name: 'Brilliant Silver', hex: '#c2c5c8' },
        ],
      },
    ],
    specs: [
      ['Engine', '2.5L turbo diesel'],
      ['Transmission', '6-speed Manual / 7-speed Automatic'],
      ['Drivetrain', '4x2 / 4x4'],
      ['Seating', '5'],
      ['Key features', 'Multi-link rear suspension, PRO-4X off-road package on top trim'],
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'urvan',
    name: 'Urvan',
    full: 'Nissan Urvan',
    kicker: 'Passenger Van',
    body: 'van',
    tagline: 'Move more. Earn more.',
    sub: 'The workhorse van for family or business.',
    priceFrom: 1280000,
    seats: 15,
    heroColor: '#dfe2e5',
    highlights: [
      { icon: 'airport_shuttle', title: 'Up to 15 seats', desc: 'Configurations for family, shuttle or cargo.' },
      { icon: 'build', title: 'Low cost to run', desc: 'Simple, durable, parts everywhere.' },
      { icon: 'ac_unit', title: 'Rear air-conditioning', desc: 'Comfortable for every row.' },
      { icon: 'inventory_2', title: 'Business ready', desc: 'A favorite for shuttle and tour operators.' },
    ],
    variants: [
      { name: 'Urvan 2.5 C MT', trans: 'Manual', price: 1280000 },
      { name: 'Urvan 2.5 Standard MT', trans: 'Manual', price: 1570000 },
      { name: 'Urvan 2.5 Standard Plus MT', trans: 'Manual', price: 1580000 },
      { name: 'Urvan 2.5 CX MT', trans: 'Manual', price: 1820000 },
      { name: 'Urvan 2.5 CX AT', trans: 'Automatic', price: 1880000 },
      { name: 'Urvan 2.5 Premium MT', trans: 'Manual', price: 2105000 },
      { name: 'Urvan 2.5 Premium MT (Premium Color)', trans: 'Manual', price: 2125000 },
      { name: 'Urvan 2.5 Premium AT', trans: 'Automatic', price: 2165000 },
      { name: 'Urvan 2.5 Premium AT (Premium Color)', trans: 'Automatic', price: 2185000 },
    ],
    colorGroups: [
      {
        label: 'Available colors',
        colors: [
          { name: 'Alpine White', hex: '#eef0f1' },
          { name: 'Brilliant Silver', hex: '#c2c5c8' },
          { name: 'Galaxy Black', hex: '#111214' },
        ],
      },
    ],
    specs: [
      ['Engine', '2.5L turbo diesel'],
      ['Transmission', 'Manual / Automatic'],
      ['Seating', '12 to 15 depending on variant'],
      ['Key features', 'Rear A/C, high-roof body, dual sliding-door options'],
    ],
    /* Sherill's own photos of stock on the showroom floor. Premium (bubble
       top) — the CX MT and AT share this exact exterior, they just come
       without the seats fitted. */
    photos: {
      label: 'Actual unit on the showroom floor',
      note: 'Urvan Premium — the CX MT and AT share the same exterior, without the seats fitted.',
      /* w/h are required, not decorative: the strip sizes images by height with
         width:auto, so without intrinsic dimensions the box is 0px wide and the
         lazy-load observer never fires. */
      shots: [
        { src: 'urvan-1', w: 618, h: 1100, alt: 'Nissan Urvan Premium, front three-quarter view on the showroom floor' },
        { src: 'urvan-2', w: 618, h: 1100, alt: 'Nissan Urvan Premium, head-on front view' },
        { src: 'urvan-3', w: 1100, h: 618, alt: 'Nissan Urvan Premium, side view showing the high-roof body' },
        { src: 'urvan-4', w: 618, h: 1100, alt: 'Urvan Premium passenger seating, still factory-wrapped' },
        { src: 'urvan-5', w: 618, h: 1100, alt: 'Urvan Premium rear seat rows, still factory-wrapped' },
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'patrol',
    name: 'Patrol Royale',
    full: 'Nissan Patrol',
    kicker: 'Full-size Luxury SUV',
    body: 'suv',
    tagline: 'Power. Presence. Prestige.',
    sub: 'The all-new 2026 Nissan Patrol.',
    priceFrom: 5335000,
    seats: 7,
    heroColor: '#eef0f1',
    ltoNote: '₱25,000 · 3 years LTO registration',
    highlights: [
      { icon: 'settings', title: '3.5L V6 Twin Turbo', desc: 'Powerful performance for any journey.' },
      { icon: 'chair', title: 'Premium luxury & comfort', desc: 'Spacious. Refined. First-class experience.' },
      { icon: 'verified_user', title: 'Advanced safety', desc: 'Intelligent safety for you and your family.' },
      { icon: 'memory', title: 'Advanced technology', desc: 'Intuitive. Connected. In control.' },
      { icon: 'terrain', title: 'Commanding capability', desc: 'Built to conquer every terrain.' },
    ],
    variants: [
      { name: 'Patrol 3.5-L V6 TT AT 4x4', trans: '7-speed Automatic', price: 5335000, lto: 25000 },
      { name: 'Patrol 3.5-L V6 TT AT 4x4 (Premium Color)', trans: '7-speed Automatic', price: 5365000, lto: 25000 },
      { name: 'Patrol 3.5-L V6 TT AT 4x4 with Rear Display', trans: '7-speed Automatic', price: 5385000, lto: 25000 },
      { name: 'Patrol 3.5-L V6 TT AT 4x4 with Rear Display (2-Tone Color)', trans: '7-speed Automatic', price: 5405000, lto: 25000 },
      { name: 'Patrol 3.5-L V6 TT AT 4x4 with Rear Display (Premium Color)', trans: '7-speed Automatic', price: 5415000, lto: 25000 },
      { name: 'Patrol 3.5-L V6 TT AT 4x4 with Rear Display (Premium 2-Tone Color)', trans: '7-speed Automatic', price: 5435000, lto: 25000 },
    ],
    colorGroups: [
      {
        label: 'Monotone',
        colors: [
          { name: 'Granite Black', hex: '#111214' },
          { name: 'Everest White', hex: '#eef0f1', extra: 30000 },
        ],
      },
      {
        label: '2-tone with black roof',
        colors: [
          { name: 'Gun Metallic with Black Roof', hex: '#5b5f63', roof: '#151515', extra: 20000 },
          { name: 'Everest White with Black Roof', hex: '#eef0f1', roof: '#151515', extra: 50000 },
        ],
      },
    ],
    why: [
      ['3.5L V6 Twin Turbo Engine', 'Strong, smooth and refined power.'],
      ['7-Speed Automatic Transmission', 'Seamless performance and efficiency.'],
      ['Intelligent 4x4 System with Drive Modes', 'Ready for any road. Any adventure.'],
      ['Luxury That Moves You', 'Premium materials. Spacious comfort.'],
      ['12.3" Advanced Display with Rear Display', 'Stay connected. Everyone entertained.'],
      ['Nissan Intelligent Mobility', 'Smarter driving. Safer journeys.'],
    ],
    specs: [
      ['Engine', '3.5L V6 Twin Turbo'],
      ['Transmission', '7-speed Automatic'],
      ['Drivetrain', 'Intelligent 4x4 with drive modes'],
      ['Seating', '7'],
      ['Registration', '₱25,000 — 3 years LTO registration'],
    ],
  },
];

/* ---------------------------------------------------------------- promos */
const PROMOS = [
  {
    icon: 'payments',
    title: 'Cash discount',
    desc: 'Special cash-out pricing for straight-cash buyers. Ask for the exact discount on your chosen variant — it changes per unit and per month.',
    tag: 'Cash',
  },
  {
    icon: 'account_balance_wallet',
    title: 'As low as 20% down payment',
    desc: 'Low-DP schemes with flexible terms up to 60 months. Bring the DP down further with a trade-in.',
    tag: 'Financing',
  },
  {
    icon: 'account_balance',
    title: 'RCBC · BDO · BPI · other banks',
    desc: 'Sherill files with multiple banks so you get the best approved rate, not just one option.',
    tag: 'Financing',
  },
  {
    icon: 'shield',
    title: 'Free 1-year comprehensive insurance',
    desc: 'Locked-in comprehensive cover for the first year — Acts of Nature coverage available.',
    tag: 'Freebie',
  },
  {
    icon: 'assignment_turned_in',
    title: 'Free 3-year CTPL',
    desc: 'Compulsory Third Party Liability covered for three years.',
    tag: 'Freebie',
  },
  {
    icon: 'gavel',
    title: 'Free chattel mortgage fee',
    desc: 'The chattel mortgage cost on financed units is waived on qualified promos.',
    tag: 'Freebie',
  },
  {
    icon: 'auto_awesome',
    title: 'Tint, matting & seat cover',
    desc: 'Take home your unit already tinted, matted and with seat covers fitted.',
    tag: 'Freebie',
  },
  {
    icon: 'swap_horiz',
    title: 'Trade-in evaluation',
    desc: 'Free appraisal of your current vehicle — the value goes straight to your down payment.',
    tag: 'Trade-in',
  },
];

/* -------------------------------------------------------- e-POWER story */
const EPOWER_STEPS = [
  { icon: 'local_gas_station', title: 'You refuel — normally', desc: 'Petrol goes into the tank exactly like any other car. No plug, no charging station, no waiting.' },
  { icon: 'settings', title: 'The engine only generates', desc: 'The 1.2L engine never drives the wheels. It runs at its most efficient RPM purely to make electricity.' },
  { icon: 'battery_charging_full', title: 'The battery buffers power', desc: 'Energy is stored and released instantly — including energy recovered when you lift off the pedal.' },
  { icon: 'bolt', title: 'The motor drives the wheels', desc: '100% electric drive: instant 280 Nm, quiet cabin, one-pedal driving with e-Pedal.' },
];

const EPOWER_BENEFITS = [
  { icon: 'ev_station', title: 'No charging anxiety', desc: 'All the EV feel, none of the charging infrastructure problems.' },
  { icon: 'speed', title: 'Instant torque', desc: '280 Nm from zero — overtaking on EDSA is effortless.' },
  { icon: 'volume_off', title: 'Quiet cabin', desc: 'No gear hunting, no engine drone under acceleration.' },
  { icon: 'do_not_step', title: 'e-Pedal Step', desc: 'Drive mostly with one pedal in traffic — less fatigue.' },
  { icon: 'savings', title: 'Lower running cost', desc: 'The engine avoids the inefficient low-RPM zone entirely.' },
  { icon: 'build', title: 'Familiar servicing', desc: 'Serviced at any Nissan dealer — no special EV setup at home.' },
];

const EPOWER_COMPARE = {
  cols: ['Nissan KICKS e-POWER', 'Conventional petrol crossover', 'Parallel hybrid', 'Battery EV'],
  rows: [
    ['What drives the wheels', '100% electric motor, always', 'Engine via transmission', 'Engine and/or motor', '100% electric motor'],
    ['Do you need to plug in?', 'No — never', 'No', 'No', 'Yes, regularly'],
    ['Torque delivery', 'Instant, full from 0 km/h', 'Builds with revs', 'Mixed', 'Instant'],
    ['City fuel economy', 'Very strong — engine stays efficient', 'Weakest in stop-and-go', 'Strong', 'N/A (electricity)'],
    ['Cabin noise', 'Very low', 'Normal', 'Low to normal', 'Lowest'],
    ['Refuel / recharge time', 'Minutes at any gas station', 'Minutes', 'Minutes', '30 min to several hours'],
    ['Range anxiety', 'None', 'None', 'None', 'Depends on chargers'],
  ],
};

/* --------------------------------------------------------- financing --- */
/* Add-on rates (AOR) from Sherill's in-house bank panel, as of June 15, 2026.
   AOR is the total interest added across the WHOLE term, not per year:
     monthly amortization = (SRP − down payment) × (1 + AOR/100) ÷ term
   Estimates only — the bank's approved rate governs the final figure.

   NOTE: the source sheet also carries a "STD DI" (dealer's incentive) column.
   That is Sherill's commission per bank and is deliberately NOT in this file —
   anything here is readable by anyone via view-source. Keep it offline. */
const BANK_RATES = [
  { name: 'PSBank',                  aor: { 12: 10.33, 18: 12.86, 24: 24.06, 36: 34.97, 48: 44.57, 60: 54.70 } },
  { name: 'RCBC',                    aor: { 12: 11.40, 18: 13.40, 24: 24.00, 36: 39.39, 48: 47.48, 60: 56.55, 72: 68.57, 84: 82.39 },
    note: '72 and 84 months are promo terms — booking closes October 14, 2026.' },
  { name: 'BDO',                     aor: { 12: 11.40, 18: 13.40, 24: 24.00, 36: 37.00, 48: 44.50, 60: 56.21 } },
  { name: 'Chinabank Savings',       aor: { 12: 11.91, 18: 14.40, 24: 24.00, 36: 37.00, 48: 44.50, 60: 55.23 } },
  { name: 'EastWest Bank',           aor: { 12:  9.58,            24: 23.60, 36: 38.75, 48: 46.95, 60: 55.90 },
    note: '60 months bundled with Car+ insurance is 58.70% instead.' },
  { name: 'BPI',                     aor: { 12: 11.28, 18: 14.10, 24: 23.22, 36: 38.16, 48: 46.32, 60: 54.80, 72: 64.55, 84: 73.86 },
    note: '84 months is available on 1.4L engine displacement and up only.' },
  { name: 'Bank of Commerce',        aor: {                                  36: 36.65, 48: 44.47, 60: 56.68 } },
  { name: 'Security Bank',           aor: {                                  36: 35.32, 48: 43.78, 60: 53.05 } },
  { name: 'Maybank',                 aor: { 12:  9.40, 18: 12.50, 24: 23.80, 36: 34.00, 48: 42.00, 60: 56.03 } },
  { name: 'Sterling Bank of Asia',   aor: {                       24: 24.00, 36: 36.00, 48: 44.50, 60: 53.00 } },
  { name: 'PNB',                     aor: { 12:  9.65,            24: 21.25, 36: 36.25, 48: 44.25, 60: 54.00 } },
  { name: 'UnionBank',               aor: { 12: 27.80, 18: 31.02, 24: 34.29, 36: 40.99, 48: 47.90, 60: 55.00 } },
  /* Sherill's sheet lists First United twice with different 36/48 rates.
     TODO — ask her which programme is current, then delete the other. */
  { name: 'First United Finance & Leasing',            aor: { 36: 38.90, 48: 45.59, 60: 53.47 } },
  { name: 'First United Finance & Leasing (low-rate)', aor: { 36: 30.58, 48: 38.92, 60: 53.47 } },
];

const BANKS = BANK_RATES.map((b) => b.name);

const TESTIMONIAL_POINTS = [
  { icon: 'emoji_events', label: 'Top sales' },
  { icon: 'handshake', label: 'Trusted service' },
  { icon: 'favorite', label: 'Driven by passion' },
  { icon: 'center_focus_strong', label: 'Focused on you' },
];
