/* ===================================================================
   Guard Exit Interview Tracker — app.js
   Pure vanilla JS, no frameworks, localStorage persistence
=================================================================== */

// ─── DATA SCHEMA ────────────────────────────────────────────────────
const COMPANIES = {
  manela: { id: 'manela', name: 'New Manela', storageKey: 'exit_interview_records_manela' },
  moriah: { id: 'moriah', name: 'New Moriah', storageKey: 'exit_interview_records_moriah' },
};
let currentCompany = localStorage.getItem('exit_interview_active_company') || 'manela';
function getStorageKey() { return COMPANIES[currentCompany].storageKey; }

const SECTIONS = [
  { id: 'guard-info',      label: 'Guard Info',          icon: 'badge' },
  { id: 'income-payroll',  label: 'Income & Payroll',     icon: 'payments' },
  { id: 'exit-reasons',    label: 'Exit Reasons',         icon: 'logout' },
  { id: 'op-stressors',    label: 'Operational Stressors',icon: 'warning_amber' },
  { id: 'supervision',     label: 'Supervision & Power',  icon: 'manage_accounts' },
  { id: 'complaints',      label: 'Complaint Handling',   icon: 'report_problem' },
  { id: 'exit-summary',    label: 'Exit Summary',         icon: 'exit_to_app' },
  { id: 'stay-factors',    label: 'Stay Factors',         icon: 'anchor' },
  { id: 'trust-index',     label: 'Trust Index',          icon: 'verified_user' },
];

const EXIT_REASON_CATEGORIES = [
  {
    label: 'Compensation & Financial Experience',
    icon: 'payments',
    items: [
      'Low salary or take-home pay lower than expected',
      'Early deductions created financial difficulty',
      'Salary insufficient for personal or family needs',
      'Better job opportunity elsewhere (local or overseas)',
    ],
  },
  {
    label: 'Workload, Stress & Well-being',
    icon: 'fitness_center',
    items: [
      'Burnout (too much physical or emotional stress)',
      'Work-life balance difficulties (straight duty, shift changes)',
      'Health reasons',
      'Cancellation of rest days',
      'Frequent schedule changes',
    ],
  },
  {
    label: 'Deployment, Location & Work Conditions',
    icon: 'location_on',
    items: [
      'Long commute or expensive transportation cost to your post',
      'Poor living or work conditions at your post',
      'Preferred different assignment or post',
    ],
  },
  {
    label: 'Career Development & Growth',
    icon: 'trending_up',
    items: [
      'No career growth, promotion, or training opportunities',
      'Viewed the role as a temporary position rather than a long-term career',
      'Sought opportunities aligned with long-term career goals',
    ],
  },
  {
    label: 'Professional Identity & Recognition',
    icon: 'workspace_premium',
    items: [
      'Feeling that the security role is undervalued or not professionally recognized',
      'Low morale due to perception of security work as a low-skill or low-status job',
      'Lack of recognition or appreciation for your work',
    ],
  },
  {
    label: 'Supervision and Leadership',
    icon: 'manage_accounts',
    items: [
      'Conflict with your immediate supervisor',
      'Perceived unfair treatment',
      'Poor leadership at your post',
    ],
  },
  {
    label: 'Workplace Relationships & Culture',
    icon: 'groups',
    items: [
      'Conflict with other security guards',
      'Detachment culture not supportive or respectful',
      'Bullying or discrimination',
      'Sexual harassment',
    ],
  },
  {
    label: 'Personal & External Factors',
    icon: 'person',
    items: [
      'Relationship or family issues (partner problems, childcare, relocation)',
      'Family responsibilities (caring of parents, family property oversight, etc.)',
      'Personal circumstances',
      'Influence from social media or peers about other jobs',
    ],
  },
];
// Flat list derived from categories (used for blankRecord and table columns)
const EXIT_REASON_FIELDS = EXIT_REASON_CATEGORIES.flatMap(c => c.items);
const OP_STRESSOR_FIELDS = [
  'Sudden or Unpredictable Schedule Changes',
  'Cancelled or Interrupted Rest Days',
  'Denied or Delayed Leave of Absence',
  'Extended Shifts Beyond Schedule',
  'Insufficient Recovery Time Between Shifts',
  'Excessive Workload Beyond Reasonable Capacity',
  'Insufficient Staffing Resulting in Work Overload',
  'Emotional Exhaustion or Burnout Symptoms',
  'Physical Exhaustion or Fatigue',
  'Pressure to Work While Physically Unwell',
  'Lack of Supervisory Support During High-Demand Periods',
];
const SUPERVISION_FLAGS = [
  'Public reprimand or verbal humiliation',
  'Abuse of authority or misuse of supervisory power',
  'Pressure or coercion regarding work schedules, assignments, or responsibilities',
  'Difficulty reporting grievances, concerns or complaints',
  'Favoritism, inequitable treatment or bias in assignments, evaluations, or leave approvals',
  'A hostile, intimidating, or professionally inappropriate supervisory environment',
];
const COMPLAINT_FLAGS = [
  'Agency Protects Guards', 'Fair Investigation', 'Sides with Client Always',
  'Inadequate Support', 'No Experience Handling Complaints',
];
const STAY_FACTOR_FIELDS = [
  'More predictable and stable work schedules',
  'Restructured long-term payroll deductions (uniform, paraphernalia, etc.)',
  'Reduced frequency of sudden schedule changes',
  'Fair, respectful, and consistent supervision',
  'Fair and transparent scheduling practices',
  'Improved communication from supervisors or management',
  'Equal treatment in assignments, evaluations, and leave approvals',
  'Transfer to a post closer to home',
  'Consideration of personal or family circumstances in posting decisions',
  'More recognition and appreciation for performance',
  'Opportunities for promotion or career advancement',
  'Access to training and professional development',
  'Clearer performance evaluation and promotion criteria',
  'Improved staffing levels',
  'Better rest and recovery policies',
  'Stronger and responsive grievance or complaint mechanisms',
  'A safer and more respectful workplace environment',
];
const TRUST_FIELDS = [
  'I felt valued by the agency',
  'I trusted management',
  'I felt replaceable',
  'I felt respected',
  'I felt safe',
];
const BREAKING_POINT_CONTEXT = [
  'Extreme workload or excessive overtime',
  'Conflict or lack of support from supervisors or colleagues',
  'Unsafe or unhealthy working conditions',
  'Health or personal well-being concerns',
  'Any other event that made continuing difficult',
];
const EXIT_TYPE_OPTIONS = ['Resignation','AWOL','Terminated','Other'];
const MARITAL_STATUS_OPTIONS = ['','Single','Married','Separated','Live-in Partner','Widow/Widower','Single Mom/Dad'];
const FAMILY_LOCATION_OPTIONS = ['','Same city as post','Same province, different city','Different province'];
const WHERE_HEARD_OPTIONS = ['','Training Center','Referral','Social Media','Walk-in applicant','Absorbed from another agency'];
const EDUCATIONAL_ATTAINMENT_OPTIONS = [
  '',
  'Elementary Level',
  'Elementary Graduate',
  'High School Level (JHS)',
  'High School Graduate (JHS)',
  'Senior High School Level',
  'Senior High School Graduate',
  'Vocational / Technical Graduate (TESDA)',
  'Some College Units (Undergraduate)',
  'College Graduate',
  'Post-Graduate (Master\'s / Doctorate)',
  'Others',
];
const LENGTH_OF_SERVICE_OPTIONS = ['','Less than 3 months','3–6 months','6–12 months','1–2 years','2–3 years','More than 3 years'];
const DETACHMENT_OPTIONS = [
  '',
  'ACE HARDWARE - PAVIA',
  'ACE HARDWARE PHILIPPINES INC (MOLINO)',
  'ACE HARDWARE PHILS. INC. (Lapu-Lapu)',
  'ACE HARDWARE PHILS. INC. (Mabolo)',
  'ACE HARDWARE-SM CITY ILOILO',
  'ADC - MULTI STORE CORP. (JMall Mandaue)',
  'ADC - Metro Manila Shopping',
  'ADC THE SM STORE - CALOOCAN DEPARO',
  'ADC-Shopping Lane Cebu Corp.',
  'ASIA PACIFIC COLLEGE',
  'AUTO VAULT',
  'Ace Hardware - City Mall Kalibo',
  'Ace Hardware - Deca Mall',
  'Ace Hardware - Delgado',
  'Ace Hardware - Passi',
  'Ace Hardware - Telabastagan',
  'Ace Hardware Phils.-Subangdako Mandaue',
  'Ace Hardware-City Mall Tagbak',
  'Adidas - Grand Central',
  'Adidas Shop (Mabolo)',
  'Adidas Shop (SM Seaside)',
  'Adidas Shop - SM City Iloilo',
  'Averon Holdings Inc. (6780 Bldg.)',
  'BDO - THE PODIUM CARPARK',
  'BDO - THE PODIUM PERIMETER',
  'BDO A PLACE-CORAL WAY',
  'BDO A. ARNAIZ-PASEO',
  'BDO A. ARNAIZ-SAN LORENZO VILLAGE',
  'BDO ALFARO SALCEDO VILLAGE',
  'BDO ASIA TOWER - PASEO',
  'BDO AUGMENT',
  'BDO AYALA - RUFINO',
  'BDO AYALA AVE. PEOPLE SUPPORT',
  'BDO AYALA AVE. SGV1 BLDG.',
  'BDO AYALA AVENUE',
  'BDO AYALA AVENUE 6780',
  'BDO AYALA TRIANGLE 1',
  'BDO BACLARAN',
  'BDO BGC - 9th AVENUE',
  'BDO BGC - BURGOS CIRCLE',
  'BDO BGC - CRESCENT PARK WEST',
  'BDO BGC - ECOTOWER',
  'BDO BGC - FORT LEGENDS',
  'BDO BGC - FORT VICTORIA',
  'BDO BGC - GRAND HAMPTON TOWER',
  'BDO BGC - INOZA TOWER',
  'BDO BGC - J.Y CAMPOS CENTER',
  'BDO BGC - MARKET MARKET',
  'BDO BGC - ONE MCKINLEY PLACE',
  'BDO BGC - ONE WORLD PLACE',
  'BDO BGC - PHIL. STOCK EXCHANGE',
  'BDO BGC - PICADILLY STAR',
  'BDO BGC - PIONEER HOUSE',
  'BDO BGC - SHANGRI-LA',
  'BDO BGC - SHANGRI-LA 2',
  'BDO BGC - ST. LUKES',
  'BDO BGC - THE INFINITY TOWER',
  'BDO BGC - UNIVERSITY PARKWAY',
  'BDO BGC - UPTOWN PALAZZO',
  'BDO BGC - WORLD PLAZA',
  'BDO BICUTAN - BETTER LIVING',
  'BDO BICUTAN - BETTER LIVING BICUTAN',
  'BDO BICUTAN - DONA SOLEDAD AVE. EXT.',
  'BDO BICUTAN - EAST SERVICE ROAD',
  'BDO BICUTAN - SM CITY BICUTAN',
  'BDO BICUTAN - SUN VALLEY',
  'BDO BICUTAN - WALTERMART',
  'BDO BICUTAN - WEST SERVICE ROAD',
  'BDO BUENDIA - TAFT',
  'BDO CASH & CARRY',
  'BDO CHINO ROCES - DELA ROSA (One Oculus)',
  'BDO CHINO ROCES V.A RUFINO',
  'BDO CORPORATE CENTER MAKATI',
  'BDO DELA ROSA - GALLARDO',
  'BDO DELA ROSA - RADA',
  'BDO DIAN - BUILDING',
  'BDO DIAN GIL PUYAT',
  'BDO Dr. A. SANTOS AVE - PUREGOLD EVACOM',
  'BDO EDSA PASAY',
  'BDO FIVE E-COM (Releasing Center)',
  'BDO FIVE E-COM CENTER',
  'BDO GC CORP. PLAZA - LEGASPI ST.',
  'BDO GIL PUYAT - FILMORE',
  'BDO GIL PUYAT - HARRISON',
  'BDO GIL PUYAT - TAFT',
  'BDO GREENBELT - PASEO DE ROXAS',
  'BDO LEGASPI VILLAGE - C. PALANCA',
  'BDO LEGASPI VILLAGE - GAMBOA',
  'BDO LEGASPI VILLAGE - SALCEDO ST.',
  'BDO LEVERIZA - LIBERTAD',
  'BDO MACAPAGAL BLVD. - MERIDIAN PARK',
  'BDO MACAPAGAL BLVD. - PEARL DRIVE',
  'BDO MACAPAGAL BLVD. - W MALL',
  'BDO MAKATI - DELA ROSA LEGASPI ST',
  'BDO MAKATI - ESTEBAN',
  'BDO MAKATI - PASAY ROAD',
  'BDO MAKATI - SHANGRI-LA',
  'BDO MAKATI AVENUE - AYALA',
  'BDO MALL OF ASIA -  CASH HUB',
  'BDO MALL OF ASIA -  SEA RESIDENCES',
  'BDO MALL OF ASIA - ARMORED CAR',
  'BDO MALL OF ASIA - S. MAISON',
  'BDO MALL OF ASIA - SHELL RESIDENCES',
  'BDO MALL OF ASIA - SHORE RESIDENCES',
  'BDO MEDICAL PLAZA - LEGASPI VILLAGE',
  'BDO MOA CAR DEPOT PASAY',
  'BDO NAIA-3',
  'BDO NEWPORT CITY',
  'BDO NEWPORT CITY - PLAZA 66',
  'BDO ONE E - COMCENTER',
  'BDO PARANAQUE - AIRPORT ROAD',
  'BDO PARANAQUE - ASEANA BUSINESS PARK MONARCH',
  'BDO PARANAQUE - BACLARAN REDEMPTORIST ROAD',
  'BDO PARANAQUE - CITY OF DREAMS',
  'BDO PARANAQUE - LA HUERTA',
  'BDO PARANAQUE - MACAPAGAL ASEANA 3',
  'BDO PARANAQUE - MACAPAGAL BLVD. BAY AREA',
  'BDO PARANAQUE - MOONWALK',
  'BDO PARANAQUE - MOONWALK E. ROD. AVE.',
  'BDO PARANAQUE - NAIA 1',
  'BDO PARANAQUE - NAIA ROAD',
  'BDO PARANAQUE - OKADA',
  'BDO PARANAQUE - PASCOR DRIVE',
  'BDO PARANAQUE - SOLAIRE MANILA RESORT',
  'BDO PARANAQUE - SOLAIRE THE SHOPPES',
  'BDO PARANAQUE - STO. NINO',
  'BDO PASAY',
  'BDO PASAY - DOMESTIC ROAD',
  'BDO PASAY - TWO SHOPPING CENTER',
  'BDO PASIG - PUREGOLD SAN JOAQUIN',
  'BDO PATEROS - POBLACION',
  'BDO PEREA PASEO',
  'BDO RADA - LEGASPI VILLAGE',
  'BDO RESORTS WORLD MANILA',
  'BDO RESPONSE TEAM',
  'BDO ROXAS BLVD. - BREEZE RESIDENCES',
  'BDO ROXAS BLVD. - RADIANCE MANILA BAY',
  'BDO SALCEDO - DELA ROSA',
  'BDO SALCEDO - GAMBOA',
  'BDO SAMPALOC - G. TUAZON',
  'BDO SM HYPERMARKET - MAKATI',
  'BDO SM MAKATI',
  'BDO SM MALL OF ASIA - A',
  'BDO SM MALL OF ASIA B',
  'BDO SM RETAIL HQ Bldg. A',
  'BDO SM RETAIL HQ Bldg. B',
  'BDO SUCAT - SM CITY SUCAT A',
  'BDO SUCAT - SM CITY SUCAT B',
  'BDO SUCAT - WALTERMART',
  'BDO TAFT LIBERTAD',
  'BDO TAGIUG - SM AURA PREMIER',
  'BDO TAGUIG - BAYANI ROAD',
  'BDO TAGUIG - D\'ZIGNO TILE COMPANY (ROPA)',
  'BDO TAGUIG - GRACE RESIDENCES',
  'BDO TAGUIG - LEVI MARIANO AVENUE',
  'BDO TAGUIG - MCKINLEY  WEST',
  'BDO TAGUIG - MCKINLEY HILL',
  'BDO TAGUIG - ONE PARK DRIVE',
  'BDO TAGUIG - SM HYPERMARKET - FTI',
  'BDO TAGUIG - VISTA MALL',
  'BDO TAGUIG - WAREHOUSE',
  'BDO THREE E-COM CENTER',
  'BDO UPTOWN EASTGATE',
  'BDO V. A RUFINO - SOTTO',
  'BDO V. A RUFINO - TUSCAN',
  'BDO V. A RUFINO - VALERO',
  'BDO VALERO - SALCEDO VILLAGE',
  'BDO VILLAR - SALCEDO VILLAGE',
  'BDO WASHINGTON - GIL PUYAT',
  'BDO-ADRIATICO - STA MONICA',
  'BDO-BLUMENTRITT-LAONG LAAN',
  'BDO-CBG OFFICE',
  'BDO-COAST RESIDENCE R. BLVD',
  'BDO-DAPITAN ST-A.H. LACSON',
  'BDO-ESPANA',
  'BDO-ESPANA BASILIO',
  'BDO-ESPANA GRAND RESIDENCE',
  'BDO-ESPANA-BLUMENTRITT',
  'BDO-ESPANA-M. DELA FUENTE',
  'BDO-INTRAMUROS',
  'BDO-KAMAGONG',
  'BDO-LEON GUINTO SAN ANDRES',
  'BDO-LEON GUINTO-GEN.MALVAR',
  'BDO-LUNETA - TM KALAW',
  'BDO-MABINI-GEN.MALVAR',
  'BDO-MALATE-ADRIATICO',
  'BDO-MANILA OTIS',
  'BDO-OLD STA MESA ALBINA',
  'BDO-PABLO OCAMPO',
  'BDO-PACO',
  'BDO-PACO A. LINAO',
  'BDO-PACO WAREHOUSE PROPERTY',
  'BDO-PADRE FAURA MABINI',
  'BDO-PADRE FAURA MABINI BLDG',
  'BDO-PEDRO GIL MABINI',
  'BDO-PEDRO GIL-ADRIATICO',
  'BDO-PLAZA CALDERON - PEDRO GIL',
  'BDO-PORT AREA - SOUTH HARBOR',
  'BDO-QUIRINO PACO',
  'BDO-ROBINSONS PLACE MANILA',
  'BDO-ROXAS BLVD ADMIRAL',
  'BDO-ROXAS BLVD R SALAS',
  'BDO-SAN ANDRES',
  'BDO-STA MESA P. SANCHEZ',
  'BDO-STA MESA THE SILK RES',
  'BDO-STA MESA V. MAPA',
  'BDO-STA. ANA - XENTRO MALL',
  'BDO-TAFT ESTRADA',
  'BDO-TAFT J. NAKPIL',
  'BDO-TAFT PEDRO GIL PGH',
  'BDO-TAFT PRES. QUIRINO',
  'BDO-TAFT VITO CRUZ',
  'BDO-TAFT VITO CRUZ BLDG',
  'BDO-TAFT VITO CRUZ CASH HUB',
  'BDO-TM KALAW LUNETA BLDG',
  'BDO-UN AVE J. BOCOBO BLDG',
  'BDO-UN AVENUE',
  'BDO-UN AVENUE - J.BOCOBO',
  'BDO-UN AVENUE-TIMES PLAZA',
  'BOCU - Ayala Center Cebu',
  'Block Eighty Eight',
  'CASAMIA FURNITURE INC.',
  'CCF - EASTWOOD',
  'CCF - Mandaue',
  'CCF- IMUS',
  'CCF- ROBINSON MANILA',
  'CCF-BGC',
  'CCF-Glorieta',
  'CITI CENTER CONDO. CORPORATION-PASEO',
  'CITI TOWER CONDOMINIUM-VALERO',
  'CPU - Admin Back Porch',
  'CPU - Admin Entrance',
  'CPU - Butterfly Garden',
  'CPU - Senior High School',
  'Central Philippine University',
  'City Time Square Iloilo',
  'Colegio De Las Hijas De Jesus',
  'DC - SM North EDSA (Annex)',
  'DC - SM North Edsa (Tower)',
  'DR. PEK ENG LIM RESIDENCE',
  'Dyson - Manila',
  'Dyson - SM City Cebu',
  'Dyson - SM City Seaside',
  'Dyson Iloilo',
  'EREMEL FOOD INTERPRISES (Central Bloc)',
  'EREMEL FOODS INTERPRISE (Kasambagan Cebu City)',
  'EREMEL FOODS INTERPRISE (Park Mall)',
  'EREMEL FOODS INTERPRISE (Pueblo Verde)',
  'FAMILYHEALTH & BEAUTY CORP. -  AYALA MALL',
  'FAMILYHEALTH & BEAUTY CORP. -  GUAGUA',
  'FAMILYHEALTH & BEAUTY CORP. -  MAGALANG',
  'FAMILYHEALTH & BEAUTY CORP. -  PEDRO GIL',
  'FAMILYHEALTH & BEAUTY CORP. -  SAN ANDRES',
  'FAMILYHEALTH & BEAUTY CORP. - CM Parola',
  'FAMILYHEALTH & BEAUTY CORP. - City Mall Jaro',
  'FAMILYHEALTH & BEAUTY CORP. - Edsa Monumento',
  'FAMILYHEALTH & BEAUTY CORP. - GAISANO LA PAZ',
  'FAMILYHEALTH & BEAUTY CORP. - KINGSMEN KALIBO',
  'FAMILYHEALTH & BEAUTY CORP. - Mall 1',
  'FAMILYHEALTH & BEAUTY CORP. - Mall 2',
  'FAMILYHEALTH & BEAUTY CORP. - O-Town Square',
  'FAMILYHEALTH & BEAUTY CORP. - PUREGOLD JARO',
  'FAMILYHEALTH & BEAUTY CORP. - R SQUARE TAFT',
  'FAMILYHEALTH & BEAUTY CORP. - Rob. Iloilo',
  'FAMILYHEALTH & BEAUTY CORP. - Robinsons Place Manila',
  'FAMILYHEALTH & BEAUTY CORP. - SACRED HEARTILOILO',
  'FAMILYHEALTH & BEAUTY CORP. - San Jose Antique',
  'FAMILYHEALTH & BEAUTY CORP. - Tanjay Negros Oriental',
  'FAMILYHEALTH & BEAUTY CORP. - Yulo',
  'Fabtech International Corp',
  'Fabtech International Corp-Pasong Tamo',
  'Familyhealth - St. Pauls Hospital',
  'Familyhealth Buendia',
  'Familyhealth Green Mall',
  'Familyhealth LEU Bldg Dumaguete',
  'Far East Broadcasting Company Phils.',
  'Filamer Christian University',
  'For Me - Consolacion',
  'For Me - SM City Cebu',
  'G.T.G.F - MARIKINA',
  'G7 Heavylift & Logistics Corporation',
  'GTGF FOOD CORPORATION',
  'Global Pacific Distributor',
  'Gruppo Dolci Inc.',
  'HOMEBI TRADING INC.',
  'HYPERMARKET BICUTAN',
  'HYPERMARKET BUENDIA',
  'HYPERMARKET DECA MALL',
  'HYPERMARKET HEAD OFFICE',
  'HYPERMARKET ROSALES',
  'HYPERMARKET TVSA',
  'INDUSTRIAL & COMMERCIAL BANK OF CHINA',
  'Jollibest Fast Food Corp.-Delgado',
  'LCSN Express Movers Inc',
  'LCSN Express Movers Inc.',
  'LH PARAGON INC (IT Center)',
  'LH Paragon Inc. (Mactan Property)',
  'MADISON SHOPPING CENTER (SM STORE - PAMPANGA)',
  'MASTER SHOPPERS VENUE INC.',
  'MATIMCO INC.',
  'MEGA VALUE DRUG STORE III',
  'MEGAVALUE DRUGSTORE 1',
  'MINISO -  SM CITY SEASIDE',
  'MINISO - MABOLO',
  'MINISO - ROBINSON PLACE',
  'MINISO - SM CITY ILOILO',
  'MMSM Delgado (BTR)',
  'MR. & MRS. FONG RESIDENCE (Corinthian Garden)',
  'MULTI KITCHEN INC.',
  'MULTI STORE CORP. (JMall Mandaue)',
  'MULTI STORE CORP. (Mabolo)',
  'MY SHOPPINGLANE CEBU CORP. (Consolacion)',
  'MY SHOPPINGLANE CEBU CORP. (Seaside)',
  'Manduriao Star Inc.',
  'Manduriao Star Inc. (BTR)',
  'Metro Manila Shopping Mecca, Corp.',
  'Metro Parking Management (Philippines) Inc. Tower 2',
  'Metro Parking Management (Philippines) Inc. Tower 3',
  'Miniso Pink- SM City JMall',
  'Miniso- Telabastagan',
  'NTT Limited Philippines Branch',
  'Oakridge - Benevola',
  'Oakridge - Prime',
  'Oakridge Business Park',
  'Oakridge Business Park (Mantle Wood Town Phase 1)',
  'Oakridge Business Park (OITC 2)',
  'Oakridge Business Park (OITC 3)',
  'Oakridge Business Park (Oak Tree Drive 2)',
  'Oakridge Business Park (Parking System & Under Chassis Inspection)',
  'Oakridge Business Park (Warehouse Supply-Mandaue 1)',
  'Our Home (Warehouse)',
  'Our Home - SM City Iloilo',
  'Oxygen - Ayala Center',
  'Oxygen - Consolacion',
  'Oxygen - SM Mabolo',
  'PENSHOPPE (Robinson Cebu)',
  'PENSHOPPE (SM City Cebu NRA)',
  'PENSHOPPE (SM Seaside)',
  'PENSHOPPE - Ayala',
  'PHARMA GENERICS INC.',
  'Penshoppe - ALI MALL',
  'Penshoppe - Ayala Mall Central Bloc',
  'Penshoppe - Mall of Asia',
  'Penshoppe - Perdice, Dumaguete',
  'Penshoppe - ROBINSON ERMITA',
  'Penshoppe - SM Bacolod',
  'Penshoppe - SM City Iloilo',
  'Penshoppe - SM City Pampanga',
  'Penshoppe - SM MEGAMALL',
  'Penshoppe - SM NORTH EDSA',
  'Penshoppe - TRINOMA',
  'Pet Express (Molino)',
  'Pet Express - Grand Central',
  'Pet Express - JMall',
  'Puma - SM City Cebu',
  'Puma - SM Seaside City Cebu',
  'QUEEN CITY DEVELOPMENT BANK',
  'Reebok - SM City Cebu',
  'Reebok - SM Seaside City Cebu',
  'Robinsons Cybergate Center Plaza',
  'Robinsons Cybergate Center Tower 1',
  'Robinsons Cybergate Center Tower 2',
  'Robinsons Cybergate Center Tower 3',
  'SAMGYUPSALAMAT',
  'SAMGYUPSALAMAT (Incheon Food) - Ayala Mall',
  'SAMGYUPSALAMAT (Incheon Food) - SM City Cebu',
  'SAMGYUPSALAMAT (Incheon Food) - SM Seaside',
  'SAVEMORE AMIGO (New Manela)',
  'SAVEMORE APALIT (New Manela)',
  'SAVEMORE EB Town Center',
  'SAVEMORE MALHACAN  (New Manela)',
  'SAVEMORE MEGA CENTER (New Manela)',
  'SAVEMORE SAN SIMON PAMPANGA',
  'SAVEMORE TELABASTAGAN ESSEL (New Site)',
  'SAVEMORE-MUZON',
  'SHINHAN BANK',
  'SHOEPLIER INC.. (Warehouse)',
  'SM CITY URDANETA',
  'SM CITY URDANETA - CINEMA',
  'SM CITY URDANETA - FOOD COURT',
  'SM City Urdaneta ( Det. Commander)',
  'SM Iloilo Terminal Market - Traffic/Perimeter',
  'SM Land, Inc. (Concourse  Area)',
  'SM Land, Inc. (EMB Area)',
  'SM PRIME HOLDINGS INC. (NORTH EDSA)',
  'SM PRIME HOLDINGS INC. (NORTH TOWER)',
  'SM Prime Holdings (Annex) - Late Payroll',
  'SM Pulilan - Carpark',
  'SM RETAIL HEADQUARTERS',
  'SM Store Molino - ADC',
  'SMCI - DC',
  'SMCI Cinema (SM City Iloilo)',
  'SMCI Food Court (SM City Iloilo)',
  'SMCI Mall Area (SM City Iloilo)',
  'SMCI Traffic Control (SM City Iloilo)',
  'SMCO ACACIA',
  'SMCO ANONAS',
  'SMCO BERKELEY',
  'SMCO BROADWAY',
  'SMCO CARTIMAR',
  'SMCO GREEN RESIDENCE',
  'SMCO HEAD OFFICE',
  'SMCO KAWIT',
  'SMCO MARCOS ALVAREZ LAS PINAS',
  'SMCO MERIDIAN',
  'SMCO MEZZA',
  'SMCO NAGTAHAN',
  'SMCO NOVALICHES 1',
  'SMCO PARKWAY PLACE (NAVARRO)',
  'SMCO SALAWAG',
  'SMCO SALITRAN',
  'SMCO STA. ANA',
  'SMCO VENTURA MALL',
  'SPORT CENTRAL - Grand Central',
  'SPORTS CENTRAL - SM City Pampanga',
  'STAR APPLIANCE (SM Molino)',
  'STAR APPLIANCE - SM City Pampanga',
  'STAR APPLIANCE CENTER INC. (JMall)',
  'STAR APPLIANCE CENTER INC. (NRA)',
  'STELLAR BUILDERS',
  'SUPER SHOPPING MARKET INC. (A.S Fortuna)',
  'SUPER SHOPPING MARKET INC. (Handumanan)',
  'SUPER SHOPPING MARKET INC. (Jaro)',
  'SUPER SHOPPING MARKET INC. (Lapu-Lapu)',
  'SUPER SHOPPING MARKET INC. (Subangdako)',
  'SUPER SHOPPING MARKET INC. - TERMINAL',
  'SUPER VALUE INC. (Mabolo)',
  'SUPER VALUE INC. (SM Seaside)',
  'SUPERSHOPPING MARKET INC. (Kadiwa)',
  'SUPERSHOPPING MARKET INC. (Molino Bacoor)',
  'SUPERSHOPPING MARKET INC. (Tagaytay)',
  'SURPLUS SHOP (Molino)',
  'SURPLUS SHOP - Grand Central',
  'SURPLUS SHOP - SM City Pampanga',
  'SVI AURA',
  'SVI HEAD OFFICE',
  'SVI MAKATI',
  'SVI ROSARIO',
  'SVI SAN PABLO',
  'SVI SM CITY MANILA',
  'SVI SM STO TOMAS BATANGAS',
  'SVI SOUTH MALL',
  'SVI STA MESA',
  'SVI TRECE',
  'SVI-MEGAMALL B.',
  'SVI-MEXICO PAMPANGA (New Manela)',
  'SVI-SAN FERNANDO',
  'SVI-SAN JOSE DELMONTE BULACAN (Manela)',
  'SVI-TELABASTAGAN',
  'Savemore - Bacolod',
  'Savemore - Barotac',
  'Savemore - Calinog',
  'Savemore - City Mall Victorias',
  'Savemore - Danao',
  'Savemore - Dumaguete',
  'Savemore - East',
  'Savemore - Festivewalk',
  'Savemore - Fortune Town',
  'Savemore - GT MAll',
  'Savemore - Jaro 1',
  'Savemore - Jaro 2',
  'Savemore - Kabangkalan',
  'Savemore - Maribago',
  'Savemore - Pajac',
  'Savemore - Passi',
  'Savemore - San Carlos',
  'Savemore - Sta. Barbara',
  'Savemore - Strata',
  'Savemore - Warehouse Cab. (New Manela)',
  'Savemore -Warehouse Calinog',
  'Sports Central - Deparo',
  'Sports Central - Mandurriao - Levi\'s',
  'Star Appliance - Deparo',
  'Star Appliance - Telabastagan',
  'Star Appliance - Warehouse',
  'Star Appliance Center - SM City Iloilo',
  'Star Appliance Center - SM Delgado',
  'Style Residences',
  'Supervalue Inc - Bacolod',
  'Supervalue Inc - Calajunan Iloilo',
  'Supervalue Inc - Manduariao',
  'Supervalue Inc - Roxas Capiz',
  'Supervalue Inc - SM Delgado',
  'Supervalue Inc - Warehouse Iloilo',
  'Surplus Shop - SM City Delgado',
  'Surplus Shop - SM City Diversion Rd.',
  'Surplus Shop - Telabastagan',
  'THE SM STORE - CALOOCAN DEPARO',
  'THE SM STORE - GRAND CENTRAL',
  'THE SM STORE - MOLINO',
  'THE SM STORE - TELABASTAGAN',
  'THE SM STORE - VALENZUELA',
  'THE WOW GROUP  (Mandaue City)',
  'Toy Kingdom - SM City Mandurriao',
  'UPTREND DESIGNED CORP. (Consolacion)',
  'UPTREND FASHION DESIGNED CORP. (Mabolo)',
  'UPTREND FASHION DESIGNED CORP. (Park Mall)',
  'Under Armour SM City Cebu NRA Cebu City',
  'Uniqlo - Dumaguete',
  'Uniqlo - SM City Cebu',
  'Uniqlo - SM City Iloilo',
  'Uptrend Fashion - SM Seaside City Cebu',
  'WATSON -  WAREHOUSE 2',
  'WATSON -  WAREHOUSE BINAN LAGUNA',
  'WATSON - Blumentritt',
  'WATSON - Grand Central',
  'WATSON - HEAD OFFICE',
  'WATSON - Molino',
  'WATSON - Vista Mall',
  'WATSONS- RFC Mall',
  'WOW GROUP (Balintwak-AVSC)',
  'WOW GROUP (Balintwak-IAJ)',
  'WOW GROUP (Balintwak-SAR)',
  'Watson - Lucky China Town',
  'Watson - Vicas',
  'Watson Beauty - Plaza Kalibo',
  'Watson Beauty - SM City Diversion - Mall 1',
  'Watson Drug - SM City Diversion - Mall 3',
  'Watsons - Gamboa',
  'Watsons - Osmena Kalibo',
  'Watsons - Puregold Binan',
  'Watsons Anglo Taft',
  'Watsons Caticlan',
  'Watsons Deparo',
  'Watsons Guihulngan',
  'Watsons Janiuay',
  'Watsons Paco Mall',
  'Watsons Rizal Blvd Dumaguete',
  'Watsons Southport Builders Bldg',
  'Watsons Tayuman',
  'Watsons. - Guimaras',
  'Winebest Marketing Corp.',
  'Wow Group (EDSA - BCI)',
  'Wow Group (Malabon AVSC)',
  'Wow Group (Malabon-BCI)',
  'Wow Group (Malabon-IAJ)',
  'Wow Group (Malabon-MEVC)',
];
const IP_PAYROLL_FIELDS = [
  'My salary was paid regularly and on time',
  'Overtime/holiday pay was accurate',
  'I did not experience salary delays during my employment',
  'My take-home pay during my first months was lower than I expected',
  'Deductions during the first months affected my ability to cover daily expenses',
  'The deductions were manageable for me financially',
  'I experienced financial difficulty while deductions were ongoing',
  'I needed to borrow money or take loans during this period',
];
const IP_UNDERSTANDING_FIELDS = [
  'I clearly understood how my salary and deductions were computed',
  'Deductions for uniform, training, or paraphernalia were explained before deployment',
  'I sometimes found my pay slip difficult to understand',
];
const IP_EXPECTATIONS_FIELDS = [
  'My take-home pay matched what I expected when I applied',
  'My take-home pay was lower than what I expected',
  'I did not fully understand how deductions would affect my salary',
];
const MAIN_FACTOR_OPTIONS = EXIT_REASON_CATEGORIES.map(c => c.label);
const FREQ_LABELS = ['Never','Sometimes','Often','Very Often'];

function blankRecord(id) {
  const r = { _id: id };
  // Guard Info (updated to match original form)
  r.fullName = ''; r.age = ''; r.maritalStatus = ''; r.educationalAttainment = ''; r.courseIfApplicable = '';
  r.livingWithFamily = ''; r.familyLocation = ''; r.whereHeardAboutJob = '';
  r.numPreviousJobs = ''; r.typePreviousJob = '';
  r.rankPosition = ''; r.detachment = '';
  r.lengthOfService = ''; r.typeOfExit = ''; r.dateOfExit = '';
  // Income & Payroll (Yes/No checks)
  [...IP_PAYROLL_FIELDS, ...IP_UNDERSTANDING_FIELDS, ...IP_EXPECTATIONS_FIELDS].forEach(f => r[`ip_${key(f)}`] = null);
  r.ip_comment = '';
  // Exit Reasons (boolean checkboxes — derived from EXIT_REASON_CATEGORIES)
  EXIT_REASON_FIELDS.forEach(f => r[`er_${key(f)}`] = null);
  // Op Stressors (0-3 freq)
  OP_STRESSOR_FIELDS.forEach(f => r[`os_${key(f)}`] = null);
  // Supervision flags (yes/no)
  SUPERVISION_FLAGS.forEach(f => r[`sv_${key(f)}`] = null);
  r.safeToSpeak = '';
  r.unsafeToSpeakDescription = '';
  // Complaint flags
  COMPLAINT_FLAGS.forEach(f => r[`cp_${key(f)}`] = null);
  // Exit Summary
  r.mainExitFactor = ''; r.secondaryFactor = ''; r.breakingPoint = ''; r.wouldRecommend = '';
  r.er_other_explain = '';
  r.er_biggest_impact = '';
  r.breakingPointOccurred = null;
  BREAKING_POINT_CONTEXT.forEach(f => r[`bpc_${key(f)}`] = null);
  // Stay Factors
  STAY_FACTOR_FIELDS.forEach(f => r[`sf_${key(f)}`] = null);
  r.otherSuggestions = '';
  // Trust Index (1-5)
  TRUST_FIELDS.forEach(f => r[`ti_${key(f)}`] = null);
  return r;
}

function key(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── STATE ──────────────────────────────────────────────────────────
let records = [];
let activeRecordIdx = 0;
let activeSectionId = 'guard-info';
let currentView = 'form'; // 'form' | 'summary' | 'table'
let stickyNameCol = true;
// Mobile panel state
// ─── SPLASH ──────────────────────────────────────────────────────────
// Set company theme + name on splash immediately (before DOMContentLoaded delay)
;(function() {
  const co = localStorage.getItem('exit_interview_active_company') || 'manela';
  document.body.setAttribute('data-company', co);
  const names = { manela: 'New Manela', moriah: 'New Moriah' };
  const el = document.getElementById('splash-company-name');
  if (el) el.textContent = names[co] || 'New Manela';
})();

let mobilePanelState = 'records'; // 'records' | 'sections' | 'form'
let tableSort = { field: null, dir: 'asc' }; // null field = sort by original ID
let tableSearch = '';
let tablePeriod = {
  type: 'all',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  quarter: Math.ceil((new Date().getMonth() + 1) / 3),
  detachment: '',
  dateFrom: '',
  dateTo: '',
};
let summaryPeriod = {
  type: 'all', // 'all' | 'monthly' | 'quarterly' | 'annual'
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  quarter: Math.ceil((new Date().getMonth() + 1) / 3),
  detachment: '',
  dateFrom: '',
  dateTo: '',
};

// ─── INIT ────────────────────────────────────────────────────────────
function init() {
  loadFromStorage();
  buildSectionNav();
  renderAll();

  // Dismiss splash after brief reveal
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('splash-hiding');
      setTimeout(() => splash.classList.add('splash-gone'), 580);
    }, 1600);
  }

  document.getElementById('btn-new-record').addEventListener('click', addRecord);
  document.getElementById('btn-form-view').addEventListener('click', () => switchView('form'));
  document.getElementById('btn-summary-view').addEventListener('click', () => switchView('summary'));
  document.getElementById('btn-table-view').addEventListener('click', () => switchView('table'));
  document.getElementById('btn-export-csv').addEventListener('click', exportXLSX);
  document.getElementById('btn-company-manela').addEventListener('click', () => switchCompany('manela'));
  document.getElementById('btn-company-moriah').addEventListener('click', () => switchCompany('moriah'));

  // Set initial active state on company tabs
  document.getElementById('btn-company-manela').classList.toggle('active-company', currentCompany === 'manela');
  document.getElementById('btn-company-moriah').classList.toggle('active-company', currentCompany === 'moriah');

  // Apply company theme
  document.body.dataset.company = currentCompany;

  // Mobile bottom nav
  document.getElementById('mobile-nav-form').addEventListener('click', () => switchView('form'));
  document.getElementById('mobile-nav-summary').addEventListener('click', () => switchView('summary'));
  document.getElementById('mobile-nav-table').addEventListener('click', () => switchView('table'));
  document.getElementById('mobile-nav-export').addEventListener('click', exportXLSX);

  // Mobile back button
  document.getElementById('mobile-back-btn').addEventListener('click', () => {
    if (mobilePanelState === 'form') setMobilePanel('sections');
    else if (mobilePanelState === 'sections') setMobilePanel('records');
  });

  // Init mobile breadcrumb
  updateMobileBreadcrumb();

  // Dynamic header height (updates --header-h CSS variable)
  updateHeaderHeight();
  window.addEventListener('resize', updateHeaderHeight);
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (raw) {
      records = JSON.parse(raw);
      if (!records.length) records = [blankRecord(0)];
    } else {
      records = [blankRecord(0)];
    }
  } catch {
    records = [blankRecord(0)];
  }
}

function saveToLocalStorage() {
  localStorage.setItem(getStorageKey(), JSON.stringify(records));
  updateHeaderSubtitle();
}

// ─── HEADER HEIGHT (dynamic, for CSS variable) ────────────────────────
function updateHeaderHeight() {
  const h = document.getElementById('app-header').offsetHeight;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}

// ─── MOBILE PANEL NAVIGATION ─────────────────────────────────────────
function isMobile() { return window.innerWidth < 768; }

function setMobilePanel(panel) {
  mobilePanelState = panel;
  const container = document.getElementById('panel-container');
  if (!container) return;
  container.classList.remove('mp-sections', 'mp-form');
  if (panel === 'sections') container.classList.add('mp-sections');
  if (panel === 'form') container.classList.add('mp-form');
  updateMobileBreadcrumb();
}

function updateMobileBreadcrumb() {
  const backBtn = document.getElementById('mobile-back-btn');
  const breadcrumb = document.getElementById('mobile-breadcrumb');
  const backLabel = document.getElementById('mobile-back-label');
  if (!backBtn || !breadcrumb) return;

  if (mobilePanelState === 'records') {
    backBtn.style.visibility = 'hidden';
    breadcrumb.textContent = 'Records';
  } else if (mobilePanelState === 'sections') {
    backBtn.style.visibility = 'visible';
    if (backLabel) backLabel.textContent = 'Records';
    const r = records[activeRecordIdx];
    const name = (r?.fullName?.trim()) ? r.fullName.trim() : `Record #${String(activeRecordIdx + 1).padStart(4, '0')}`;
    breadcrumb.textContent = name;
  } else if (mobilePanelState === 'form') {
    backBtn.style.visibility = 'visible';
    if (backLabel) backLabel.textContent = 'Sections';
    const sec = SECTIONS.find(s => s.id === activeSectionId);
    breadcrumb.textContent = sec ? sec.label : '';
  }
}

function updateMobileBottomNav(view) {
  ['form', 'summary', 'table', 'export'].forEach(v => {
    const btn = document.getElementById(`mobile-nav-${v}`);
    if (btn) btn.classList.toggle('active-mobile-nav', v === view);
  });
}

// ─── VIEW SWITCH ─────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.getElementById('form-view').classList.toggle('hidden', view !== 'form');
  document.getElementById('summary-view').classList.toggle('hidden', view !== 'summary');
  document.getElementById('table-view').classList.toggle('hidden', view !== 'table');
  document.getElementById('btn-form-view').classList.toggle('active-tab', view === 'form');
  document.getElementById('btn-summary-view').classList.toggle('active-tab', view === 'summary');
  document.getElementById('btn-table-view').classList.toggle('active-tab', view === 'table');
  updateMobileBottomNav(view);
  if (view === 'summary') renderSummary();
  if (view === 'table') renderTable();
}

// ─── RENDER ALL ──────────────────────────────────────────────────────
function renderAll() {
  renderRecordList();
  renderFormSection();
  updateHeaderSubtitle();
  updateMobileBreadcrumb();
}

function updateHeaderSubtitle() {
  const completed = records.filter(r => r.fullName && r.fullName.trim()).length;
  const companyName = COMPANIES[currentCompany].name;
  document.getElementById('header-subtitle').textContent =
    `${companyName}  ·  ${completed} completed · ${records.length} total`;
}

// ─── COMPANY SWITCH ──────────────────────────────────────────────────
function switchCompany(id) {
  if (currentCompany === id) return;

  const COMPANY_ORDER = ['manela', 'moriah'];
  const goingRight = COMPANY_ORDER.indexOf(id) > COMPANY_ORDER.indexOf(currentCompany);
  const slideIn  = goingRight ? '100%'  : '-100%';
  const slideOut = goingRight ? '-100%' : '100%';
  const bgColor     = id === 'moriah' ? '#2e1065' : '#1e3a8a';
  const accentColor = id === 'moriah' ? '#a78bfa' : '#60a5fa';
  const companyName = COMPANIES[id].name;

  // Build full-screen slide overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:${bgColor};
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    transform:translateX(${slideIn});
    transition:transform 0.38s cubic-bezier(0.4,0,0.2,1);
  `;
  overlay.innerHTML = `
    <div id="_co_inner" style="
      display:flex;flex-direction:column;align-items:center;gap:14px;
      opacity:0;transform:scale(0.88);
      transition:opacity 0.28s ease 0.12s, transform 0.28s ease 0.12s;
    ">
      <span class="material-icons" style="font-size:56px;color:${accentColor};">shield</span>
      <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:0.01em;">${escHtml(companyName)}</div>
      <div style="width:52px;height:3px;background:${accentColor};border-radius:2px;opacity:0.55;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Slide in, then fade in inner content
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.transform = 'translateX(0)';
    setTimeout(() => {
      const inner = overlay.querySelector('#_co_inner');
      inner.style.opacity = '1';
      inner.style.transform = 'scale(1)';
    }, 100);
  }));

  // While overlay covers screen — swap all data & theme
  setTimeout(() => {
    currentCompany = id;
    localStorage.setItem('exit_interview_active_company', id);
    activeRecordIdx = 0;
    activeSectionId = 'guard-info';
    loadFromStorage();
    buildSectionNav();
    renderAll();
    if (currentView === 'summary') renderSummary();
    if (currentView === 'table') renderTable();
    document.getElementById('btn-company-manela').classList.toggle('active-company', id === 'manela');
    document.getElementById('btn-company-moriah').classList.toggle('active-company', id === 'moriah');
    document.body.dataset.company = id;
    updateHeaderSubtitle();
    updateHeaderHeight();

    // Brief hold, then slide out in the opposite direction
    setTimeout(() => {
      overlay.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1)';
      overlay.style.transform = `translateX(${slideOut})`;
      setTimeout(() => overlay.remove(), 420);
    }, 420);
  }, 400);
}

// ─── RECORD LIST ─────────────────────────────────────────────────────
function renderRecordList() {
  const list = document.getElementById('record-list');
  list.innerHTML = '';
  records.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'record-item' + (i === activeRecordIdx ? ' active' : '');
    const displayName = (r.fullName && r.fullName.trim()) ? r.fullName.trim() : `Record #${String(i + 1).padStart(4,'0')}`;
    const detStr = r.detachment ? r.detachment : (r.typeOfExit ? r.typeOfExit : '—');
    div.innerHTML = `
      <div class="record-info">
        <div class="record-name">${escHtml(displayName)}</div>
        <div class="record-meta">${escHtml(detStr)}</div>
      </div>
      <span class="record-id-badge">${String(i + 1).padStart(4,'0')}</span>
      ${records.length > 1 ? `<button class="btn-delete-record" data-idx="${i}" title="Delete record"><span class="material-icons">close</span></button>` : ''}
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-record')) return;
      activeRecordIdx = i;
      activeSectionId = 'guard-info';
      renderAll();
      if (isMobile()) setMobilePanel('sections');
    });
    list.appendChild(div);
  });

  // Delete buttons
  list.querySelectorAll('.btn-delete-record').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      confirmDelete(idx);
    });
  });
}

function confirmDelete(idx) {
  const r = records[idx];
  const name = (r.fullName && r.fullName.trim()) ? r.fullName.trim() : `Record #${String(idx + 1).padStart(4,'0')}`;
  showModal(
    'Delete Record?',
    `Are you sure you want to delete "${escHtml(name)}"? This cannot be undone.`,
    () => {
      records.splice(idx, 1);
      if (activeRecordIdx >= records.length) activeRecordIdx = records.length - 1;
      saveToLocalStorage();
      renderAll();
      if (currentView === 'table') renderTable();
    }
  );
}

function addRecord() {
  records.push(blankRecord(records.length));
  activeRecordIdx = records.length - 1;
  activeSectionId = 'guard-info';
  saveToLocalStorage();
  renderAll();
}

// ─── SECTION NAV ─────────────────────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  nav.innerHTML = '';
  SECTIONS.forEach(sec => {
    const div = document.createElement('div');
    div.className = 'section-nav-item' + (sec.id === activeSectionId ? ' active' : '');
    div.dataset.sectionId = sec.id;
    div.innerHTML = `<span class="material-icons">${sec.icon}</span>${escHtml(sec.label)}`;
    div.addEventListener('click', () => {
      activeSectionId = sec.id;
      document.querySelectorAll('.section-nav-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      renderFormSection();
      if (isMobile()) setMobilePanel('form');
    });
    nav.appendChild(div);
  });
}

function updateSectionNavActive() {
  document.querySelectorAll('.section-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sectionId === activeSectionId);
  });
}

// ─── FORM SECTION RENDERER ───────────────────────────────────────────
function renderFormSection() {
  updateSectionNavActive();
  const container = document.getElementById('form-content');
  container.innerHTML = '';
  const r = records[activeRecordIdx];
  if (!r) return;

  switch (activeSectionId) {
    case 'guard-info':      renderGuardInfo(container, r); break;
    case 'income-payroll':  renderIncomePayroll(container, r); break;
    case 'exit-reasons':    renderExitReasons(container, r); break;
    case 'op-stressors':    renderOpStressors(container, r); break;
    case 'supervision':     renderSupervision(container, r); break;
    case 'complaints':      renderComplaints(container, r); break;
    case 'exit-summary':    renderExitSummary(container, r); break;
    case 'stay-factors':    renderStayFactors(container, r); break;
    case 'trust-index':     renderTrustIndex(container, r); break;
  }
}

// ─── SECTION 1: GUARD INFO ───────────────────────────────────────────
function renderGuardInfo(container, r) {
  const card = makeCard('Guard Info', 'badge', 'Basic personal details, employment history, and exit information');
  const body = card.querySelector('.form-card-body');

  const grid = makeGrid2();
  grid.appendChild(makeTextField('Full Name', 'fullName', r.fullName, 'text', 'e.g. Juan dela Cruz'));
  grid.appendChild(makeTextField('Age', 'age', r.age, 'number', ''));
  grid.appendChild(makeSelectField('Marital Status', 'maritalStatus', r.maritalStatus, MARITAL_STATUS_OPTIONS));
  grid.appendChild(makeSelectField('Educational Attainment', 'educationalAttainment', r.educationalAttainment, EDUCATIONAL_ATTAINMENT_OPTIONS));
  grid.appendChild(makeTextField('Course (if applicable)', 'courseIfApplicable', r.courseIfApplicable, 'text', 'e.g. Criminology'));
  grid.appendChild(makeSelectField('Living with Family?', 'livingWithFamily', r.livingWithFamily, ['','Yes','No']));
  grid.appendChild(makeSelectField('Where is Family Based?', 'familyLocation', r.familyLocation, FAMILY_LOCATION_OPTIONS));
  grid.appendChild(makeSelectField('Where did you hear about this job?', 'whereHeardAboutJob', r.whereHeardAboutJob, WHERE_HEARD_OPTIONS));
  grid.appendChild(makeTextField('Number of Previous Jobs', 'numPreviousJobs', r.numPreviousJobs, 'number', ''));
  grid.appendChild(makeTextField('Type(s) of Previous Job / Roles', 'typePreviousJob', r.typePreviousJob, 'text', 'e.g. Security Guard, Driver'));
  grid.appendChild(makeTextField('Rank / Position', 'rankPosition', r.rankPosition, 'text', 'e.g. Security Guard I'));
  grid.appendChild(makeSelectField('Current Post / Detachment', 'detachment', r.detachment, DETACHMENT_OPTIONS));
  grid.appendChild(makeSelectField('Length of Service', 'lengthOfService', r.lengthOfService, LENGTH_OF_SERVICE_OPTIONS));
  grid.appendChild(makeSelectField('Type of Exit', 'typeOfExit', r.typeOfExit, ['', ...EXIT_TYPE_OPTIONS]));
  grid.appendChild(makeDateField('Date of Exit', 'dateOfExit', r.dateOfExit));

  body.appendChild(grid);
  container.appendChild(card);
  wireTextInputs(container, r);
  wireSelects(container, r);
}

// ─── SECTION 2: INCOME & PAYROLL ─────────────────────────────────────
function renderIncomePayroll(container, r) {
  const card = makeCard('Income & Payroll', 'payments', 'Guard\'s experience with salary, deductions, and financial expectations during service');
  const body = card.querySelector('.form-card-body');

  // Payroll Reliability
  const h1 = document.createElement('div');
  h1.className = 'form-group-heading';
  h1.innerHTML = '<span class="material-icons">receipt_long</span> Payroll Reliability <span style="color:#94a3b8;font-size:12px;font-weight:400;">— Check all that apply</span>';
  body.appendChild(h1);
  body.appendChild(makeNoteBar('info', 'Mark Yes = experienced this  |  No = did not experience  |  Leave blank if unsure'));
  IP_PAYROLL_FIELDS.forEach(label => {
    body.appendChild(makeYNRow(label, `ip_${key(label)}`, r[`ip_${key(label)}`]));
  });

  // Salary Understanding
  const h2 = document.createElement('div');
  h2.className = 'form-group-heading';
  h2.innerHTML = '<span class="material-icons">calculate</span> Understanding of Salary Breakdown';
  body.appendChild(h2);
  IP_UNDERSTANDING_FIELDS.forEach(label => {
    body.appendChild(makeYNRow(label, `ip_${key(label)}`, r[`ip_${key(label)}`]));
  });

  // Expectations vs Reality
  const h3 = document.createElement('div');
  h3.className = 'form-group-heading';
  h3.innerHTML = '<span class="material-icons">compare_arrows</span> Expectations vs Reality';
  body.appendChild(h3);
  IP_EXPECTATIONS_FIELDS.forEach(label => {
    body.appendChild(makeYNRow(label, `ip_${key(label)}`, r[`ip_${key(label)}`]));
  });

  // Comment
  const h4 = document.createElement('div');
  h4.className = 'form-group-heading';
  h4.innerHTML = '<span class="material-icons">comment</span> Other Comment';
  body.appendChild(h4);
  const taWrap = document.createElement('div');
  taWrap.className = 'form-group';
  const ta = document.createElement('textarea');
  ta.className = 'field-textarea';
  ta.rows = 3;
  ta.placeholder = 'Any other comments about pay, deductions, or financial experience...';
  ta.value = r.ip_comment || '';
  ta.addEventListener('input', () => { r.ip_comment = ta.value; saveToLocalStorage(); });
  taWrap.appendChild(ta);
  body.appendChild(taWrap);

  container.appendChild(card);
  wireYNButtons(container, r);
}

// ─── SECTION 3: EXIT REASONS (categorized checkboxes) ────────────────
function renderExitReasons(container, r) {
  const card = makeCard('Reasons for Exit', 'logout', 'All factors that contributed to the guard\'s decision to leave — check everything that applies');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', 'Check all that apply. At the bottom, select the ONE factor that had the biggest impact.'));

  EXIT_REASON_CATEGORIES.forEach(cat => {
    const h = document.createElement('div');
    h.className = 'form-group-heading';
    h.innerHTML = `<span class="material-icons">${cat.icon}</span> ${escHtml(cat.label)}`;
    body.appendChild(h);
    cat.items.forEach(label => {
      body.appendChild(makeYNRow(label, `er_${key(label)}`, r[`er_${key(label)}`]));
    });
  });

  // Other
  const otherH = document.createElement('div');
  otherH.className = 'form-group-heading';
  otherH.innerHTML = '<span class="material-icons">edit_note</span> Other';
  body.appendChild(otherH);
  const otherWrap = document.createElement('div');
  otherWrap.className = 'form-group';
  const otherTa = document.createElement('textarea');
  otherTa.className = 'form-textarea';
  otherTa.rows = 2;
  otherTa.placeholder = 'Other reason (please explain)...';
  otherTa.value = r.er_other_explain || '';
  otherTa.addEventListener('input', () => { r.er_other_explain = otherTa.value; saveToLocalStorage(); });
  otherWrap.appendChild(otherTa);
  body.appendChild(otherWrap);

  // Biggest impact
  const bigH = document.createElement('div');
  bigH.className = 'form-group-heading';
  bigH.innerHTML = '<span class="material-icons">flag</span> Which ONE had the biggest impact on your decision to leave?';
  body.appendChild(bigH);
  body.appendChild(makeSelectField('Biggest Impact Category', 'er_biggest_impact', r.er_biggest_impact, ['', ...MAIN_FACTOR_OPTIONS]));

  container.appendChild(card);
  wireYNButtons(container, r);
  wireSelects(container, r);
}

// ─── SECTION 3: OP STRESSORS ─────────────────────────────────────────
function renderOpStressors(container, r) {
  const card = makeCard('Operational Stressors', 'warning_amber', 'How often the guard experienced workload and scheduling pressures in their last 3 months');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('warning', '0 = Never  |  1 = Sometimes  |  2 = Often  |  3 = Very Often'));

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    body.appendChild(makeFreqRow(label, fk, r[fk]));
  });
  container.appendChild(card);
  wireScaleButtons(container, r);
}

// ─── SECTION 4: SUPERVISION ───────────────────────────────────────────
function renderSupervision(container, r) {
  const card = makeCard('Supervision & Power', 'manage_accounts', 'Supervisory conduct experienced during service and guard\'s psychological safety level');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', 'Mark Yes / No for each item'));

  SUPERVISION_FLAGS.forEach(label => {
    const fk = `sv_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });

  // Psychological Safety
  const psH = document.createElement('div');
  psH.className = 'form-group-heading';
  psH.innerHTML = '<span class="material-icons">psychology</span> Psychological Safety';
  body.appendChild(psH);
  body.appendChild(makeNoteBar('info', 'How safe did you feel expressing your concerns, opinions, or suggestions at work?'));
  body.appendChild(makeSelectField('Safety Level', 'safeToSpeak', r.safeToSpeak,
    ['', 'Very safe', 'Somewhat safe', 'Not safe', 'I avoided speaking up']));

  // Unsafe situation description
  const unsafeH = document.createElement('div');
  unsafeH.className = 'form-group-heading';
  unsafeH.innerHTML = '<span class="material-icons">report</span> If you ever felt unsafe speaking up, please describe the situation:';
  body.appendChild(unsafeH);
  const unsafeWrap = document.createElement('div');
  unsafeWrap.className = 'form-group';
  const unsafeTa = document.createElement('textarea');
  unsafeTa.className = 'form-textarea';
  unsafeTa.rows = 3;
  unsafeTa.placeholder = 'Describe the situation where you felt unsafe speaking up...';
  unsafeTa.value = r.unsafeToSpeakDescription || '';
  unsafeTa.addEventListener('input', () => { r.unsafeToSpeakDescription = unsafeTa.value; saveToLocalStorage(); });
  unsafeWrap.appendChild(unsafeTa);
  body.appendChild(unsafeWrap);

  container.appendChild(card);
  wireYNButtons(container, r);
  wireSelects(container, r);
}

// ─── SECTION 5: COMPLAINTS ────────────────────────────────────────────
function renderComplaints(container, r) {
  const card = makeCard('Complaint Handling', 'report_problem', 'How the agency handled client complaints or issues involving the guard');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', 'Mark Yes / No for each item'));

  COMPLAINT_FLAGS.forEach(label => {
    const fk = `cp_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });
  container.appendChild(card);
  wireYNButtons(container, r);
}

// ─── SECTION 7: EXIT SUMMARY (Breaking Point) ────────────────────────
function renderExitSummary(container, r) {
  const card = makeCard('The Breaking Point', 'exit_to_app', 'The specific moment or event, if any, that triggered the guard\'s final decision to leave');
  const body = card.querySelector('.form-card-body');

  // Yes/No gate
  body.appendChild(makeNoteBar('info', 'Was there a specific moment or event that made you decide you could no longer continue in this role?'));
  body.appendChild(makeYNRow('A breaking point event occurred', 'breakingPointOccurred', r.breakingPointOccurred));

  // Context checkboxes
  const ctxH = document.createElement('div');
  ctxH.className = 'form-group-heading';
  ctxH.innerHTML = '<span class="material-icons">checklist</span> If yes, you may consider (check all that are relevant):';
  body.appendChild(ctxH);
  BREAKING_POINT_CONTEXT.forEach(label => {
    body.appendChild(makeYNRow(label, `bpc_${key(label)}`, r[`bpc_${key(label)}`]));
  });

  // Description textarea
  const descH = document.createElement('div');
  descH.className = 'form-group-heading';
  descH.innerHTML = '<span class="material-icons">description</span> If yes, please describe what happened:';
  body.appendChild(descH);
  const taWrap = document.createElement('div');
  taWrap.className = 'form-group';
  const ta = document.createElement('textarea');
  ta.className = 'form-textarea';
  ta.rows = 4;
  ta.placeholder = 'Describe the specific moment or event that was the breaking point...';
  ta.value = r.breakingPoint || '';
  ta.addEventListener('input', () => { r.breakingPoint = ta.value; saveToLocalStorage(); });
  taWrap.appendChild(ta);
  body.appendChild(taWrap);

  // Would Recommend (kept for analytics)
  const addH = document.createElement('div');
  addH.className = 'form-group-heading';
  addH.innerHTML = '<span class="material-icons">thumb_up</span> Additional';
  body.appendChild(addH);
  const grid = makeGrid2();
  grid.appendChild(makeSelectField('Would Recommend Agency?', 'wouldRecommend', r.wouldRecommend, ['','Yes','Maybe','No']));
  body.appendChild(grid);

  container.appendChild(card);
  wireYNButtons(container, r);
  wireSelects(container, r);
}

// ─── SECTION 7: STAY FACTORS ─────────────────────────────────────────
function renderStayFactors(container, r) {
  const card = makeCard('Stay Factors', 'anchor', 'What the agency could realistically have done to make the guard stay longer');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('lightbulb', 'What could have made the guard stay?'));

  STAY_FACTOR_FIELDS.forEach(label => {
    const fk = `sf_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });

  const divider = document.createElement('div');
  divider.className = 'mt-4 pt-4 border-t border-slate-100';
  divider.appendChild(makeTextareaField('Other Suggestions', 'otherSuggestions', r.otherSuggestions, 'Any additional suggestions from the guard…'));
  body.appendChild(divider);

  container.appendChild(card);
  wireYNButtons(container, r);
  wireTextInputs(container, r);
}

// ─── SECTION 8: TRUST INDEX ───────────────────────────────────────────
function renderTrustIndex(container, r) {
  const card = makeCard('Trust Index', 'verified_user', 'Guard\'s overall sense of trust, respect, and belonging within the agency');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('star', '1 = Strongly Disagree  |  5 = Strongly Agree'));

  TRUST_FIELDS.forEach(label => {
    const fk = `ti_${key(label)}`;
    body.appendChild(makeScaleRow(label, fk, r[fk], [1,2,3,4,5], 'btn-trust'));
  });
  container.appendChild(card);
  wireScaleButtons(container, r);
}

// ─── FIELD BUILDERS ──────────────────────────────────────────────────
function makeCard(title, icon, subtitle) {
  const card = document.createElement('div');
  card.className = 'form-card';
  card.innerHTML = `
    <div class="form-section-title"><span class="material-icons">${icon}</span>${escHtml(title)}</div>
    ${subtitle ? `<div class="form-section-subtitle">${escHtml(subtitle)}</div>` : ''}
    <div class="form-card-body"></div>
  `;
  return card;
}

function makeGrid2() {
  const g = document.createElement('div');
  g.className = 'form-grid-2';
  return g;
}

function makeNoteBar(icon, text) {
  const div = document.createElement('div');
  div.className = 'note-bar';
  div.innerHTML = `<span class="material-icons">${icon}</span><span>${escHtml(text)}</span>`;
  return div;
}

function makeTextField(label, fieldKey, value, type = 'text', placeholder = '') {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <input type="${type}" class="field-input" data-field="${fieldKey}" value="${escHtml(value||'')}" placeholder="${escHtml(placeholder)}" />
  `;
  return div;
}

function makeDateField(label, fieldKey, value) {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <input type="date" class="field-input" data-field="${fieldKey}" value="${escHtml(value||'')}" />
  `;
  return div;
}

function makeSelectField(label, fieldKey, value, options) {
  const div = document.createElement('div');
  div.className = 'field-group';
  const opts = options.map(o => `<option value="${escHtml(o)}" ${o === value ? 'selected' : ''}>${escHtml(o||'— Select —')}</option>`).join('');
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <select class="field-select" data-field="${fieldKey}">${opts}</select>
  `;
  return div;
}

function makeTextareaField(label, fieldKey, value, placeholder = '') {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <textarea class="field-textarea" data-field="${fieldKey}" placeholder="${escHtml(placeholder)}">${escHtml(value||'')}</textarea>
  `;
  return div;
}

function makeScaleRow(label, fieldKey, currentVal, values, btnClass) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  const btns = values.map(v =>
    `<button class="${btnClass} ${currentVal === v ? 'active' : ''}" data-field="${fieldKey}" data-val="${v}">${v}</button>`
  ).join('');
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">${btns}</div>
  `;
  return row;
}

function makeFreqRow(label, fieldKey, currentVal) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  const btns = FREQ_LABELS.map((fl, i) =>
    `<button class="btn-freq ${currentVal === i ? 'active' : ''}" data-field="${fieldKey}" data-val="${i}">${escHtml(fl)}</button>`
  ).join('');
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">${btns}</div>
  `;
  return row;
}

function makeYNRow(label, fieldKey, currentVal) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">
      <button class="btn-yn yes ${currentVal === true ? 'active' : ''}" data-field="${fieldKey}" data-val="true">Yes</button>
      <button class="btn-yn no ${currentVal === false ? 'active' : ''}" data-field="${fieldKey}" data-val="false">No</button>
    </div>
  `;
  return row;
}

// ─── WIRE EVENTS ─────────────────────────────────────────────────────
function wireTextInputs(container, r) {
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach(el => {
    el.addEventListener('input', () => {
      r[el.dataset.field] = el.value;
      saveToLocalStorage();
      renderRecordList();
    });
  });
}

function wireSelects(container, r) {
  container.querySelectorAll('select[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      r[el.dataset.field] = el.value;
      saveToLocalStorage();
      renderRecordList();
    });
  });
}

function wireScaleButtons(container, r) {
  container.querySelectorAll('button[data-field][data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fk = btn.dataset.field;
      const val = parseFloat(btn.dataset.val);
      r[fk] = val;
      // Update active state among siblings
      const siblings = container.querySelectorAll(`button[data-field="${fk}"]`);
      siblings.forEach(s => s.classList.toggle('active', parseFloat(s.dataset.val) === val));
      saveToLocalStorage();
    });
  });
}

function wireYNButtons(container, r) {
  container.querySelectorAll('.btn-yn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fk = btn.dataset.field;
      const val = btn.dataset.val === 'true';
      r[fk] = val;
      const siblings = container.querySelectorAll(`button.btn-yn[data-field="${fk}"]`);
      siblings.forEach(s => {
        const sv = s.dataset.val === 'true';
        s.classList.toggle('active', sv === val);
      });
      saveToLocalStorage();
    });
  });
}

// ─── TABLE VIEW ──────────────────────────────────────────────────────

/*
  Column schema — each entry describes one column in the table.
  type: 'text' | 'number' | 'date' | 'select' | 'scale-er' | 'scale-ti' | 'freq' | 'yn' | 'textarea'
  field: key on the record object
  label: short column header
  width: px (used as min-width)
  options: for select type
*/
const TABLE_COLUMNS = [
  // ── Guard Info ───────────────────────────────────────────
  { group: 'Guard Info', field: 'fullName',            label: 'Full Name',           type: 'text',   width: 150 },
  { group: 'Guard Info', field: 'dateOfExit',          label: 'Exit Date',           type: 'date',   width: 110 },
  { group: 'Guard Info', field: 'typeOfExit',          label: 'Exit Type',           type: 'select', width: 100,
    options: ['', ...EXIT_TYPE_OPTIONS] },
  { group: 'Guard Info', field: 'detachment',          label: 'Detachment',          type: 'select', width: 200, options: DETACHMENT_OPTIONS },
  { group: 'Guard Info', field: 'rankPosition',        label: 'Rank/Position',       type: 'text',   width: 120 },
  { group: 'Guard Info', field: 'lengthOfService',     label: 'Tenure',              type: 'select', width: 120,
    options: LENGTH_OF_SERVICE_OPTIONS },
  { group: 'Guard Info', field: 'age',                 label: 'Age',                 type: 'number', width: 52  },
  { group: 'Guard Info', field: 'maritalStatus',       label: 'Marital Status',      type: 'select', width: 110,
    options: MARITAL_STATUS_OPTIONS },
  { group: 'Guard Info', field: 'educationalAttainment',label: 'Education',          type: 'select', width: 160, options: EDUCATIONAL_ATTAINMENT_OPTIONS },
  { group: 'Guard Info', field: 'courseIfApplicable',  label: 'Course',              type: 'text',   width: 110 },
  { group: 'Guard Info', field: 'livingWithFamily',    label: 'Lives w/ Family',     type: 'select', width: 80,
    options: ['','Yes','No'] },
  { group: 'Guard Info', field: 'familyLocation',      label: 'Family Location',     type: 'select', width: 130,
    options: FAMILY_LOCATION_OPTIONS },
  { group: 'Guard Info', field: 'whereHeardAboutJob',  label: 'How Recruited',       type: 'select', width: 130,
    options: WHERE_HEARD_OPTIONS },
  { group: 'Guard Info', field: 'numPreviousJobs',     label: 'Prev Jobs #',         type: 'number', width: 52  },
  { group: 'Guard Info', field: 'typePreviousJob',     label: 'Prev Job Type',       type: 'text',   width: 120 },
  // ── Income & Payroll ──────────────────────────────────────
  ...IP_PAYROLL_FIELDS.map(f => ({
    group: 'Income & Payroll', field: `ip_${key(f)}`, label: f.length > 35 ? f.slice(0,33)+'…' : f, type: 'yn', width: 64,
  })),
  ...IP_UNDERSTANDING_FIELDS.map(f => ({
    group: 'Income & Payroll', field: `ip_${key(f)}`, label: f.length > 35 ? f.slice(0,33)+'…' : f, type: 'yn', width: 64,
  })),
  ...IP_EXPECTATIONS_FIELDS.map(f => ({
    group: 'Income & Payroll', field: `ip_${key(f)}`, label: f.length > 35 ? f.slice(0,33)+'…' : f, type: 'yn', width: 64,
  })),
  // ── Exit Reasons (categorized checkboxes) ────────────────────────────
  ...EXIT_REASON_FIELDS.map(f => ({
    group: 'Exit Reasons', field: `er_${key(f)}`, label: f.length > 40 ? f.slice(0,38)+'…' : f, type: 'yn', width: 64,
  })),
  { group: 'Exit Reasons', field: 'er_other_explain',  label: 'Other Reason', type: 'textarea', width: 140 },
  { group: 'Exit Reasons', field: 'er_biggest_impact', label: 'Biggest Impact', type: 'select', width: 140,
    options: ['', ...MAIN_FACTOR_OPTIONS] },
  // ── Operational Stressors ────────────────────────────────
  ...OP_STRESSOR_FIELDS.map(f => ({
    group: 'Stressors', field: `os_${key(f)}`, label: f, type: 'freq', width: 96,
  })),
  // ── Supervision Flags ────────────────────────────────────
  ...SUPERVISION_FLAGS.map(f => ({
    group: 'Supervision', field: `sv_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  { group: 'Supervision', field: 'safeToSpeak', label: 'Safe to Speak', type: 'select', width: 90,
    options: ['','Yes','Somewhat','No'] },
  // ── Complaint Handling ───────────────────────────────────
  ...COMPLAINT_FLAGS.map(f => ({
    group: 'Complaints', field: `cp_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  // ── Exit Summary ─────────────────────────────────────────
  { group: 'Exit Summary', field: 'mainExitFactor',  label: 'Main Factor',   type: 'select', width: 110,
    options: ['', ...MAIN_FACTOR_OPTIONS] },
  { group: 'Exit Summary', field: 'secondaryFactor', label: 'Secondary',     type: 'select', width: 110,
    options: ['None', ...MAIN_FACTOR_OPTIONS] },
  { group: 'Exit Summary', field: 'breakingPoint',   label: 'Breaking Point',type: 'textarea', width: 160 },
  { group: 'Exit Summary', field: 'wouldRecommend',  label: 'Recommend?',    type: 'select', width: 88,
    options: ['','Yes','Maybe','No'] },
  // ── Stay Factors ─────────────────────────────────────────
  ...STAY_FACTOR_FIELDS.map(f => ({
    group: 'Stay Factors', field: `sf_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  { group: 'Stay Factors', field: 'otherSuggestions', label: 'Suggestions', type: 'textarea', width: 140 },
  // ── Trust Index ──────────────────────────────────────────
  ...TRUST_FIELDS.map(f => ({
    group: 'Trust Index', field: `ti_${key(f)}`, label: f, type: 'scale-ti', width: 60,
  })),
];

// Group spans — computed once
const TABLE_GROUPS = (() => {
  const groups = [];
  TABLE_COLUMNS.forEach(col => {
    const last = groups[groups.length - 1];
    if (last && last.name === col.group) {
      last.span++;
    } else {
      groups.push({ name: col.group, span: 1 });
    }
  });
  return groups;
})();

// Group background colors
const GROUP_COLORS = {
  'Guard Info':       '#1e3a5f',
  'Income & Payroll': '#065f46',
  'Exit Reasons':     '#7f1d1d',
  'Stressors':        '#78350f',
  'Supervision':      '#3b0764',
  'Complaints':       '#164e63',
  'Exit Summary':     '#14532d',
  'Stay Factors':     '#1e3a5f',
  'Trust Index':      '#4a1d96',
};

// ─── TABLE FILTER + SORT ─────────────────────────────────────────────
function getTableRows() {
  let rows = records.map((r, i) => ({ r, i }));

  // Period filter
  if (tablePeriod.type !== 'all') {
    rows = rows.filter(({ r }) => {
      if (!r.dateOfExit) return false;
      const d = new Date(r.dateOfExit);
      if (isNaN(d)) return false;
      const y = d.getFullYear(), m = d.getMonth() + 1;
      if (tablePeriod.type === 'annual')    return y === tablePeriod.year;
      if (tablePeriod.type === 'quarterly') return y === tablePeriod.year && Math.ceil(m / 3) === tablePeriod.quarter;
      if (tablePeriod.type === 'monthly')   return y === tablePeriod.year && m === tablePeriod.month;
      return true;
    });
  }

  // Detachment filter
  if (tablePeriod.detachment) {
    rows = rows.filter(({ r }) => r.detachment === tablePeriod.detachment);
  }

  // Date range filter
  if (tablePeriod.dateFrom || tablePeriod.dateTo) {
    rows = rows.filter(({ r }) => {
      if (!r.dateOfExit) return false;
      const d = new Date(r.dateOfExit);
      if (isNaN(d)) return false;
      if (tablePeriod.dateFrom && d < new Date(tablePeriod.dateFrom)) return false;
      if (tablePeriod.dateTo && d > new Date(tablePeriod.dateTo)) return false;
      return true;
    });
  }

  // Search (name, detachment, exit type, rank)
  if (tableSearch.trim()) {
    const q = tableSearch.trim().toLowerCase();
    rows = rows.filter(({ r }) =>
      (r.fullName     || '').toLowerCase().includes(q) ||
      (r.detachment   || '').toLowerCase().includes(q) ||
      (r.typeOfExit   || '').toLowerCase().includes(q) ||
      (r.rankPosition || '').toLowerCase().includes(q)
    );
  }

  // Sort
  if (tableSort.field) {
    const col = TABLE_COLUMNS.find(c => c.field === tableSort.field);
    const dir = tableSort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av = a.r[tableSort.field], bv = b.r[tableSort.field];
      // Nulls/empty always last
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && !bEmpty) return 1;
      if (!aEmpty && bEmpty) return -1;
      if (aEmpty && bEmpty)  return 0;
      if (typeof av === 'boolean') av = av ? 1 : 0;
      if (typeof bv === 'boolean') bv = bv ? 1 : 0;
      if (col?.type === 'date') {
        av = new Date(av).getTime() || 0;
        bv = new Date(bv).getTime() || 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
  } else if (tableSort.dir === 'desc') {
    rows.reverse();
  }

  return rows;
}

function renderTable(refocusSearch = false) {
  const toolbar = document.getElementById('table-toolbar');
  const content = document.getElementById('table-content');
  toolbar.innerHTML = '';
  toolbar.style.cssText = 'display:flex;flex-direction:column;gap:0;padding:0;flex-shrink:0;';

  const usedDetachments = [...new Set(records.filter(r => r.detachment).map(r => r.detachment))].sort();
  const tBounds = getPeriodBounds(tablePeriod);
  const hasFilters = tablePeriod.type !== 'all' || tablePeriod.detachment || tablePeriod.dateFrom || tablePeriod.dateTo || tableSearch.trim() || tableSort.field || tableSort.dir === 'desc';

  // ── Period row ───────────────────────────────────────────
  const periodRow = document.createElement('div');
  periodRow.className = 'pf-row';
  const periodLbl = document.createElement('span');
  periodLbl.className = 'pf-row-label';
  periodLbl.textContent = 'Period:';
  periodRow.appendChild(periodLbl);
  const periodCtrl = document.createElement('div');
  periodCtrl.className = 'pf-row-controls';
  [['all','All'],['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']].forEach(([t, txt]) => {
    const b = document.createElement('button');
    b.className = 'period-btn' + (tablePeriod.type === t ? ' active' : '');
    b.textContent = txt;
    b.addEventListener('click', () => { tablePeriod.type = t; tablePeriod.dateFrom = ''; tablePeriod.dateTo = ''; renderTable(); });
    periodCtrl.appendChild(b);
  });
  if (tablePeriod.type !== 'all') {
    const curYear = new Date().getFullYear();
    const ySel = document.createElement('select');
    ySel.className = 'period-select';
    for (let y = curYear; y >= curYear - 5; y--) {
      const o = document.createElement('option'); o.value = y; o.textContent = y;
      if (y === tablePeriod.year) o.selected = true;
      ySel.appendChild(o);
    }
    ySel.addEventListener('change', () => { tablePeriod.year = parseInt(ySel.value); tablePeriod.dateFrom = ''; tablePeriod.dateTo = ''; renderTable(); });
    periodCtrl.appendChild(ySel);
  }
  if (tablePeriod.type === 'monthly') {
    const mSel = document.createElement('select');
    mSel.className = 'period-select';
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((m, i) => {
      const o = document.createElement('option'); o.value = i+1; o.textContent = m;
      if (i+1 === tablePeriod.month) o.selected = true;
      mSel.appendChild(o);
    });
    mSel.addEventListener('change', () => { tablePeriod.month = parseInt(mSel.value); tablePeriod.dateFrom = ''; tablePeriod.dateTo = ''; renderTable(); });
    periodCtrl.appendChild(mSel);
  }
  if (tablePeriod.type === 'quarterly') {
    const qSel = document.createElement('select');
    qSel.className = 'period-select';
    ['Q1 (Jan–Mar)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Oct–Dec)'].forEach((q, i) => {
      const o = document.createElement('option'); o.value = i+1; o.textContent = q;
      if (i+1 === tablePeriod.quarter) o.selected = true;
      qSel.appendChild(o);
    });
    qSel.addEventListener('change', () => { tablePeriod.quarter = parseInt(qSel.value); tablePeriod.dateFrom = ''; tablePeriod.dateTo = ''; renderTable(); });
    periodCtrl.appendChild(qSel);
  }
  periodRow.appendChild(periodCtrl);
  toolbar.appendChild(periodRow);

  // ── Date row ─────────────────────────────────────────────
  const dateRow = document.createElement('div');
  dateRow.className = 'pf-row';
  const dateLbl = document.createElement('span');
  dateLbl.className = 'pf-row-label';
  dateLbl.textContent = 'Date:';
  dateRow.appendChild(dateLbl);
  const dateCtrl = document.createElement('div');
  dateCtrl.className = 'pf-row-controls';
  const drFrom = document.createElement('input');
  drFrom.type = 'date'; drFrom.className = 'period-date-input'; drFrom.title = 'From date';
  if (tBounds.min) drFrom.min = tBounds.min;
  if (tBounds.max) drFrom.max = tBounds.max;
  if (tablePeriod.dateFrom) drFrom.value = tablePeriod.dateFrom;
  drFrom.addEventListener('change', () => { tablePeriod.dateFrom = drFrom.value; renderTable(); });
  const drDash = document.createElement('span');
  drDash.className = 'pf-date-dash'; drDash.textContent = '–';
  const drTo = document.createElement('input');
  drTo.type = 'date'; drTo.className = 'period-date-input'; drTo.title = 'To date';
  if (tBounds.min) drTo.min = tBounds.min;
  if (tBounds.max) drTo.max = tBounds.max;
  if (tablePeriod.dateTo) drTo.value = tablePeriod.dateTo;
  drTo.addEventListener('change', () => { tablePeriod.dateTo = drTo.value; renderTable(); });
  dateCtrl.appendChild(drFrom); dateCtrl.appendChild(drDash); dateCtrl.appendChild(drTo);
  dateRow.appendChild(dateCtrl);
  toolbar.appendChild(dateRow);

  // ── Branch row ───────────────────────────────────────────
  if (usedDetachments.length > 0) {
    const branchRow = document.createElement('div');
    branchRow.className = 'pf-row';
    const branchLbl = document.createElement('span');
    branchLbl.className = 'pf-row-label';
    branchLbl.textContent = 'Branch:';
    branchRow.appendChild(branchLbl);
    const branchCtrl = document.createElement('div');
    branchCtrl.className = 'pf-row-controls';
    const detSel = document.createElement('select');
    detSel.className = 'period-select';
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = 'All branches';
    if (!tablePeriod.detachment) allOpt.selected = true;
    detSel.appendChild(allOpt);
    usedDetachments.forEach(d => {
      const o = document.createElement('option'); o.value = d; o.textContent = d;
      if (d === tablePeriod.detachment) o.selected = true;
      detSel.appendChild(o);
    });
    detSel.addEventListener('change', () => { tablePeriod.detachment = detSel.value; renderTable(); });
    branchCtrl.appendChild(detSel);
    branchRow.appendChild(branchCtrl);
    toolbar.appendChild(branchRow);
  }

  // ── Footer: search + info + reset + actions ───────────────
  const footer = document.createElement('div');
  footer.className = 'pf-footer';
  footer.style.cssText = 'flex-wrap:wrap;gap:6px;';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'table-search-wrap';
  searchWrap.style.flex = '1';
  searchWrap.style.minWidth = '140px';
  searchWrap.innerHTML = '<span class="material-icons">search</span>';
  const searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.className = 'table-search';
  searchInp.style.width = '100%';
  searchInp.placeholder = 'Search name, detachment, type…';
  searchInp.value = tableSearch;
  searchInp.addEventListener('input', () => { tableSearch = searchInp.value; renderTable(true); });
  searchWrap.appendChild(searchInp);
  footer.appendChild(searchWrap);

  const filteredRows = getTableRows();
  const completedCount = records.filter(r => r.fullName && r.fullName.trim()).length;
  const shownText = filteredRows.length === records.length
    ? `<strong>${records.length}</strong> record${records.length !== 1 ? 's' : ''}`
    : `<strong>${filteredRows.length}</strong> of <strong>${records.length}</strong>`;
  const infoBadge = document.createElement('span');
  infoBadge.className = 'period-count-badge';
  infoBadge.innerHTML = shownText;
  footer.appendChild(infoBadge);

  if (tableSort.field) {
    const sortBadge = document.createElement('span');
    sortBadge.className = 'filter-active-badge';
    sortBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">sort</span>&nbsp;${escHtml(TABLE_COLUMNS.find(c => c.field === tableSort.field)?.label || tableSort.field)} ${tableSort.dir === 'asc' ? '↑' : '↓'}`;
    footer.appendChild(sortBadge);
  }

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-table-reset' + (hasFilters ? ' has-filters' : '');
  resetBtn.innerHTML = '<span class="material-icons">restart_alt</span> Reset';
  resetBtn.title = 'Clear all filters and sorting';
  resetBtn.addEventListener('click', () => {
    tableSort = { field: null, dir: 'asc' };
    tableSearch = '';
    tablePeriod = { type: 'all', year: new Date().getFullYear(), month: new Date().getMonth() + 1, quarter: Math.ceil((new Date().getMonth() + 1) / 3), detachment: '', dateFrom: '', dateTo: '' };
    renderTable();
  });
  footer.appendChild(resetBtn);

  const stickyBtn = document.createElement('button');
  stickyBtn.className = 'btn-sticky-toggle' + (stickyNameCol ? ' pinned' : '');
  stickyBtn.innerHTML = `<span class="material-icons">push_pin</span>`;
  stickyBtn.title = stickyNameCol ? 'Unpin Name column' : 'Pin Name column';
  stickyBtn.addEventListener('click', () => { stickyNameCol = !stickyNameCol; renderTable(); });
  footer.appendChild(stickyBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-table-add';
  addBtn.innerHTML = '<span class="material-icons">add</span> New Record';
  addBtn.addEventListener('click', () => { addRecord(); renderTable(); });
  footer.appendChild(addBtn);

  toolbar.appendChild(footer);

  // ── Info row (desktop hint) ──────────────────────────────
  const hintRow = document.createElement('div');
  hintRow.className = 'table-toolbar-row2';
  hintRow.style.cssText = 'padding:4px 16px;border-top:1px solid #f1f5f9;';
  hintRow.innerHTML = `<span class="table-toolbar-info"><span class="material-icons">table_view</span><span><strong>${completedCount}</strong> completed</span><span style="color:#cbd5e1;">·</span><span style="color:#94a3b8;font-size:11.5px;">Click cell to edit · Click header to sort</span></span>`;
  toolbar.appendChild(hintRow);

  // Restore search focus after re-render (prevents losing cursor on keystroke)
  if (refocusSearch) {
    const s = toolbar.querySelector('.table-search');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  // ── Table ──────────────────────────────────────────────
  content.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';

  // Group header row
  const groupTr = document.createElement('tr');
  groupTr.className = 'group-header';
  const thIdG = document.createElement('th');
  thIdG.className = 'sticky-col col-id';
  thIdG.style.background = '#0f172a';
  thIdG.textContent = '#';
  groupTr.appendChild(thIdG);
  const thActG = document.createElement('th');
  thActG.style.cssText = 'background:#0f172a;position:sticky;top:0;z-index:20;width:28px;min-width:28px;';
  groupTr.appendChild(thActG);
  TABLE_GROUPS.forEach(g => {
    const th = document.createElement('th');
    th.colSpan = g.span;
    th.textContent = g.name;
    th.style.background = GROUP_COLORS[g.name] || '#1e3a5f';
    groupTr.appendChild(th);
  });

  // Field header row — sortable
  const fieldTr = document.createElement('tr');
  fieldTr.className = 'field-header';

  // ID column header — sorts by original record ID
  const thIdF = document.createElement('th');
  const idIsActive = !tableSort.field;
  thIdF.className = 'sticky-col col-id th-sortable' + (idIsActive ? ' th-sorted' : '');
  thIdF.title = 'Sort by original record ID';
  thIdF.innerHTML = `ID <span class="sort-icon">${idIsActive ? (tableSort.dir === 'asc' ? '↑' : '↓') : '⇅'}</span>`;
  thIdF.addEventListener('click', () => {
    if (!tableSort.field) tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
    else tableSort = { field: null, dir: 'asc' };
    renderTable();
  });
  fieldTr.appendChild(thIdF);

  const thActF = document.createElement('th');
  thActF.style.cssText = 'width:28px;min-width:28px;position:sticky;top:27px;z-index:19;background:#f1f5f9;border-bottom:2px solid #cbd5e1;border-right:1px solid #e2e8f0;';
  fieldTr.appendChild(thActF);

  TABLE_COLUMNS.forEach((col, ci) => {
    const th = document.createElement('th');
    const isActive = tableSort.field === col.field;
    const sortIcon = isActive ? (tableSort.dir === 'asc' ? '↑' : '↓') : '⇅';
    th.title = `Sort by ${col.label}`;
    th.style.minWidth = col.width + 'px';
    th.innerHTML = `${escHtml(col.label)} <span class="sort-icon">${sortIcon}</span>`;
    th.classList.add('th-sortable');
    if (isActive) th.classList.add('th-sorted');
    if (col.field === 'fullName' && stickyNameCol) th.classList.add('sticky-col', 'col-name');
    const nextCol = TABLE_COLUMNS[ci + 1];
    if (!nextCol || nextCol.group !== col.group) th.style.borderRight = '2px solid #cbd5e1';
    th.addEventListener('click', () => {
      if (tableSort.field === col.field) {
        tableSort.dir === 'asc' ? (tableSort.dir = 'desc') : (tableSort = { field: null, dir: 'asc' });
      } else {
        tableSort = { field: col.field, dir: 'asc' };
      }
      renderTable();
    });
    fieldTr.appendChild(th);
  });

  const thead = document.createElement('thead');
  thead.appendChild(groupTr);
  thead.appendChild(fieldTr);
  table.appendChild(thead);

  // Body rows — filtered + sorted
  const tbody = document.createElement('tbody');
  if (filteredRows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = TABLE_COLUMNS.length + 2;
    td.style.cssText = 'text-align:center;padding:36px;color:#94a3b8;font-size:13px;';
    td.innerHTML = '<span class="material-icons" style="display:block;font-size:36px;margin-bottom:10px;color:#cbd5e1;">search_off</span>No records match the current filters';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    filteredRows.forEach(({ r, i: rowIdx }) => {
      const tr = document.createElement('tr');
      tr.dataset.recordIdx = rowIdx;
      if (rowIdx === activeRecordIdx) tr.classList.add('active-row');

      const tdId = document.createElement('td');
      tdId.className = 'sticky-col col-id td-id';
      tdId.textContent = String(rowIdx + 1).padStart(4, '0');
      tdId.title = 'Click to open in Form view';
      tdId.addEventListener('click', () => { activeRecordIdx = rowIdx; activeSectionId = 'guard-info'; switchView('form'); });
      tr.appendChild(tdId);

      const tdDel = document.createElement('td');
      tdDel.style.cssText = 'text-align:center;padding:2px;';
      if (records.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-row-delete';
        delBtn.title = 'Delete record';
        delBtn.innerHTML = '<span class="material-icons">close</span>';
        delBtn.addEventListener('click', () => confirmDelete(rowIdx));
        tdDel.appendChild(delBtn);
      }
      tr.appendChild(tdDel);

      TABLE_COLUMNS.forEach((col, ci) => {
        const td = document.createElement('td');
        if (col.field === 'fullName' && stickyNameCol) td.classList.add('sticky-col', 'col-name');
        const nextCol = TABLE_COLUMNS[ci + 1];
        if (!nextCol || nextCol.group !== col.group) td.classList.add('section-divider');
        td.appendChild(buildTableCell(col, r, rowIdx));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  content.appendChild(table);
}

function buildTableCell(col, r, rowIdx) {
  const val = r[col.field];

  if (col.type === 'scale-er') {
    const sel = document.createElement('select');
    sel.className = 'td-scale-select scale-er-' + (val !== null && val !== undefined ? val : 'null');
    [['—', ''], ...[[0,'0'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseFloat(sel.value);
      sel.className = 'td-scale-select scale-er-' + (sel.value === '' ? 'null' : sel.value);
      saveToLocalStorage();
      updateTableRowHighlight(rowIdx);
    });
    return sel;
  }

  if (col.type === 'scale-ti') {
    const sel = document.createElement('select');
    sel.className = 'td-scale-select scale-ti-' + (val !== null && val !== undefined ? val : 'null');
    [['—', ''], ...[[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseFloat(sel.value);
      sel.className = 'td-scale-select scale-ti-' + (sel.value === '' ? 'null' : sel.value);
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'freq') {
    const FREQ_SHORT = ['Never', 'Smetms', 'Often', 'V.Often'];
    const sel = document.createElement('select');
    sel.className = 'td-freq-select scale-freq-' + (val !== null && val !== undefined ? val : 'null');
    sel.title = val !== null && val !== undefined ? FREQ_LABELS[val] : '—';
    [['—', ''], ...FREQ_SHORT.map((l, i) => [l, String(i)])].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseInt(sel.value);
      sel.className = 'td-freq-select scale-freq-' + (sel.value === '' ? 'null' : sel.value);
      sel.title = sel.value !== '' ? FREQ_LABELS[parseInt(sel.value)] : '—';
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'yn') {
    const ynClass = val === true ? 'yn-yes' : val === false ? 'yn-no' : 'yn-null';
    const sel = document.createElement('select');
    sel.className = 'td-yn-select ' + ynClass;
    [['—', ''],['Yes','true'],['No','false']].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if ((val === true && v === 'true') || (val === false && v === 'false') || (val === null && v === '')) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : sel.value === 'true';
      sel.className = 'td-yn-select ' + (sel.value === 'true' ? 'yn-yes' : sel.value === 'false' ? 'yn-no' : 'yn-null');
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'select') {
    const sel = document.createElement('select');
    sel.className = 'td-select';
    sel.style.minWidth = col.width + 'px';
    // Recommend coloring
    if (col.field === 'wouldRecommend') {
      sel.style.fontWeight = '700';
      if (val === 'Yes') sel.style.color = '#14532d';
      else if (val === 'No') sel.style.color = '#991b1b';
      else if (val === 'Maybe') sel.style.color = '#92400e';
    }
    col.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '—';
      if (opt === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value;
      if (col.field === 'wouldRecommend') {
        sel.style.color = sel.value === 'Yes' ? '#14532d' : sel.value === 'No' ? '#991b1b' : sel.value === 'Maybe' ? '#92400e' : '';
      }
      saveToLocalStorage();
      if (col.field === 'typeOfExit' || col.field === 'detachment') renderRecordList();
    });
    return sel;
  }

  if (col.type === 'textarea') {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'td-input';
    inp.style.minWidth = col.width + 'px';
    inp.value = val || '';
    inp.placeholder = '…';
    inp.title = val || '';
    inp.addEventListener('input', () => {
      r[col.field] = inp.value;
      inp.title = inp.value;
      saveToLocalStorage();
    });
    return inp;
  }

  // text / number / date
  const inp = document.createElement('input');
  inp.type = col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text';
  inp.className = 'td-input';
  inp.style.minWidth = col.width + 'px';
  inp.value = val || '';
  if (col.field === 'fullName') inp.style.fontWeight = '600';
  inp.addEventListener('input', () => {
    r[col.field] = inp.value;
    saveToLocalStorage();
    if (col.field === 'fullName') {
      renderRecordList();
      updateTableRowHighlight(rowIdx);
    }
  });
  return inp;
}

function updateTableRowHighlight(rowIdx) {
  const row = document.querySelector(`#table-content tbody tr[data-record-idx="${rowIdx}"]`);
  if (row) {
    const idCell = row.querySelector('.td-id');
    if (idCell) idCell.textContent = String(rowIdx + 1).padStart(4, '0');
  }
  updateHeaderSubtitle();
}

// ─── PERIOD BOUNDS HELPER ────────────────────────────────────────────
function getPeriodBounds(period) {
  if (period.type === 'all') return { min: '', max: '' };
  const y = period.year;
  if (period.type === 'annual') {
    return { min: `${y}-01-01`, max: `${y}-12-31` };
  }
  if (period.type === 'quarterly') {
    const starts = ['01-01','04-01','07-01','10-01'];
    const ends   = ['03-31','06-30','09-30','12-31'];
    const q = period.quarter - 1;
    return { min: `${y}-${starts[q]}`, max: `${y}-${ends[q]}` };
  }
  if (period.type === 'monthly') {
    const m = String(period.month).padStart(2, '0');
    const lastDay = new Date(y, period.month, 0).getDate();
    return { min: `${y}-${m}-01`, max: `${y}-${m}-${String(lastDay).padStart(2,'0')}` };
  }
  return { min: '', max: '' };
}

// ─── SUMMARY VIEW ────────────────────────────────────────────────────
function getFilteredCompleted() {
  let base = records.filter(r => r.fullName && r.fullName.trim());
  if (summaryPeriod.detachment) {
    base = base.filter(r => r.detachment === summaryPeriod.detachment);
  }
  if (summaryPeriod.type !== 'all') {
    base = base.filter(r => {
      if (!r.dateOfExit) return false;
      const d = new Date(r.dateOfExit);
      if (isNaN(d)) return false;
      const y = d.getFullYear(), m = d.getMonth() + 1;
      if (summaryPeriod.type === 'annual') return y === summaryPeriod.year;
      if (summaryPeriod.type === 'quarterly') return y === summaryPeriod.year && Math.ceil(m/3) === summaryPeriod.quarter;
      if (summaryPeriod.type === 'monthly') return y === summaryPeriod.year && m === summaryPeriod.month;
      return true;
    });
  }
  if (summaryPeriod.dateFrom || summaryPeriod.dateTo) {
    base = base.filter(r => {
      if (!r.dateOfExit) return false;
      const d = new Date(r.dateOfExit);
      if (isNaN(d)) return false;
      if (summaryPeriod.dateFrom && d < new Date(summaryPeriod.dateFrom)) return false;
      if (summaryPeriod.dateTo && d > new Date(summaryPeriod.dateTo)) return false;
      return true;
    });
  }
  return base;
}

function renderPeriodFilter() {
  const bar = document.createElement('div');
  bar.className = 'period-filter-bar';

  // ── Row: Period ──
  const periodRow = document.createElement('div');
  periodRow.className = 'pf-row';
  const periodLabel = document.createElement('span');
  periodLabel.className = 'pf-row-label';
  periodLabel.textContent = 'Period:';
  periodRow.appendChild(periodLabel);

  const periodControls = document.createElement('div');
  periodControls.className = 'pf-row-controls';
  [['all','All Time'],['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']].forEach(([t, txt]) => {
    const b = document.createElement('button');
    b.className = 'period-btn' + (summaryPeriod.type === t ? ' active' : '');
    b.textContent = txt;
    b.addEventListener('click', () => { summaryPeriod.type = t; summaryPeriod.dateFrom = ''; summaryPeriod.dateTo = ''; renderSummary(); });
    periodControls.appendChild(b);
  });
  if (summaryPeriod.type !== 'all') {
    const curYear = new Date().getFullYear();
    const ySel = document.createElement('select');
    ySel.className = 'period-select';
    for (let y = curYear; y >= curYear - 5; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      if (y === summaryPeriod.year) o.selected = true;
      ySel.appendChild(o);
    }
    ySel.addEventListener('change', () => { summaryPeriod.year = parseInt(ySel.value); summaryPeriod.dateFrom = ''; summaryPeriod.dateTo = ''; renderSummary(); });
    periodControls.appendChild(ySel);
  }
  if (summaryPeriod.type === 'monthly') {
    const mSel = document.createElement('select');
    mSel.className = 'period-select';
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((m, i) => {
      const o = document.createElement('option');
      o.value = i+1; o.textContent = m;
      if (i+1 === summaryPeriod.month) o.selected = true;
      mSel.appendChild(o);
    });
    mSel.addEventListener('change', () => { summaryPeriod.month = parseInt(mSel.value); summaryPeriod.dateFrom = ''; summaryPeriod.dateTo = ''; renderSummary(); });
    periodControls.appendChild(mSel);
  }
  if (summaryPeriod.type === 'quarterly') {
    const qSel = document.createElement('select');
    qSel.className = 'period-select';
    ['Q1 (Jan–Mar)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Oct–Dec)'].forEach((q, i) => {
      const o = document.createElement('option');
      o.value = i+1; o.textContent = q;
      if (i+1 === summaryPeriod.quarter) o.selected = true;
      qSel.appendChild(o);
    });
    qSel.addEventListener('change', () => { summaryPeriod.quarter = parseInt(qSel.value); summaryPeriod.dateFrom = ''; summaryPeriod.dateTo = ''; renderSummary(); });
    periodControls.appendChild(qSel);
  }
  periodRow.appendChild(periodControls);
  bar.appendChild(periodRow);

  // ── Row: Date Range ──
  const dateRow = document.createElement('div');
  dateRow.className = 'pf-row';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'pf-row-label';
  dateLabel.textContent = 'Date:';
  dateRow.appendChild(dateLabel);

  const dateControls = document.createElement('div');
  dateControls.className = 'pf-row-controls';
  const bounds = getPeriodBounds(summaryPeriod);
  const drFrom = document.createElement('input');
  drFrom.type = 'date';
  drFrom.className = 'period-date-input';
  drFrom.title = 'From date';
  if (bounds.min) drFrom.min = bounds.min;
  if (bounds.max) drFrom.max = bounds.max;
  if (summaryPeriod.dateFrom) drFrom.value = summaryPeriod.dateFrom;
  drFrom.addEventListener('change', () => { summaryPeriod.dateFrom = drFrom.value; renderSummary(); });
  const drDash = document.createElement('span');
  drDash.className = 'pf-date-dash';
  drDash.textContent = '–';
  const drTo = document.createElement('input');
  drTo.type = 'date';
  drTo.className = 'period-date-input';
  drTo.title = 'To date';
  if (bounds.min) drTo.min = bounds.min;
  if (bounds.max) drTo.max = bounds.max;
  if (summaryPeriod.dateTo) drTo.value = summaryPeriod.dateTo;
  drTo.addEventListener('change', () => { summaryPeriod.dateTo = drTo.value; renderSummary(); });
  dateControls.appendChild(drFrom);
  dateControls.appendChild(drDash);
  dateControls.appendChild(drTo);
  dateRow.appendChild(dateControls);
  bar.appendChild(dateRow);

  // ── Row: Branch ──
  const usedDetachments = [...new Set(
    records.filter(r => r.fullName && r.fullName.trim() && r.detachment).map(r => r.detachment)
  )].sort();
  if (usedDetachments.length > 0) {
    const branchRow = document.createElement('div');
    branchRow.className = 'pf-row';
    const branchLabel = document.createElement('span');
    branchLabel.className = 'pf-row-label';
    branchLabel.textContent = 'Branch:';
    branchRow.appendChild(branchLabel);
    const branchControls = document.createElement('div');
    branchControls.className = 'pf-row-controls';
    const detSel = document.createElement('select');
    detSel.className = 'period-select';
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = 'All branches';
    if (!summaryPeriod.detachment) allOpt.selected = true;
    detSel.appendChild(allOpt);
    usedDetachments.forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      if (d === summaryPeriod.detachment) o.selected = true;
      detSel.appendChild(o);
    });
    detSel.addEventListener('change', () => { summaryPeriod.detachment = detSel.value; renderSummary(); });
    branchControls.appendChild(detSel);
    branchRow.appendChild(branchControls);
    bar.appendChild(branchRow);
  }

  // ── Footer: count badge + reset ──
  const footer = document.createElement('div');
  footer.className = 'pf-footer';

  const filtered = getFilteredCompleted();
  const badge = document.createElement('span');
  badge.className = 'period-count-badge';
  badge.style.marginLeft = '0';
  badge.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;
  footer.appendChild(badge);

  const hasFilters = summaryPeriod.type !== 'all' || summaryPeriod.detachment || summaryPeriod.dateFrom || summaryPeriod.dateTo;
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-table-reset' + (hasFilters ? ' has-filters' : '');
  resetBtn.innerHTML = '<span class="material-icons">restart_alt</span> Reset';
  resetBtn.title = 'Clear all filters';
  resetBtn.style.marginLeft = 'auto';
  resetBtn.addEventListener('click', () => {
    summaryPeriod = { type: 'all', year: new Date().getFullYear(), month: new Date().getMonth() + 1, quarter: Math.ceil((new Date().getMonth() + 1) / 3), detachment: '', dateFrom: '', dateTo: '' };
    renderSummary();
  });
  footer.appendChild(resetBtn);

  bar.appendChild(footer);
  return bar;
}

function renderSummary() {
  const container = document.getElementById('summary-content');
  container.innerHTML = '';

  // Period filter bar
  container.appendChild(renderPeriodFilter());

  const completed = getFilteredCompleted();

  // ── KPI Row ──
  container.appendChild(renderKPIs(completed));

  // Monthly trend (always show, based on all records for company)
  container.appendChild(renderMonthlyTrendChart());

  // ── Charts ──
  container.appendChild(renderDetachmentChart(completed));
  container.appendChild(renderExitReasonsChart(completed));
  container.appendChild(renderExitTypeChart(completed));
  container.appendChild(renderTrustIndexChart(completed));
  container.appendChild(renderOpStressorsChart(completed));
  container.appendChild(renderSupervisionChart(completed));
  container.appendChild(renderStayFactorsChart(completed));
  container.appendChild(renderServiceLengthChart(completed));
  container.appendChild(renderRecommendChart(completed));

  // Animate bars after DOM is inserted
  requestAnimationFrame(() => {
    container.querySelectorAll('.bar-fill[data-pct]').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
    container.querySelectorAll('.donut-segment[data-deg]').forEach(el => {
      el.style.setProperty('--seg-deg', el.dataset.deg + 'deg');
    });
  });

  // Bar label click-to-pin (expand/collapse)
  container.addEventListener('click', e => {
    const label = e.target.closest('.bar-label');
    if (!label) return;
    e.stopPropagation();
    label.classList.toggle('expanded');
  });
}

// ─── MONTHLY TREND CHART ─────────────────────────────────────────────
function renderMonthlyTrendChart() {
  const section = makeSummarySection('Monthly Trend — Cases Over Time', 'trending_up', 'All records with a date of exit, last 14 months');

  // Build last 14 months of data
  const now = new Date();
  const months = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('default', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2) });
  }

  // Count records per month (all records with dateOfExit, regardless of filter)
  const allCompleted = records.filter(r => r.fullName && r.fullName.trim() && r.dateOfExit);
  months.forEach(m => {
    m.count = allCompleted.filter(r => {
      const d = new Date(r.dateOfExit);
      return !isNaN(d) && d.getFullYear() === m.year && d.getMonth() + 1 === m.month;
    }).length;
  });

  const maxCount = Math.max(...months.map(m => m.count), 1);

  // Trend chart wrapper
  const chartWrap = document.createElement('div');
  chartWrap.className = 'trend-chart-wrap';

  months.forEach((m, i) => {
    const prev = i > 0 ? months[i-1].count : null;
    let trendIcon = '';
    if (prev !== null) {
      if (m.count > prev) trendIcon = '<span class="trend-up">▲</span>';
      else if (m.count < prev) trendIcon = '<span class="trend-down">▼</span>';
      else if (m.count === prev && m.count > 0) trendIcon = '<span class="trend-flat">—</span>';
    }

    const col = document.createElement('div');
    col.className = 'trend-col';

    const barArea = document.createElement('div');
    barArea.className = 'trend-bar-area';

    if (m.count > 0) {
      const countLabel = document.createElement('div');
      countLabel.className = 'trend-count-label';
      countLabel.innerHTML = m.count + (trendIcon ? ' ' + trendIcon : '');
      barArea.appendChild(countLabel);
    }

    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    const pct = Math.round((m.count / maxCount) * 100);
    bar.style.height = '0%';
    bar.dataset.pct = pct;
    bar.style.transition = 'height 0.4s ease';
    barArea.appendChild(bar);

    const lbl = document.createElement('div');
    lbl.className = 'trend-label';
    lbl.textContent = m.label;

    col.appendChild(barArea);
    col.appendChild(lbl);
    chartWrap.appendChild(col);
  });

  const chartScroll = document.createElement('div');
  chartScroll.className = 'trend-chart-scroll';
  chartScroll.appendChild(chartWrap);
  section.appendChild(chartScroll);

  // Animate bars after append using a small timeout
  setTimeout(() => {
    chartWrap.querySelectorAll('.trend-bar[data-pct]').forEach(el => {
      el.style.height = el.dataset.pct + '%';
    });
  }, 50);

  return section;
}

// ─── KPI CARDS ───────────────────────────────────────────────────────
function renderKPIs(completed) {
  const all = records;
  const factors = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const trustScores = completed.flatMap(r =>
    TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null)
  );
  const avgTrust = trustScores.length ? (trustScores.reduce((a, b) => a + b, 0) / trustScores.length).toFixed(2) : '—';

  const grid = document.createElement('div');
  grid.className = 'kpi-grid';
  grid.innerHTML = `
    ${kpiCard('Total Records', all.length, '')}
    ${kpiCard('Completed', completed.length, `${all.length ? Math.round(completed.length/all.length*100) : 0}% completion rate`)}
    ${kpiCard('Top Exit Factor', topFactor, 'Most cited main factor')}
    ${kpiCard('Avg Trust Score', avgTrust, 'Average across all Trust Index fields')}
  `;
  return grid;
}

function kpiCard(label, value, sub) {
  return `<div class="kpi-card">
    <div class="kpi-label">${escHtml(label)}</div>
    <div class="kpi-value">${escHtml(String(value))}</div>
    ${sub ? `<div class="kpi-sub">${escHtml(sub)}</div>` : ''}
  </div>`;
}

const EXIT_REASON_PIE_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#3b82f6','#ec4899','#14b8a6','#22c55e'];

function renderExitReasonsChart(completed) {
  const guardCount = completed.length;
  const section = makeSummarySection('Exit Reasons by Category', 'logout',
    `${guardCount} guard${guardCount !== 1 ? 's' : ''} · each checked all applicable reasons`);

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const catData = EXIT_REASON_CATEGORIES.map((cat, i) => {
    const totalYes = cat.items.reduce((sum, label) => {
      return sum + completed.filter(r => r[`er_${key(label)}`] === true).length;
    }, 0);
    return { label: cat.label, icon: cat.icon, totalYes, color: EXIT_REASON_PIE_COLORS[i] };
  });

  const grandTotal = catData.reduce((s, d) => s + d.totalYes, 0);
  if (!grandTotal) { section.appendChild(emptyState('No exit reasons recorded yet')); return section; }

  const sorted = [...catData].sort((a, b) => b.totalYes - a.totalYes);

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col md:flex-row gap-6 items-center';

  // Build segment angle data
  let deg = 0;
  const segments = catData.filter(d => d.totalYes > 0).map(d => {
    const pct = d.totalYes / grandTotal * 100;
    const start = deg;
    deg += pct * 3.6;
    return { ...d, pct, start, end: deg };
  });

  const top = sorted[0];

  // SVG donut — each segment is an interactive path
  const SZ = 190, cx = 95, cy = 95, OR = 82, IR = 50;
  function pxy(angleDeg, r) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SZ} ${SZ}`);
  svg.setAttribute('overflow', 'visible');
  svg.style.cssText = `width:${SZ}px;height:${SZ}px;filter:drop-shadow(0 4px 12px ${top.color}55);`;

  // Center text group
  const centerG = document.createElementNS(svgNS, 'g');
  const hole = document.createElementNS(svgNS, 'circle');
  hole.setAttribute('cx', cx); hole.setAttribute('cy', cy); hole.setAttribute('r', IR);
  hole.setAttribute('fill', '#fff');
  const tMain = document.createElementNS(svgNS, 'text');
  tMain.setAttribute('x', cx); tMain.setAttribute('y', cy - 6);
  tMain.setAttribute('text-anchor', 'middle'); tMain.setAttribute('dominant-baseline', 'auto');
  tMain.setAttribute('font-size', '26'); tMain.setAttribute('font-weight', '800'); tMain.setAttribute('fill', '#1e293b');
  tMain.textContent = guardCount;
  const tSub = document.createElementNS(svgNS, 'text');
  tSub.setAttribute('x', cx); tSub.setAttribute('y', cy + 10);
  tSub.setAttribute('text-anchor', 'middle'); tSub.setAttribute('font-size', '10'); tSub.setAttribute('fill', '#64748b');
  tSub.textContent = guardCount === 1 ? 'guard' : 'guards';
  const tChecks = document.createElementNS(svgNS, 'text');
  tChecks.setAttribute('x', cx); tChecks.setAttribute('y', cy + 22);
  tChecks.setAttribute('text-anchor', 'middle'); tChecks.setAttribute('font-size', '9'); tChecks.setAttribute('fill', '#cbd5e1');
  tChecks.textContent = `${grandTotal} checks`;
  centerG.appendChild(hole); centerG.appendChild(tMain); centerG.appendChild(tSub); centerG.appendChild(tChecks);

  let pinned = null; // { path, s }
  let hoverTimer = null;

  const showSegment = (p, s) => {
    svg.querySelectorAll('path').forEach(q => { q.style.opacity = '0.35'; q.style.transform = ''; });
    p.style.opacity = '1'; p.style.transform = 'scale(1.07)';
    tMain.textContent = s.totalYes;
    tSub.textContent = `${Math.round(s.pct)}%`;
    tChecks.textContent = s.label.split(' ')[0];
  };
  const showDefault = () => {
    svg.querySelectorAll('path').forEach(q => { q.style.opacity = '1'; q.style.transform = ''; });
    tMain.textContent = guardCount;
    tSub.textContent = guardCount === 1 ? 'guard' : 'guards';
    tChecks.textContent = `${grandTotal} checks`;
  };

  segments.forEach(s => {
    const [x1,y1] = pxy(s.start, OR); const [x2,y2] = pxy(s.end, OR);
    const [x3,y3] = pxy(s.end, IR);  const [x4,y4] = pxy(s.start, IR);
    const large = (s.end - s.start) > 180 ? 1 : 0;
    const d = `M${x1},${y1} A${OR},${OR},0,${large},1,${x2},${y2} L${x3},${y3} A${IR},${IR},0,${large},0,${x4},${y4}Z`;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', s.color);
    path.style.cssText = 'cursor:pointer;transition:opacity 0.18s,transform 0.18s;transform-box:fill-box;transform-origin:center;';

    path.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      showSegment(path, s);
    });
    path.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      if (pinned) showSegment(pinned.path, pinned.s);
      else showDefault();
    });
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned && pinned.path === path) {
        // Unpin
        pinned = null;
        showDefault();
      } else {
        pinned = { path, s };
        showSegment(path, s);
      }
    });
    path.addEventListener('touchstart', (e) => { e.preventDefault(); showSegment(path, s); }, { passive: false });
    path.addEventListener('touchend', () => {
      if (!pinned) setTimeout(showDefault, 1400);
    });
    svg.appendChild(path);
  });

  // Click on SVG background to unpin
  svg.addEventListener('click', () => {
    if (pinned) { pinned = null; showDefault(); }
  });

  svg.appendChild(centerG);

  const donutWrap = document.createElement('div');
  donutWrap.className = 'flex-shrink-0 flex flex-col items-center gap-3';
  const legendDiv = document.createElement('div');
  legendDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;justify-content:center;max-width:210px;';
  legendDiv.innerHTML = catData.map(d => `<div style="display:flex;align-items:center;gap:3px;font-size:10.5px;color:#374151;">
    <span style="width:9px;height:9px;border-radius:50%;background:${d.color};flex-shrink:0;display:inline-block;"></span>
    ${escHtml(d.label.split(' ')[0])}
  </div>`).join('');
  donutWrap.appendChild(svg);
  donutWrap.appendChild(legendDiv);

  // Ranked list — top item gets a callout banner, rest are bar rows
  const listDiv = document.createElement('div');
  listDiv.style.flex = '1';
  sorted.forEach((d, i) => {
    const pct = Math.round(d.totalYes / grandTotal * 100);
    const barPct = sorted[0].totalYes ? Math.round(d.totalYes / sorted[0].totalYes * 100) : 0;

    if (i === 0) {
      // Top reason — highlighted callout
      const callout = document.createElement('div');
      callout.style.cssText = `
        border:2px solid ${d.color}55; border-radius:10px; padding:10px 14px;
        background:${d.color}0f; margin-bottom:12px; display:flex; flex-direction:column; gap:6px;
      `;
      callout.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="background:${d.color};color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;letter-spacing:0.04em;">TOP REASON</span>
          <span class="material-icons" style="font-size:16px;color:${d.color};">${d.icon}</span>
          <span style="font-size:13px;font-weight:700;color:#1e293b;flex:1;">${escHtml(d.label)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:10px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
            <div class="bar-fill" style="background:${d.color};height:100%;border-radius:999px;width:0%" data-pct="100"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${d.color};">${d.totalYes} of ${guardCount} guard${guardCount !== 1 ? 's' : ''} · ${pct}%</span>
        </div>
      `;
      listDiv.appendChild(callout);
    } else {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="bar-rank">${i + 1}</span>
        <span class="bar-label" style="display:flex;align-items:center;gap:5px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${d.color};flex-shrink:0;display:inline-block;"></span>
          <span class="material-icons" style="font-size:13px;color:#94a3b8;flex-shrink:0;">${d.icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(d.label)}</span>
        </span>
        <div class="bar-track">
          <div class="bar-fill" style="background:${d.color};width:0%" data-pct="${barPct}"></div>
        </div>
        <span class="bar-meta">${d.totalYes}/${guardCount} (${pct}%)</span>
      `;
      listDiv.appendChild(row);
    }
  });

  wrapper.appendChild(donutWrap);
  wrapper.appendChild(listDiv);
  section.appendChild(wrapper);
  return section;
}

// ─── CHART: EXIT TYPE DISTRIBUTION (donut + cards) ────────────────────
function renderExitTypeChart(completed) {
  const section = makeSummarySection('Exit Type Distribution', 'donut_large', 'Breakdown of how guards exited');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const counts = {};
  EXIT_TYPE_OPTIONS.forEach(t => counts[t] = 0);
  completed.forEach(r => { if (r.typeOfExit) counts[r.typeOfExit] = (counts[r.typeOfExit] || 0) + 1; });

  const total = completed.length;
  const COLORS = ['#3b82f6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#06b6d4'];

  // Donut chart (CSS conic-gradient)
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col md:flex-row gap-6 items-center';

  // Build conic gradient
  let deg = 0;
  const segments = EXIT_TYPE_OPTIONS.map((t, i) => {
    const pct = total ? counts[t] / total * 100 : 0;
    const start = deg;
    deg += pct * 3.6;
    return { label: t, count: counts[t], pct, color: COLORS[i], start, end: deg };
  }).filter(s => s.count > 0);

  const gradParts = segments.map(s => `${s.color} ${s.start.toFixed(1)}deg ${s.end.toFixed(1)}deg`).join(', ');

  const donutWrap = document.createElement('div');
  donutWrap.className = 'flex-shrink-0 flex flex-col items-center gap-3';
  donutWrap.innerHTML = `
    <div style="
      width:160px; height:160px; border-radius:50%;
      background: conic-gradient(${gradParts});
      position:relative;
    ">
      <div style="
        position:absolute; inset:30px; border-radius:50%;
        background:#fff; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
      ">
        <span style="font-size:22px;font-weight:700;color:#1e293b;">${total}</span>
        <span style="font-size:11px;color:#94a3b8;">guards</span>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:200px;">
      ${segments.map(s => `
        <div style="display:flex;align-items:center;gap:4px;font-size:11px;color:#374151;">
          <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;display:inline-block;"></span>
          ${escHtml(s.label)}
        </div>
      `).join('')}
    </div>
  `;

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'exit-type-grid flex-1';
  EXIT_TYPE_OPTIONS.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'exit-type-card';
    card.style.borderColor = COLORS[i] + '55';
    const pct = total ? Math.round(counts[t] / total * 100) : 0;
    card.innerHTML = `
      <div class="et-count" style="color:${COLORS[i]}">${counts[t]}</div>
      <div class="et-label">${escHtml(t)}</div>
      <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;">${pct}% of total</div>
    `;
    cardsGrid.appendChild(card);
  });

  wrapper.appendChild(donutWrap);
  wrapper.appendChild(cardsGrid);
  section.appendChild(wrapper);
  return section;
}

// ─── CHART: TRUST INDEX (horizontal bars + avg score indicators) ──────
function renderTrustIndexChart(completed) {
  const section = makeSummarySection('Trust Index Averages', 'verified_user', 'Average agreement score per statement (1–5 scale)');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const avgs = TRUST_FIELDS.map(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label, avg: +avg.toFixed(2), count: vals.length };
  });

  // Overall trust gauge
  const allVals = avgs.filter(a => a.count > 0);
  if (allVals.length) {
    const overallAvg = allVals.reduce((a, b) => a + b.avg, 0) / allVals.length;
    const gaugeColor = overallAvg >= 4 ? '#22c55e' : overallAvg >= 3 ? '#f59e0b' : '#ef4444';
    const gaugeLabel = overallAvg >= 4 ? 'High Trust' : overallAvg >= 3 ? 'Moderate Trust' : 'Low Trust';
    const gaugePct = (overallAvg - 1) / 4 * 100;

    const gauge = document.createElement('div');
    gauge.className = 'mb-5 p-4 rounded-lg border border-slate-100 flex items-center gap-4';
    gauge.innerHTML = `
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:32px;font-weight:800;color:${gaugeColor}">${overallAvg.toFixed(2)}</div>
        <div style="font-size:11.5px;font-weight:600;color:${gaugeColor}">${escHtml(gaugeLabel)}</div>
        <div style="font-size:11px;color:#94a3b8;">out of 5</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Overall Trust Score</div>
        <div class="bar-track" style="height:14px;border-radius:999px;">
          <div class="bar-fill" style="background:${gaugeColor};height:100%;border-radius:999px;transition:width 0.4s ease;width:0%" data-pct="${Math.round(gaugePct)}"></div>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Based on ${allVals.length} indicators</div>
      </div>
    `;
    section.appendChild(gauge);
  }

  avgs.forEach(a => {
    const pct = a.avg / 5 * 100;
    const color = a.avg >= 4 ? '#8b5cf6' : a.avg >= 3 ? '#a78bfa' : '#c4b5fd';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(a.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${color};width:0%" data-pct="${Math.round(pct)}"></div></div>
      <span class="bar-meta">${a.avg > 0 ? a.avg : '—'} / 5</span>
    `;
    section.appendChild(row);
  });
  return section;
}

// ─── CHART: OPERATIONAL STRESSORS (stacked frequency bars) ───────────
function renderOpStressorsChart(completed) {
  const section = makeSummarySection('Operational Stressors', 'warning_amber', 'Frequency of each stressor across all guards');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const freqColors = ['#e2e8f0','#fbbf24','#f97316','#ef4444'];
  const freqLabels = ['Never','Sometimes','Often','Very Often'];

  // Legend
  const legend = document.createElement('div');
  legend.className = 'flex gap-4 mb-4 flex-wrap';
  legend.innerHTML = freqLabels.map((l, i) =>
    `<div class="flex items-center gap-1.5 text-xs text-slate-600">
      <span style="width:12px;height:12px;border-radius:3px;background:${freqColors[i]};display:inline-block;"></span>${l}
    </div>`
  ).join('');
  section.appendChild(legend);

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    if (!vals.length) return;

    const counts = [0,1,2,3].map(i => vals.filter(v => v === i).length);
    const total = vals.length;

    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:12.5px;font-weight:500;color:#374151;margin-bottom:4px;';
    labelEl.textContent = label;

    const stackTrack = document.createElement('div');
    stackTrack.style.cssText = 'display:flex;height:22px;border-radius:6px;overflow:hidden;gap:1px;';

    counts.forEach((c, i) => {
      const pct = total ? c / total * 100 : 0;
      if (pct === 0) return;
      const seg = document.createElement('div');
      seg.style.cssText = `background:${freqColors[i]};width:0%;transition:width 0.4s ease;display:flex;align-items:center;justify-content:center;`;
      seg.dataset.pct = pct.toFixed(1);
      if (pct > 8) {
        seg.innerHTML = `<span style="font-size:10px;font-weight:700;color:${i < 1 ? '#64748b' : '#fff'};">${c}</span>`;
      }
      stackTrack.appendChild(seg);
    });

    const metaEl = document.createElement('div');
    metaEl.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:3px;';
    const worstPct = total ? Math.round(counts[3] / total * 100) : 0;
    metaEl.textContent = `${total} responses · ${worstPct}% Very Often`;

    row.appendChild(labelEl);
    row.appendChild(stackTrack);
    row.appendChild(metaEl);
    section.appendChild(row);

    // Animate stacked bars
    requestAnimationFrame(() => {
      stackTrack.querySelectorAll('[data-pct]').forEach(el => {
        setTimeout(() => { el.style.width = el.dataset.pct + '%'; }, 50);
      });
    });
  });

  return section;
}

// ─── CHART: SUPERVISION FLAGS ─────────────────────────────────────────
function renderSupervisionChart(completed) {
  const section = makeSummarySection('Supervision & Power Flags', 'manage_accounts', 'Number of guards who reported each issue (Yes responses)');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const data = SUPERVISION_FLAGS.map(label => {
    const fk = `sv_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    return { label, count: yesCount };
  }).sort((a, b) => b.count - a.count);

  const maxCount = data[0]?.count || 1;
  const total = completed.length;

  // Risk indicator
  const totalFlags = data.reduce((s, d) => s + d.count, 0);
  const avgFlagsPerGuard = total ? (totalFlags / total).toFixed(1) : 0;
  const riskLevel = avgFlagsPerGuard >= 3 ? { label: 'HIGH RISK', color: '#ef4444' } :
                    avgFlagsPerGuard >= 1.5 ? { label: 'MODERATE', color: '#f59e0b' } :
                    { label: 'LOW', color: '#22c55e' };
  const alertDiv = document.createElement('div');
  alertDiv.className = 'mb-4 p-3 rounded-lg flex items-center gap-3';
  alertDiv.style.cssText = `background:${riskLevel.color}15;border:1px solid ${riskLevel.color}40;`;
  alertDiv.innerHTML = `
    <span class="material-icons" style="color:${riskLevel.color};font-size:20px;">flag</span>
    <div>
      <div style="font-size:12.5px;font-weight:700;color:${riskLevel.color}">${riskLevel.label} supervision risk</div>
      <div style="font-size:11.5px;color:#64748b;">${avgFlagsPerGuard} avg flags per guard across ${total} records</div>
    </div>
  `;
  section.appendChild(alertDiv);

  data.forEach(d => {
    const pct = Math.round(d.count / maxCount * 100);
    const guardPct = total ? Math.round(d.count / total * 100) : 0;
    const barColor = guardPct >= 50 ? '#ef4444' : guardPct >= 25 ? '#f97316' : '#f59e0b';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(d.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${barColor};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${d.count} / ${total} (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  return section;
}

// ─── CHART: STAY FACTORS ──────────────────────────────────────────────
function renderStayFactorsChart(completed) {
  const section = makeSummarySection('Stay Factors', 'anchor', 'What could have made the guard stay?');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const data = STAY_FACTOR_FIELDS.map(label => {
    const fk = `sf_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    return { label, count: yesCount };
  }).sort((a, b) => b.count - a.count);

  const maxCount = data[0]?.count || 1;
  const total = completed.length;

  data.forEach(d => {
    const pct = Math.round(d.count / maxCount * 100);
    const guardPct = total ? Math.round(d.count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(d.label)}</span>
      <div class="bar-track"><div class="bar-fill bar-fill-green" style="width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${d.count} / ${total} (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  return section;
}

// ─── CHART: SERVICE LENGTH DISTRIBUTION ──────────────────────────────
function renderServiceLengthChart(completed) {
  const section = makeSummarySection('Length of Service at Exit', 'schedule', 'When do guards tend to leave?');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const options = LENGTH_OF_SERVICE_OPTIONS.filter(o => o !== '');
  const counts = {};
  options.forEach(o => counts[o] = 0);
  completed.forEach(r => { if (r.lengthOfService) counts[r.lengthOfService] = (counts[r.lengthOfService] || 0) + 1; });

  const total = completed.length;
  const maxCount = Math.max(...Object.values(counts), 1);

  const TENURE_COLORS = ['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6','#8b5cf6'];
  options.forEach((o, i) => {
    const c = counts[o];
    const pct = Math.round(c / maxCount * 100);
    const guardPct = total ? Math.round(c / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(o)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${TENURE_COLORS[i]};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${c} guards (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  // Insight: most common departure window
  const topTenure = options.reduce((a, b) => counts[a] >= counts[b] ? a : b);
  if (counts[topTenure] > 0) {
    const insight = document.createElement('div');
    insight.className = 'mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800';
    insight.innerHTML = `<span class="font-semibold">Insight:</span> Most guards leave during the <strong>${escHtml(topTenure)}</strong> tenure window (${counts[topTenure]} guard${counts[topTenure] > 1 ? 's' : ''}).`;
    section.appendChild(insight);
  }

  return section;
}

// ─── CHART: WOULD RECOMMEND (donut + breakdown) ───────────────────────
function renderRecommendChart(completed) {
  const section = makeSummarySection('Would Recommend Agency?', 'thumb_up', 'Guard advocacy and satisfaction indicator');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const counts = { Yes: 0, Maybe: 0, No: 0 };
  completed.forEach(r => { if (r.wouldRecommend && counts[r.wouldRecommend] !== undefined) counts[r.wouldRecommend]++; });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) { section.appendChild(emptyState('No data yet')); return section; }

  const colors = { Yes: '#22c55e', Maybe: '#f59e0b', No: '#ef4444' };

  const wrapper = document.createElement('div');
  wrapper.className = 'flex gap-6 items-center flex-wrap';

  // Donut
  let deg = 0;
  const segs = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => {
    const pct = c / total * 100;
    const start = deg;
    deg += pct * 3.6;
    return { label: k, count: c, pct, color: colors[k], start, end: deg };
  });
  const gradStr = segs.map(s => `${s.color} ${s.start.toFixed(1)}deg ${s.end.toFixed(1)}deg`).join(', ');
  const nps = total ? Math.round((counts.Yes - counts.No) / total * 100) : 0;
  const npsColor = nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444';

  const donutDiv = document.createElement('div');
  donutDiv.className = 'flex-shrink-0 flex flex-col items-center gap-2';
  donutDiv.innerHTML = `
    <div style="width:140px;height:140px;border-radius:50%;background:conic-gradient(${gradStr});position:relative;">
      <div style="position:absolute;inset:28px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:18px;font-weight:800;color:${npsColor}">${nps > 0 ? '+' : ''}${nps}%</span>
        <span style="font-size:10px;color:#94a3b8;">net score</span>
      </div>
    </div>
    <div style="font-size:11px;color:#64748b;text-align:center">Promoters minus Detractors</div>
  `;

  const bars = document.createElement('div');
  bars.style.flex = '1';
  Object.entries(counts).forEach(([label, count]) => {
    const pct = total ? Math.round(count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label" style="width:80px;font-weight:600;color:${colors[label]}">${escHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${colors[label]};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${count} (${pct}%)</span>
    `;
    bars.appendChild(row);
  });

  wrapper.appendChild(donutDiv);
  wrapper.appendChild(bars);
  section.appendChild(wrapper);
  return section;
}

// ─── CHART: RESIGNATIONS BY DETACHMENT ───────────────────────────────
function renderDetachmentChart(completed) {
  const section = makeSummarySection('Resignations by Detachment / Branch', 'location_on', 'Top branches with the most exit records (top 15 shown)');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const countMap = {};
  completed.forEach(r => {
    if (!r.detachment) return;
    countMap[r.detachment] = (countMap[r.detachment] || 0) + 1;
  });

  const data = Object.entries(countMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  if (!data.length) { section.appendChild(emptyState('No detachment data yet — fill in the Detachment field on guard records')); return section; }

  const maxCount = data[0].count;
  const total = completed.length;
  const totalDetachments = Object.keys(countMap).length;

  data.forEach((d, i) => {
    const barPct = Math.round(d.count / maxCount * 100);
    const guardPct = total ? Math.round(d.count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-rank">${i + 1}</span>
      <span class="bar-label">${escHtml(d.label)}</span>
      <div class="bar-track">
        <div class="bar-fill bar-fill-orange" data-pct="${barPct}" style="width:0%"></div>
      </div>
      <span class="bar-meta">${d.count} guard${d.count > 1 ? 's' : ''} (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  if (totalDetachments > 15) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:8px;text-align:center;';
    note.textContent = `Showing top 15 of ${totalDetachments} detachments`;
    section.appendChild(note);
  }

  return section;
}

// ─── SUMMARY SECTION HELPER ──────────────────────────────────────────
function makeSummarySection(title, icon, subtitle) {
  const div = document.createElement('div');
  div.className = 'summary-section';
  div.innerHTML = `
    <div class="summary-section-title">
      <span class="material-icons">${icon}</span>
      <div>
        <div>${escHtml(title)}</div>
        ${subtitle ? `<div style="font-size:11.5px;font-weight:400;color:#94a3b8;margin-top:1px;">${escHtml(subtitle)}</div>` : ''}
      </div>
    </div>
  `;
  return div;
}

function emptyState(msg = 'No completed records yet') {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<span class="material-icons">inbox</span>${escHtml(msg)}`;
  return div;
}

// ─── EXCEL EXPORT ────────────────────────────────────────────────────

function exportXLSX() {
  if (!window.XLSX) {
    alert('Excel export library not loaded. Please check your internet connection and try again.');
    return;
  }
  const XL = window.XLSX;
  const completed = records.filter(r => r.fullName && r.fullName.trim());
  const today = new Date().toISOString().slice(0, 10);

  // ── Helpers ────────────────────────────────────────────
  function xs(bg, fc = '1E293B', bold = false, align = 'left') {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { bold, color: { rgb: fc }, name: 'Calibri', sz: 10 },
      alignment: { vertical: 'center', horizontal: align, wrapText: false },
      border: {
        top:    { style: 'thin', color: { rgb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
        left:   { style: 'thin', color: { rgb: 'E2E8F0' } },
        right:  { style: 'thin', color: { rgb: 'E2E8F0' } },
      },
    };
  }
  function cell(v, style) {
    const t = typeof v === 'number' ? 'n' : 's';
    return { v: v === null || v === undefined ? '' : v, t, s: style };
  }
  function applyStyles(ws, rows) {
    rows.forEach((row, R) => {
      (row || []).forEach((c, C) => {
        if (!c || !c.s) return;
        const ref = XL.utils.encode_cell({ r: R, c: C });
        if (ws[ref]) ws[ref].s = c.s;
      });
    });
  }

  // ── Color maps (matches CSS table colors exactly) ─────
  const ER_BG  = { null:'F1F5F9', 0:'F8FAFC', 1:'FEF9C3', 2:'FEF3C7', 3:'FED7AA', 4:'FECACA', 5:'EF4444' };
  const ER_FC  = { null:'94A3B8', 0:'94A3B8', 1:'854D0E', 2:'92400E', 3:'9A3412', 4:'991B1B', 5:'FFFFFF' };
  const TI_BG  = { null:'F1F5F9', 1:'FECACA', 2:'FED7AA', 3:'FEF3C7', 4:'BBF7D0', 5:'22C55E' };
  const TI_FC  = { null:'94A3B8', 1:'991B1B', 2:'9A3412', 3:'92400E', 4:'14532D', 5:'FFFFFF' };
  const FR_BG  = { null:'F1F5F9', 0:'F8FAFC', 1:'FEF9C3', 2:'FED7AA', 3:'FECACA' };
  const FR_FC  = { null:'94A3B8', 0:'94A3B8', 1:'854D0E', 2:'9A3412', 3:'991B1B' };
  const GRP_HX = { 'Guard Info':'1E3A5F','Income & Payroll':'065F46','Exit Reasons':'7F1D1D','Stressors':'78350F','Supervision':'3B0764','Complaints':'164E63','Exit Summary':'14532D','Stay Factors':'1E3A5F','Trust Index':'4A1D96' };

  function cellStyleFor(col, raw) {
    if (col.type === 'scale-er') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(ER_BG[k] || 'F1F5F9', ER_FC[k] || '1E293B', true, 'center');
    }
    if (col.type === 'scale-ti') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(TI_BG[k] || 'F1F5F9', TI_FC[k] || '1E293B', true, 'center');
    }
    if (col.type === 'freq') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(FR_BG[k] || 'F1F5F9', FR_FC[k] || '1E293B', false, 'center');
    }
    if (col.type === 'yn') {
      if (raw === true)  return xs('DCFCE7', '14532D', true, 'center');
      if (raw === false) return xs('FEE2E2', '991B1B', false, 'center');
      return xs('F1F5F9', '94A3B8', false, 'center');
    }
    if (col.field === 'wouldRecommend') {
      if (raw === 'Yes')   return xs('DCFCE7', '14532D', true);
      if (raw === 'No')    return xs('FEE2E2', '991B1B', true);
      if (raw === 'Maybe') return xs('FEF9C3', '854D0E', true);
    }
    return xs('FFFFFF', '1E293B');
  }

  // ══════════════════════════════════════════════════════
  // SHEET 1: Records (one row per guard, all fields colored)
  // ══════════════════════════════════════════════════════
  const recRows = [];

  // Row 0 — Group header (merged per group)
  const grpRow = [cell('ID', xs('0F172A','FFFFFF', true, 'center'))];
  TABLE_GROUPS.forEach(g => {
    const hex = GRP_HX[g.name] || '1E3A5F';
    grpRow.push(cell(g.name.toUpperCase(), xs(hex, 'FFFFFF', true, 'center')));
    for (let s = 1; s < g.span; s++) grpRow.push(cell('', xs(hex, 'FFFFFF', true, 'center')));
  });
  recRows.push(grpRow);

  // Row 1 — Field labels
  const fldRow = [cell('#', xs('EFF6FF', '1D4ED8', true, 'center'))];
  TABLE_COLUMNS.forEach(col => fldRow.push(cell(col.label, xs('EFF6FF', '1D4ED8', true))));
  recRows.push(fldRow);

  // Data rows
  records.forEach((r, i) => {
    const row = [cell(String(i + 1).padStart(4, '0'), xs('F8FAFC', '64748B', false, 'center'))];
    TABLE_COLUMNS.forEach(col => {
      const raw = r[col.field];
      let display = raw;
      if (col.type === 'freq')  display = raw !== null && raw !== undefined ? FREQ_LABELS[raw] : '';
      else if (col.type === 'yn') display = raw === true ? 'Yes' : raw === false ? 'No' : '';
      else if (raw === null || raw === undefined) display = '';
      const style = cellStyleFor(col, raw);
      const v = display === null || display === undefined ? '' : display;
      row.push(cell(typeof v === 'number' ? v : String(v), style));
    });
    recRows.push(row);
  });

  const wsRec = XL.utils.aoa_to_sheet(recRows.map(r => r.map(c => c.v)));
  applyStyles(wsRec, recRows);

  // Merge group header cells
  const recMerges = [{ s:{r:0,c:0}, e:{r:0,c:0} }];
  let mc = 1;
  TABLE_GROUPS.forEach(g => {
    recMerges.push({ s:{r:0,c:mc}, e:{r:0,c:mc+g.span-1} });
    mc += g.span;
  });
  wsRec['!merges'] = recMerges;

  // Column widths
  wsRec['!cols'] = [
    { wch: 6 },
    ...TABLE_COLUMNS.map(col => ({
      wch: col.type === 'scale-er' || col.type === 'scale-ti' ? 6
         : col.type === 'freq'   ? 12
         : col.type === 'yn'     ? 7
         : col.type === 'number' ? 6
         : col.type === 'date'   ? 12
         : col.type === 'textarea' ? 22
         : Math.max(col.label.length + 2, Math.round(col.width / 7)),
    })),
  ];
  wsRec['!rows'] = [{ hpt: 20 }, { hpt: 16 }, ...records.map(() => ({ hpt: 15 }))];
  wsRec['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  // ══════════════════════════════════════════════════════
  // SHEET 2: Summary Analytics (all charts with colors)
  // ══════════════════════════════════════════════════════
  const sumRows = [];
  const H = (text, bg, fc='FFFFFF', span=1) => {
    const row = [cell(text, xs(bg, fc, true))];
    for (let i = 1; i < span; i++) row.push(cell('', xs(bg, fc)));
    return row;
  };
  const subH = (...labels) => labels.map(l => cell(l, xs('F1F5F9', '475569', true)));

  sumRows.push(H(`GUARD EXIT INTERVIEW — SUMMARY ANALYTICS  ·  ${COMPANIES[currentCompany].name}`, '1E293B', 'FFFFFF', 7));
  sumRows.push([cell(`Exported: ${today}  ·  ${records.length} records  ·  ${completed.length} completed`, xs('F8FAFC','64748B'))]);
  sumRows.push([]);

  // KPI
  const factors   = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const tScores   = completed.flatMap(r => TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null));
  const avgTrust  = tScores.length ? (tScores.reduce((a,b)=>a+b,0)/tScores.length).toFixed(2) : '—';
  const atNum     = parseFloat(avgTrust);
  sumRows.push(H('KEY PERFORMANCE INDICATORS', '1E3A5F', 'FFFFFF', 3));
  sumRows.push([cell('Metric',xs('EFF6FF','1D4ED8',true)), cell('Value',xs('EFF6FF','1D4ED8',true,'center')), cell('Notes',xs('EFF6FF','1D4ED8',true))]);
  sumRows.push([cell('Total Records',xs('FAFAFA','374151')), cell(records.length,xs('F8FAFC','1E293B',true,'center')), cell('',xs('FAFAFA','374151'))]);
  sumRows.push([cell('Completed',xs('FAFAFA','374151')), cell(completed.length,xs('F8FAFC','1E293B',true,'center')), cell(`${records.length?Math.round(completed.length/records.length*100):0}% rate`,xs('F8FAFC','64748B'))]);
  sumRows.push([cell('Top Exit Factor',xs('FAFAFA','374151')), cell(topFactor,xs('FEF9C3','92400E',true,'center')), cell('Most cited main factor',xs('F8FAFC','64748B'))]);
  const tBg = !isNaN(atNum) ? (atNum>=4?'DCFCE7':atNum>=3?'FEF9C3':'FEE2E2') : 'F1F5F9';
  const tFc = !isNaN(atNum) ? (atNum>=4?'14532D':atNum>=3?'92400E':'991B1B') : '94A3B8';
  sumRows.push([cell('Avg Trust Score',xs('FAFAFA','374151')), cell(avgTrust,xs(tBg,tFc,true,'center')), cell('out of 5.00',xs('F8FAFC','64748B'))]);
  sumRows.push([]);

  // Exit Reasons — By Category
  sumRows.push(H('EXIT REASONS — BY CATEGORY (sorted by frequency)', '7F1D1D', 'FFFFFF', 6));
  sumRows.push(subH('Category','Guards (any Yes)','% of Guards','Total Yes Checks','Most Cited Item',''));
  const erCatData = EXIT_REASON_CATEGORIES.map(cat => {
    const guardsWithCat = completed.filter(r => cat.items.some(label => r[`er_${key(label)}`] === true)).length;
    const totalYes = cat.items.reduce((sum, label) => sum + completed.filter(r => r[`er_${key(label)}`] === true).length, 0);
    const topItem = cat.items.reduce((best, label) => {
      const cnt = completed.filter(r => r[`er_${key(label)}`] === true).length;
      return cnt > best.cnt ? { label, cnt } : best;
    }, { label: '—', cnt: 0 });
    return { label: cat.label, guardsWithCat, totalYes, topItem };
  }).sort((a, b) => b.guardsWithCat - a.guardsWithCat);
  erCatData.forEach((d, i) => {
    const pct = completed.length ? Math.round(d.guardsWithCat / completed.length * 100) : 0;
    const bg = pct >= 50 ? 'FEE2E2' : pct >= 25 ? 'FEF9C3' : 'FAFAFA';
    const fc = pct >= 50 ? '991B1B' : pct >= 25 ? '92400E' : '374151';
    const rank = i === 0 ? '▶ TOP' : `#${i + 1}`;
    sumRows.push([cell(d.label, xs('FAFAFA','374151')), cell(d.guardsWithCat, xs(bg,fc,d.guardsWithCat>0,'center')), cell(`${pct}%`, xs(bg,fc,false,'center')), cell(d.totalYes, xs('F8FAFC','64748B',false,'center')), cell(d.topItem.cnt > 0 ? d.topItem.label : '—', xs('F8FAFC','374151',false)), cell(rank, xs(i===0?'FEF9C3':'F1F5F9', i===0?'92400E':'94A3B8', i===0, 'center'))]);
  });
  sumRows.push([]);

  // Exit Reasons — Individual Items
  sumRows.push(H('EXIT REASONS — INDIVIDUAL ITEMS (sorted by frequency)', '7F1D1D', 'FFFFFF', 6));
  sumRows.push(subH('Category','Exit Reason','Yes','No','N/A','% Guards'));
  EXIT_REASON_CATEGORIES.flatMap(cat =>
    cat.items.map(label => ({
      category: cat.label,
      label,
      yes: completed.filter(r => r[`er_${key(label)}`] === true).length,
      no:  completed.filter(r => r[`er_${key(label)}`] === false).length,
    }))
  ).sort((a, b) => b.yes - a.yes).forEach(d => {
    const na  = completed.length - d.yes - d.no;
    const pct = completed.length ? Math.round(d.yes / completed.length * 100) : 0;
    const bg  = pct >= 50 ? 'FEE2E2' : pct >= 25 ? 'FEF9C3' : 'FAFAFA';
    const fc  = pct >= 50 ? '991B1B' : pct >= 25 ? '92400E' : '374151';
    sumRows.push([cell(d.category, xs('F1F5F9','64748B',false)), cell(d.label, xs('FAFAFA','374151')), cell(d.yes, xs(d.yes>0?'FEE2E2':'F8FAFC', d.yes>0?'991B1B':'94A3B8', d.yes>0,'center')), cell(d.no, xs('F8FAFC','374151',false,'center')), cell(na, xs('F8FAFC','94A3B8',false,'center')), cell(`${pct}%`, xs(bg,fc,pct>0,'center'))]);
  });
  sumRows.push([]);

  // Income & Payroll
  sumRows.push(H('INCOME & PAYROLL', '065F46', 'FFFFFF', 6));
  sumRows.push(subH('Group','Item','Yes','No','N/A','% Yes'));
  [
    { label: 'Payroll Reliability',       fields: IP_PAYROLL_FIELDS },
    { label: 'Salary Understanding',       fields: IP_UNDERSTANDING_FIELDS },
    { label: 'Expectations vs Reality',    fields: IP_EXPECTATIONS_FIELDS },
  ].forEach(g => {
    g.fields.forEach(label => {
      const fk  = `ip_${key(label)}`;
      const yes = completed.filter(r => r[fk] === true).length;
      const no  = completed.filter(r => r[fk] === false).length;
      const na  = completed.length - yes - no;
      const pct = completed.length ? Math.round(yes / completed.length * 100) : 0;
      sumRows.push([cell(g.label, xs('F0FDF4','14532D',false)), cell(label, xs('FAFAFA','374151')), cell(yes, xs(yes>0?'DCFCE7':'F8FAFC', yes>0?'14532D':'94A3B8', yes>0,'center')), cell(no, xs(no>0?'FEE2E2':'F8FAFC', no>0?'991B1B':'94A3B8', false,'center')), cell(na, xs('F8FAFC','94A3B8',false,'center')), cell(`${pct}%`, xs(pct>=50?'FEE2E2':'FAFAFA', pct>=50?'991B1B':'374151', pct>=50,'center'))]);
    });
  });
  sumRows.push([]);

  // Trust Index
  sumRows.push(H('TRUST INDEX AVERAGES (1–5)', '4A1D96', 'FFFFFF', 5));
  sumRows.push(subH('Statement','Avg Score','/ 5','Guards','Interpretation'));
  TRUST_FIELDS.forEach(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg  = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    const k    = vals.length ? Math.round(avg) : 'null';
    const interp = avg>=4?'Agree':avg>=3?'Neutral':avg>0?'Disagree':'—';
    sumRows.push([cell(label,xs('FAFAFA','374151')), cell(vals.length?+avg.toFixed(2):'—',xs(TI_BG[k]||'F1F5F9',TI_FC[k]||'94A3B8',true,'center')), cell('/ 5',xs('F8FAFC','94A3B8',false,'center')), cell(vals.length,xs('F8FAFC','374151',false,'center')), cell(interp,xs('F8FAFC','64748B',false,'center'))]);
  });
  sumRows.push([]);

  // Operational Stressors
  sumRows.push(H('OPERATIONAL STRESSORS — FREQUENCY', '78350F', 'FFFFFF', 7));
  sumRows.push(subH('Stressor','Never','Sometimes','Often','Very Often','% V.Often','Severity'));
  OP_STRESSOR_FIELDS.forEach(label => {
    const fk    = `os_${key(label)}`;
    const vals  = completed.map(r => r[fk]).filter(v => v !== null);
    const cnts  = [0,1,2,3].map(i => vals.filter(v=>v===i).length);
    const voPct = vals.length ? Math.round(cnts[3]/vals.length*100) : 0;
    const sev   = voPct>=50?'CRITICAL':voPct>=25?'HIGH':voPct>=10?'MODERATE':'LOW';
    const sBg   = voPct>=50?'EF4444':voPct>=25?'FED7AA':voPct>=10?'FEF9C3':'F1F5F9';
    const sFc   = voPct>=50?'FFFFFF':voPct>=25?'9A3412':voPct>=10?'92400E':'94A3B8';
    sumRows.push([cell(label,xs('FAFAFA','374151')), cell(cnts[0],xs(FR_BG[0],'94A3B8',false,'center')), cell(cnts[1],xs(FR_BG[1],'854D0E',false,'center')), cell(cnts[2],xs(FR_BG[2],'9A3412',false,'center')), cell(cnts[3],xs(FR_BG[3],'991B1B',true,'center')), cell(`${voPct}%`,xs(sBg,sFc,true,'center')), cell(sev,xs(sBg,sFc,true,'center'))]);
  });
  sumRows.push([]);

  // Supervision Flags
  sumRows.push(H('SUPERVISION & POWER FLAGS', '3B0764', 'FFFFFF', 6));
  sumRows.push(subH('Flag','Yes','No','N/A','% Guards','Risk'));
  const svD = SUPERVISION_FLAGS.map(label => {
    const fk  = `sv_${key(label)}`;
    const yes = completed.filter(r=>r[fk]===true).length;
    const no  = completed.filter(r=>r[fk]===false).length;
    const pct = completed.length ? Math.round(yes/completed.length*100) : 0;
    return { label, yes, no, na:completed.length-yes-no, pct };
  }).sort((a,b)=>b.yes-a.yes);
  svD.forEach(d => {
    const rk  = d.pct>=50?'CRITICAL':d.pct>=25?'HIGH':d.pct>=10?'MODERATE':'LOW';
    const rBg = d.pct>=50?'EF4444':d.pct>=25?'FED7AA':d.pct>=10?'FEF9C3':'F1F5F9';
    const rFc = d.pct>=50?'FFFFFF':d.pct>=25?'9A3412':d.pct>=10?'92400E':'94A3B8';
    sumRows.push([cell(d.label,xs('FAFAFA','374151')), cell(d.yes,xs(d.yes>0?'FEE2E2':'F8FAFC',d.yes>0?'991B1B':'94A3B8',d.yes>0,'center')), cell(d.no,xs('F8FAFC','374151',false,'center')), cell(d.na,xs('F8FAFC','94A3B8',false,'center')), cell(`${d.pct}%`,xs(rBg,rFc,true,'center')), cell(rk,xs(rBg,rFc,true,'center'))]);
  });
  sumRows.push([]);

  // Stay Factors
  sumRows.push(H('STAY FACTORS', '14532D', 'FFFFFF', 6));
  sumRows.push(subH('Factor','Yes','No','N/A','% Guards','Priority'));
  STAY_FACTOR_FIELDS.map(label => {
    const fk  = `sf_${key(label)}`;
    const yes = completed.filter(r=>r[fk]===true).length;
    const no  = completed.filter(r=>r[fk]===false).length;
    const pct = completed.length ? Math.round(yes/completed.length*100) : 0;
    return { label, yes, no, na:completed.length-yes-no, pct };
  }).sort((a,b)=>b.yes-a.yes).forEach(d => {
    const pri = d.pct>=50?'HIGH':d.pct>=25?'MEDIUM':'LOW';
    const pBg = d.pct>=50?'22C55E':d.pct>=25?'BBF7D0':'F0FDF4';
    const pFc = d.pct>=50?'FFFFFF':'14532D';
    sumRows.push([cell(d.label,xs('FAFAFA','374151')), cell(d.yes,xs('DCFCE7','14532D',true,'center')), cell(d.no,xs('FEE2E2','991B1B',false,'center')), cell(d.na,xs('F8FAFC','94A3B8',false,'center')), cell(`${d.pct}%`,xs(pBg,pFc,true,'center')), cell(pri,xs(pBg,pFc,true,'center'))]);
  });
  sumRows.push([]);

  // Top Detachments / Branches
  const detCounts = {};
  completed.forEach(r => { if (r.detachment) detCounts[r.detachment] = (detCounts[r.detachment] || 0) + 1; });
  const detData = Object.entries(detCounts).map(([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count).slice(0, 20);
  if (detData.length > 0) {
    sumRows.push(H('TOP DETACHMENTS / BRANCHES — RESIGNATIONS', '431407', 'FFFFFF', 4));
    sumRows.push(subH('Rank','Detachment / Branch','Guard Count','% of Total'));
    detData.forEach((d, i) => {
      const pct = completed.length ? Math.round(d.count / completed.length * 100) : 0;
      const isTop = i === 0;
      const bg = isTop ? 'FEF3C7' : i < 3 ? 'FFF7ED' : 'FAFAFA';
      const fc = isTop ? '92400E' : '374151';
      const rank = i === 0 ? '🥇 #1' : i === 1 ? '🥈 #2' : i === 2 ? '🥉 #3' : `#${i+1}`;
      sumRows.push([cell(rank, xs(bg,fc,isTop,'center')), cell(d.label, xs(bg,fc,isTop)), cell(d.count, xs(bg,fc,isTop,'center')), cell(`${pct}%`, xs(bg,'64748B',false,'center'))]);
    });
    sumRows.push([]);
  }

  // Exit Type Distribution
  sumRows.push(H('EXIT TYPE DISTRIBUTION', '1E3A5F', 'FFFFFF', 4));
  sumRows.push(subH('Exit Type','Count','% of Total',''));
  const etC = {}; EXIT_TYPE_OPTIONS.forEach(t => etC[t]=0);
  completed.forEach(r => { if (r.typeOfExit) etC[r.typeOfExit]++; });
  const maxET = Math.max(...Object.values(etC), 1);
  EXIT_TYPE_OPTIONS.forEach(t => {
    const c2 = etC[t];
    const pct = completed.length ? Math.round(c2/completed.length*100) : 0;
    const isTop = c2 === maxET && c2 > 0;
    const bg = isTop ? 'DBEAFE' : 'FAFAFA';
    sumRows.push([cell(t,xs(bg,'374151',isTop)), cell(c2,xs(bg,'1D4ED8',isTop,'center')), cell(`${pct}%`,xs(bg,'64748B',false,'center')), cell(isTop?'◄ Most common':'',xs(bg,'2563EB',false))]);
  });
  sumRows.push([]);

  // Would Recommend / NPS
  const recC = { Yes:0, Maybe:0, No:0 };
  completed.forEach(r => { if (recC[r.wouldRecommend]!==undefined) recC[r.wouldRecommend]++; });
  const recT  = recC.Yes+recC.Maybe+recC.No;
  const nps   = recT ? Math.round((recC.Yes-recC.No)/recT*100) : 0;
  const npslb = nps>=50?'EXCELLENT':nps>=20?'GOOD':nps>=0?'NEUTRAL':'POOR';
  const nBg   = nps>=20?'DCFCE7':nps>=0?'FEF9C3':'FEE2E2';
  const nFc   = nps>=20?'14532D':nps>=0?'92400E':'991B1B';
  sumRows.push(H('WOULD RECOMMEND AGENCY? — NET PROMOTER SCORE', '1E3A5F', 'FFFFFF', 4));
  sumRows.push([cell(`NPS: ${nps>0?'+':''}${nps}  [${npslb}]`,xs(nBg,nFc,true,'center')), cell('Promoters − Detractors ÷ Total Responses',xs('F8FAFC','64748B'))]);
  [['Yes','Promoter','DCFCE7','14532D'],['Maybe','Passive','FEF9C3','854D0E'],['No','Detractor','FEE2E2','991B1B']].forEach(([k,role,bg,fc]) => {
    const cnt = recC[k];
    const pct = recT ? Math.round(cnt/recT*100) : 0;
    sumRows.push([cell(k,xs(bg,fc,true)), cell(cnt,xs(bg,fc,true,'center')), cell(`${pct}%`,xs('F8FAFC','64748B',false,'center')), cell(role,xs('F8FAFC','94A3B8',false))]);
  });

  // Build summary sheet
  const wsSum = XL.utils.aoa_to_sheet(sumRows.map(row => (row||[]).map(c => c ? c.v : '')));
  applyStyles(wsSum, sumRows);
  wsSum['!cols'] = [{ wch:14 },{ wch:36 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:16 }];

  // ── Write workbook ────────────────────────────────────
  const wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, wsRec, 'Records');
  XL.utils.book_append_sheet(wb, wsSum, 'Summary Analytics');
  const companySlug = COMPANIES[currentCompany].name.replace(/\s+/g, '_');
  XL.writeFile(wb, `Exit_Interview_${companySlug}_${today}.xlsx`);
}

// Keep nullStr / boolStr used by legacy code paths
function nullStr(v) { return v !== null && v !== undefined ? String(v) : ''; }
function boolStr(v) { return v === true ? 'Yes' : v === false ? 'No' : ''; }

// (Legacy CSV kept for reference — no longer wired to UI)
function exportCSV() {
  const completed = records.filter(r => r.fullName && r.fullName.trim());
  const total = records.length;
  const today = new Date().toISOString().slice(0, 10);

  const rows = [];

  // ── SHEET 1: Raw Record Data ──────────────────────────────────────
  rows.push(['=== RAW INTERVIEW DATA ===', `Exported: ${today}`, `Total Records: ${total}`, `Completed: ${completed.length}`]);
  rows.push([]);

  const headers = [
    'Guard ID', 'Full Name', 'Age', 'Gender', 'Rank/Position', 'Detachment/Post',
    'Length of Service', 'Type of Exit', 'Date of Exit',
    ...EXIT_REASON_FIELDS.map(f => `ExitReason: ${f}`),
    ...OP_STRESSOR_FIELDS.map(f => `Stressor: ${f}`),
    ...SUPERVISION_FLAGS.map(f => `Supervision: ${f}`),
    'Safe to Speak Up',
    ...COMPLAINT_FLAGS.map(f => `Complaint: ${f}`),
    'Main Exit Factor', 'Secondary Factor', 'Breaking Point', 'Would Recommend',
    ...STAY_FACTOR_FIELDS.map(f => `Stay: ${f}`),
    'Other Suggestions',
    ...TRUST_FIELDS.map(f => `Trust: ${f}`),
  ];
  rows.push(headers);

  records.forEach((r, i) => {
    const row = [
      String(i + 1).padStart(4, '0'),
      r.fullName || '', r.age || '', r.gender || '', r.rankPosition || '',
      r.detachment || '', r.lengthOfService || '', r.typeOfExit || '', r.dateOfExit || '',
      ...EXIT_REASON_FIELDS.map(f => nullStr(r[`er_${key(f)}`])),
      ...OP_STRESSOR_FIELDS.map(f => {
        const v = r[`os_${key(f)}`];
        return v !== null && v !== undefined ? FREQ_LABELS[v] || v : '';
      }),
      ...SUPERVISION_FLAGS.map(f => boolStr(r[`sv_${key(f)}`])),
      r.safeToSpeak || '',
      ...COMPLAINT_FLAGS.map(f => boolStr(r[`cp_${key(f)}`])),
      r.mainExitFactor || '', r.secondaryFactor || '',
      (r.breakingPoint || '').replace(/\n/g, ' '),
      r.wouldRecommend || '',
      ...STAY_FACTOR_FIELDS.map(f => boolStr(r[`sf_${key(f)}`])),
      (r.otherSuggestions || '').replace(/\n/g, ' '),
      ...TRUST_FIELDS.map(f => nullStr(r[`ti_${key(f)}`])),
    ];
    rows.push(row);
  });

  // ── KPI SUMMARY ──────────────────────────────────────────────────
  rows.push([]);
  rows.push([]);
  rows.push(['╔══════════════════════════════════════════════════╗']);
  rows.push(['║              SUMMARY ANALYTICS                  ║']);
  rows.push(['╚══════════════════════════════════════════════════╝']);
  rows.push([]);

  const factors = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const trustScores = completed.flatMap(r =>
    TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null)
  );
  const avgTrust = trustScores.length
    ? (trustScores.reduce((a, b) => a + b, 0) / trustScores.length).toFixed(2)
    : '—';
  const trustLevel = avgTrust !== '—'
    ? (parseFloat(avgTrust) >= 4 ? 'HIGH TRUST' : parseFloat(avgTrust) >= 3 ? 'MODERATE TRUST' : 'LOW TRUST')
    : '—';

  rows.push(['KEY PERFORMANCE INDICATORS']);
  rows.push(['Metric', 'Value', 'Notes']);
  rows.push(['Total Records', total, '']);
  rows.push(['Completed Records', completed.length, `${total ? Math.round(completed.length / total * 100) : 0}% completion rate`]);
  rows.push(['Top Exit Factor', topFactor, 'Most cited main exit factor']);
  rows.push(['Average Trust Score', avgTrust, `out of 5.00 — ${trustLevel}`]);

  // ── CHART 1: Top Exit Reasons ─────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 1 — TOP EXIT REASONS', '', '', '', 'Scale: 0 (Not a factor) → 5 (Major)']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Rank', 'Exit Reason', 'Bar (out of max score)', 'Total Score', 'Guards', 'Avg / Guard', 'Severity']);

  const erData = EXIT_REASON_FIELDS.map(label => {
    const fk = `er_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const totalScore = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length ? totalScore / vals.length : 0;
    return { label, totalScore, count: vals.length, avg };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const maxER = erData[0]?.totalScore || 1;
  erData.forEach((d, i) => {
    const sev = d.avg >= 4 ? 'CRITICAL' : d.avg >= 3 ? 'HIGH' : d.avg >= 2 ? 'MODERATE' : d.avg >= 1 ? 'LOW' : 'NEGLIGIBLE';
    rows.push([
      `#${i + 1}`,
      d.label,
      asciiBar(d.totalScore, maxER),
      d.totalScore,
      `${d.count} guards`,
      d.count ? d.avg.toFixed(2) : '—',
      sev,
    ]);
  });
  if (!completed.length) rows.push(['', '(No completed records)', '', '', '', '', '']);

  // ── CHART 2: Exit Type Distribution ──────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 2 — EXIT TYPE DISTRIBUTION']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Exit Type', 'Bar', 'Count', '% of Total', 'Notes']);

  const etCounts = {};
  EXIT_TYPE_OPTIONS.forEach(t => etCounts[t] = 0);
  completed.forEach(r => { if (r.typeOfExit) etCounts[r.typeOfExit] = (etCounts[r.typeOfExit] || 0) + 1; });
  const maxET = Math.max(...Object.values(etCounts), 1);
  EXIT_TYPE_OPTIONS.forEach(t => {
    const c = etCounts[t];
    const pct = completed.length ? Math.round(c / completed.length * 100) : 0;
    rows.push([t, asciiBar(c, maxET), c, `${pct}%`, c === Math.max(...Object.values(etCounts)) && c > 0 ? '◄ Most common' : '']);
  });
  if (!completed.length) rows.push(['(No completed records)', '', '', '', '']);

  // ── CHART 3: Trust Index Averages ─────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 3 — TRUST INDEX AVERAGES', '', '', '', 'Scale: 1 (Strongly Disagree) → 5 (Strongly Agree)']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const tiData = TRUST_FIELDS.map(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label, avg: +avg.toFixed(2), count: vals.length };
  });
  const tiWithData = tiData.filter(d => d.count > 0);
  const overallTrust = tiWithData.length
    ? (tiWithData.reduce((a, b) => a + b.avg, 0) / tiWithData.length).toFixed(2)
    : '—';
  const tLevel = overallTrust !== '—'
    ? (parseFloat(overallTrust) >= 4 ? 'HIGH TRUST ▲' : parseFloat(overallTrust) >= 3 ? 'MODERATE TRUST ●' : 'LOW TRUST ▼')
    : '—';
  rows.push([`Overall Trust Score: ${overallTrust} / 5.00   [${tLevel}]`]);
  rows.push(['Statement', 'Bar (out of 5)', 'Avg Score', 'Guards Responded', 'Interpretation']);

  tiData.forEach(d => {
    const interp = d.avg >= 4 ? 'Agree' : d.avg >= 3 ? 'Neutral' : d.avg > 0 ? 'Disagree' : '—';
    rows.push([
      d.label,
      d.count ? asciiBar(d.avg, 5) : '(no data)',
      d.count ? `${d.avg} / 5` : '—',
      d.count,
      interp,
    ]);
  });
  if (!completed.length) rows.push(['(No completed records)']);

  // ── CHART 4: Operational Stressors ───────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 4 — OPERATIONAL STRESSORS', '', '', '', 'Frequency breakdown per stressor']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Stressor', 'Frequency Bar', 'Never', 'Sometimes', 'Often', 'Very Often', '% Very Often', 'Severity']);

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    if (!vals.length) { rows.push([label, '(no data)', '', '', '', '', '', '']); return; }
    const counts = [0, 1, 2, 3].map(i => vals.filter(v => v === i).length);
    const voPct = Math.round(counts[3] / vals.length * 100);
    // Stacked ASCII: weight each segment
    const barFilled = Math.round((counts[2] + counts[3]) / vals.length * 20);
    const barMid = Math.round(counts[1] / vals.length * 20);
    const barEmpty = Math.max(0, 20 - barFilled - barMid);
    const stressBar = '█'.repeat(barFilled) + '▒'.repeat(barMid) + '░'.repeat(barEmpty);
    const sev = voPct >= 50 ? 'CRITICAL' : voPct >= 25 ? 'HIGH' : voPct >= 10 ? 'MODERATE' : 'LOW';
    rows.push([label, stressBar, counts[0], counts[1], counts[2], counts[3], `${voPct}%`, sev]);
  });
  rows.push(['', 'Legend: █ = Often/Very Often  ▒ = Sometimes  ░ = Never']);

  // ── CHART 5: Supervision & Power Flags ───────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 5 — SUPERVISION & POWER FLAGS', '', '', 'Yes = issue was reported by guard']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const svData = SUPERVISION_FLAGS.map(label => {
    const fk = `sv_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  }).sort((a, b) => b.yesCount - a.yesCount);

  const totalSvFlags = svData.reduce((s, d) => s + d.yesCount, 0);
  const avgFlags = completed.length ? (totalSvFlags / completed.length).toFixed(1) : '0';
  const riskLevel = parseFloat(avgFlags) >= 3 ? 'HIGH RISK' : parseFloat(avgFlags) >= 1.5 ? 'MODERATE RISK' : 'LOW RISK';
  rows.push([`Risk Level: ${riskLevel}   Avg flags per guard: ${avgFlags}   Total flag instances: ${totalSvFlags}`]);
  rows.push([]);
  rows.push(['Flag', 'Bar', 'Yes', 'No', 'N/A', '% of Guards', 'Risk']);

  const maxSV = svData[0]?.yesCount || 1;
  svData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    const risk = d.pct >= 50 ? 'CRITICAL' : d.pct >= 25 ? 'HIGH' : d.pct >= 10 ? 'MODERATE' : 'LOW';
    rows.push([d.label, asciiBar(d.yesCount, maxSV), d.yesCount, d.noCount, na, `${d.pct}%`, risk]);
  });

  // Safe to Speak Up breakdown
  const speakCounts = { Yes: 0, Somewhat: 0, No: 0 };
  completed.forEach(r => { if (r.safeToSpeak && speakCounts[r.safeToSpeak] !== undefined) speakCounts[r.safeToSpeak]++; });
  rows.push([]);
  rows.push(['Safe to Speak Up?', 'Yes', 'Somewhat', 'No']);
  rows.push(['', speakCounts.Yes, speakCounts.Somewhat, speakCounts.No]);

  // ── CHART 6: Stay Factors ─────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 6 — STAY FACTORS', '', '', 'What could have made the guard stay?']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Stay Factor', 'Bar', 'Yes', 'No', 'N/A', '% of Guards', 'Priority']);

  const sfData = STAY_FACTOR_FIELDS.map(label => {
    const fk = `sf_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  }).sort((a, b) => b.yesCount - a.yesCount);

  const maxSF = sfData[0]?.yesCount || 1;
  sfData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    const priority = d.pct >= 50 ? 'HIGH' : d.pct >= 25 ? 'MEDIUM' : 'LOW';
    rows.push([d.label, asciiBar(d.yesCount, maxSF), d.yesCount, d.noCount, na, `${d.pct}%`, priority]);
  });
  if (!completed.length) rows.push(['(No completed records)', '', '', '', '', '', '']);

  // ── CHART 7: Service Length at Exit ──────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 7 — LENGTH OF SERVICE AT EXIT', '', '', 'When do guards tend to leave?']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Tenure Window', 'Bar', 'Guards', '% of Total', '']);

  const tenureOptions = LENGTH_OF_SERVICE_OPTIONS.filter(o => o !== '');
  const tenureCounts = {};
  tenureOptions.forEach(o => tenureCounts[o] = 0);
  completed.forEach(r => { if (r.lengthOfService) tenureCounts[r.lengthOfService] = (tenureCounts[r.lengthOfService] || 0) + 1; });
  const maxTenure = Math.max(...Object.values(tenureCounts), 1);
  const topTenure = tenureOptions.reduce((a, b) => tenureCounts[a] >= tenureCounts[b] ? a : b);

  tenureOptions.forEach(o => {
    const c = tenureCounts[o];
    const pct = completed.length ? Math.round(c / completed.length * 100) : 0;
    rows.push([o, asciiBar(c, maxTenure), c, `${pct}%`, c > 0 && o === topTenure ? '◄ Peak exit window' : '']);
  });
  if (tenureCounts[topTenure] > 0) {
    rows.push([]);
    rows.push([`INSIGHT: Most guards leave during the "${topTenure}" window (${tenureCounts[topTenure]} guard${tenureCounts[topTenure] > 1 ? 's' : ''}). Consider targeted retention at this stage.`]);
  }

  // ── CHART 8: Would Recommend ──────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 8 — WOULD RECOMMEND AGENCY?', '', '', 'Guard advocacy & satisfaction indicator']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const recCounts = { Yes: 0, Maybe: 0, No: 0 };
  completed.forEach(r => { if (r.wouldRecommend && recCounts[r.wouldRecommend] !== undefined) recCounts[r.wouldRecommend]++; });
  const recTotal = recCounts.Yes + recCounts.Maybe + recCounts.No;
  const nps = recTotal ? Math.round((recCounts.Yes - recCounts.No) / recTotal * 100) : 0;
  const npsLabel = nps >= 50 ? 'EXCELLENT' : nps >= 20 ? 'GOOD' : nps >= 0 ? 'NEUTRAL' : 'POOR';
  rows.push([`Net Promoter Score (NPS): ${nps > 0 ? '+' : ''}${nps}   [${npsLabel}]   (Promoters − Detractors ÷ Total)`]);
  rows.push([]);
  rows.push(['Response', 'Bar', 'Count', '% of Total', 'Role in NPS']);

  const maxRec = Math.max(recCounts.Yes, recCounts.Maybe, recCounts.No, 1);
  [['Yes', 'Promoter'], ['Maybe', 'Passive'], ['No', 'Detractor']].forEach(([label, role]) => {
    const c = recCounts[label];
    const pct = recTotal ? Math.round(c / recTotal * 100) : 0;
    rows.push([label, asciiBar(c, maxRec), c, `${pct}%`, role]);
  });

  // ── COMPLAINT HANDLING ────────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['COMPLAINT HANDLING — SUMMARY']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Item', 'Bar (Yes responses)', 'Yes', 'No', 'N/A', '% Yes']);

  const cpData = COMPLAINT_FLAGS.map(label => {
    const fk = `cp_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  });
  const maxCP = Math.max(...cpData.map(d => d.yesCount), 1);
  cpData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    rows.push([d.label, asciiBar(d.yesCount, maxCP), d.yesCount, d.noCount, na, `${d.pct}%`]);
  });

  // ── FOOTER ────────────────────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push([`Guard Exit Interview Tracker — Report generated ${today} — ${completed.length} completed records`]);
  rows.push(['Bar key: █ = filled  ░ = empty  ▒ = partial (stressors only)']);

  const csvStr = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Exit_Interview_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function nullStr(v) { return v !== null && v !== undefined ? String(v) : ''; }
function boolStr(v) { return v === true ? 'Yes' : v === false ? 'No' : ''; }

// ─── MODAL ────────────────────────────────────────────────────────────
function showModal(title, body, onConfirm) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${escHtml(title)}</div>
      <div class="modal-body">${escHtml(body)}</div>
      <div class="modal-actions">
        <button class="btn-modal-cancel">Cancel</button>
        <button class="btn-modal-confirm">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.btn-modal-cancel').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('.btn-modal-confirm').addEventListener('click', () => { backdrop.remove(); onConfirm(); });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

// ─── UTILS ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mode(arr) {
  const freq = {};
  arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
}

// ─── BOOT ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
