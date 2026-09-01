// Every recipe on the site lives here. To add one, copy a block and fill it in —
// nothing else needs editing. Ingredient and step icons are chosen automatically
// from the words you use, so just write normally.
//
//   category: 'beef' | 'chicken' | 'pork' | 'fish' | 'shrimp' | 'others'
//   photo:    a file in img/ — 3:2 crop looks best
//   credit:   only needed for a photo that is not yours; omit it for your own

window.CATEGORIES = [
  { id: 'beef',    label: 'Beef' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'pork',    label: 'Pork' },
  { id: 'fish',    label: 'Fish' },
  { id: 'shrimp',  label: 'Shrimp' },
  { id: 'others',  label: 'Others' }
];

window.RECIPES = [
  {
    "slug": "nilaga",
    "category": "pork",
    "title": "Nilagang Baboy",
    "short": "Nilagang Baboy",
    "time": "1 hr 45 min",
    "serves": "5–6",
    "keys": "saba · patatas · repolyo · pechay · mais",
    "photo": "img/nilaga.jpg",
    "credit": {
      "by": "Obsidian Soul",
      "license": "CC0",
      "url": "https://commons.wikimedia.org/wiki/File:NIlagang_baboy_(Philippines).jpg"
    },
    "ingredients": [
      "<span class=\"amt\">1 kg</span> kasim, 2-inch cubes, fat trimmed",
      "<span class=\"amt\">2.5 L</span> water",
      "<span class=\"amt\">1</span> large onion, quartered",
      "<span class=\"amt\">1 tbsp</span> whole peppercorns, lightly crushed",
      "<span class=\"amt\">2</span> saba, peeled, cut in thirds",
      "<span class=\"amt\">2</span> medium potatoes, quartered",
      "<span class=\"amt\">1</span> corn on the cob, cut in 4",
      "<span class=\"amt\">¼</span> head repolyo, in wedges",
      "<span class=\"amt\">1</span> bunch pechay, separated",
      "<span class=\"amt\">½ tsp</span> salt"
    ],
    "steps": [
      "<strong>Blanch first.</strong> Cover the kasim with cold water, bring to a boil, then drain and rinse the meat. Wash the pot. This takes out the scum and a lot of the fat. You do lose a little flavor with that first water, but the meat gives most of it back over the hour that follows.",
      "Return the meat to the clean pot with 2.5 L fresh water. Boil, then drop to a bare simmer.",
      "Add onion and peppercorns. Simmer uncovered <span class=\"time\">60–75 min</span>, skimming fat as it rises, until a fork goes in with no resistance.",
      "Tilt the pot and spoon off the fat on top.",
      "Add potatoes, saba, and corn. Simmer <span class=\"time\">10 min</span>.",
      "Add repolyo. Simmer <span class=\"time\">5 min</span>.",
      "Add pechay, kill the heat, cover <span class=\"time\">2 min</span>. Residual heat is enough.",
      "Taste, then season. Serve with patis, calamansi, and crushed siling labuyo on the side."
    ],
    "notes": [
      "Ayaw mong mawala ang unang sabaw? Skip the blanch. Just skim the gray scum off with a spoon for the first 10 minutes instead — you keep everything the meat gives up, the broth is only cloudier and fattier. Blanching is for a clear, clean-tasting broth; skimming is for a richer one.",
      "Better the next day — the fat solidifies overnight and lifts off whole."
    ]
  },
  {
    "slug": "sinigang",
    "category": "pork",
    "title": "Pork Sinigang sa Sampalok",
    "short": "Sinigang sa Sampalok",
    "time": "1 hr 30 min",
    "serves": "5–6",
    "keys": "sampalok o kamias · labanos · sitaw · okra · kangkong",
    "photo": "img/sinigang.jpg",
    "credit": {
      "by": "Joy D. Ganaden",
      "license": "CC BY-SA 4.0",
      "url": "https://commons.wikimedia.org/wiki/File:Sinigang_na_Baboy_DSCF4234.jpg"
    },
    "ingredients": [
      "<span class=\"amt\">1 kg</span> kasim, 2-inch cubes, fat trimmed",
      "<span class=\"amt\">2.5 L</span> water",
      "<span class=\"amt\">250 g</span> fresh sampalok (12–15 pods), or 10–12 kamias, or ½ cup calamansi juice",
      "<span class=\"amt\">1</span> large onion, quartered",
      "<span class=\"amt\">3</span> tomatoes, quartered",
      "<span class=\"amt\">1</span> labanos, sliced into coins",
      "<span class=\"amt\">10</span> pcs sitaw, 2-inch lengths",
      "<span class=\"amt\">8</span> pcs okra, tops trimmed",
      "<span class=\"amt\">2</span> siling haba",
      "<span class=\"amt\">1</span> large bunch kangkong",
      "<span class=\"amt\">½ tsp</span> salt"
    ],
    "steps": [
      "<strong>Make the souring agent first.</strong> Boil the sampalok in 2 cups water <span class=\"time\">10–12 min</span> until the pods split. Mash with the back of a spoon, push through a strainer, discard skins and seeds. Kamias gets the same treatment; with calamansi, skip this and add the juice at the end.",
      "Blanch the kasim — boil, drain, rinse, wash the pot.",
      "Simmer the meat in 2.5 L fresh water with onion and tomatoes, uncovered <span class=\"time\">60–75 min</span>, skimming fat, until tender.",
      "Mash the softened tomatoes against the side of the pot.",
      "Pour in the sampalok extract, simmer <span class=\"time\">5 min</span>, then taste. Add more extract or calamansi until it is as sour as you want it.",
      "Add labanos. Simmer <span class=\"time\">5 min</span>.",
      "Add sitaw and okra. Simmer <span class=\"time\">4 min</span>.",
      "Add siling haba and kangkong. Heat off, cover <span class=\"time\">2 min</span>.",
      "Taste and season."
    ],
    "notes": [
      "Fresh sampalok gives a rounder sourness than kamias; calamansi is the quickest of the three and goes in last so it does not turn bitter."
    ]
  },
  {
    "slug": "tinola",
    "category": "pork",
    "title": "Tinolang Baboy",
    "short": "Tinolang Baboy",
    "time": "1 hr 30 min",
    "serves": "5",
    "keys": "luya · sayote o green papaya · malunggay",
    "photo": "img/tinola.jpg",
    "credit": {
      "by": "Martin Michlmayr",
      "license": "CC BY-SA 4.0",
      "url": "https://commons.wikimedia.org/wiki/File:Parrt_Ebelle_Tinola_2025-08-05_007.jpg"
    },
    "ingredients": [
      "<span class=\"amt\">1 kg</span> kasim, 1½-inch cubes, fat trimmed",
      "<span class=\"amt\">1½</span> thumbs ginger, peeled and julienned",
      "<span class=\"amt\">6</span> cloves garlic, crushed",
      "<span class=\"amt\">1</span> onion, sliced",
      "<span class=\"amt\">2 L</span> hugas bigas (second rice wash), or water",
      "<span class=\"amt\">1</span> large sayote, or ½ green papaya, in wedges",
      "<span class=\"amt\">2 cups</span> malunggay leaves or dahon ng sili",
      "<span class=\"amt\">1 tsp</span> neutral oil",
      "<span class=\"amt\">½ tsp</span> salt"
    ],
    "steps": [
      "Heat the oil. Sauté the ginger <strong>alone</strong> for <span class=\"time\">1–2 min</span> until it smells sharp and toasty.",
      "Add garlic, then onion. Cook until the onion is soft.",
      "Add the kasim. Sear and stir <span class=\"time\">5 min</span> until it loses its raw color and starts to catch on the pot.",
      "Pour in the hugas bigas. Boil, skim the scum, then lower to a simmer.",
      "Simmer covered <span class=\"time\">60–70 min</span> until tender, skimming fat once or twice along the way.",
      "Add sayote or green papaya. Simmer <span class=\"time\">8–10 min</span> — just tender, not mushy.",
      "Add malunggay or dahon ng sili. Heat off immediately, cover <span class=\"time\">2 min</span>.",
      "Taste and season."
    ],
    "notes": [
      "Use the second rice wash, not the first. Green papaya is sweeter than sayote and carries the ginger better."
    ]
  },
  {
    "slug": "menudo",
    "category": "pork",
    "title": "Pork Menudo <span class=\"slash\">/</span> Afritada",
    "short": "Menudo / Afritada",
    "time": "1 hr 30 min",
    "serves": "6",
    "keys": "kamatis · patatas · carrots · bell pepper · green peas",
    "photo": "img/menudo.jpg",
    "credit": {
      "by": "ShmilyDigital",
      "license": "CC BY-SA 4.0",
      "url": "https://commons.wikimedia.org/wiki/File:Pork_Menudo_(Filipino_Pork_Stew).jpg"
    },
    "ingredients": [
      "<span class=\"amt\">1 kg</span> kasim, ¾-inch cubes, fat trimmed",
      "<span class=\"amt\">6</span> ripe tomatoes, chopped",
      "<span class=\"amt\">1 cup</span> tomato sauce, or 3 tbsp tomato paste + 1 cup water",
      "<span class=\"amt\">3 tbsp</span> calamansi juice",
      "<span class=\"amt\">1</span> onion chopped, <span class=\"amt\">6</span> cloves garlic minced",
      "<span class=\"amt\">2</span> bay leaves",
      "<span class=\"amt\">2</span> potatoes and <span class=\"amt\">2</span> carrots, cubed",
      "<span class=\"amt\">1</span> red and <span class=\"amt\">1</span> green bell pepper, in squares",
      "<span class=\"amt\">1 cup</span> green peas",
      "<span class=\"amt\">1 tbsp</span> neutral oil, <span class=\"amt\">1½ cups</span> water",
      "<span class=\"amt\">½ tsp</span> salt, <span class=\"amt\">¼ tsp</span> black pepper"
    ],
    "steps": [
      "Toss the kasim with the calamansi juice and black pepper. Rest <span class=\"time\">20 min</span> while you chop everything else.",
      "Heat oil, sauté garlic and onion until soft.",
      "Add the chopped tomatoes and cook them down <span class=\"time\">8–10 min</span>, mashing as you go, until they collapse into a rough paste and the oil separates.",
      "Add the pork, stir and sear <span class=\"time\">5 min</span>.",
      "Add tomato sauce, water, bay leaves. Boil, then simmer covered <span class=\"time\">50–60 min</span> until fork-tender, splashing in water if it dries out.",
      "Add potatoes and carrots. Simmer <span class=\"time\">12 min</span>.",
      "Add bell peppers and green peas. Simmer <span class=\"time\">5 min</span> — the peppers should keep a bite.",
      "Taste and season. Rest off the heat <span class=\"time\">10 min</span> before serving; it thickens and the flavor settles."
    ],
    "notes": [
      "Raisins and chopped hard-boiled egg are traditional in menudo. Afritada is the same recipe with bigger pork chunks and no liver."
    ]
  },
  {
    "slug": "ginataan",
    "category": "pork",
    "title": "Ginataang Kasim, Kalabasa at Sitaw",
    "short": "Ginataang Kasim",
    "time": "1 hr 15 min",
    "serves": "5",
    "keys": "gata · kalabasa · sitaw · siling haba",
    "photo": "img/ginataan.jpg",
    "credit": {
      "by": "Obsidian Soul",
      "license": "CC BY-SA 4.0",
      "url": "https://commons.wikimedia.org/wiki/File:Ginataang_kalabasa_(Philippines).jpg"
    },
    "ingredients": [
      "<span class=\"amt\">800 g</span> kasim, 1-inch cubes, fat trimmed",
      "<span class=\"amt\">1</span> thumb ginger, julienned",
      "<span class=\"amt\">6</span> cloves garlic minced, <span class=\"amt\">1</span> onion sliced",
      "<span class=\"amt\">400 ml</span> kakang gata (first press), or 1 can",
      "<span class=\"amt\">200 ml</span> water or thin second-press gata",
      "<span class=\"amt\">400 g</span> kalabasa, 1½-inch chunks",
      "<span class=\"amt\">12</span> pcs sitaw, 2-inch lengths",
      "<span class=\"amt\">3</span> siling haba, <span class=\"amt\">1 tsp</span> neutral oil",
      "<span class=\"amt\">¼ tsp</span> salt"
    ],
    "steps": [
      "Sauté ginger in the oil <span class=\"time\">1 min</span>, then garlic and onion until soft.",
      "Add the kasim and sear <span class=\"time\">5 min</span>.",
      "Pour in the water or thin gata, cover, simmer <span class=\"time\">45–55 min</span> until tender. <strong>The thick gata goes in later</strong> — it splits if boiled too long.",
      "Add kalabasa and the thick gata. Simmer uncovered on low <span class=\"time\">10–12 min</span>, stirring gently and often. Never let it hit a hard boil.",
      "As the kalabasa softens, mash 2–3 pieces against the side of the pot to thicken the sauce.",
      "Add sitaw and siling haba. Simmer <span class=\"time\">5 min</span> until the sitaw is bright green and just tender.",
      "Taste and season."
    ],
    "notes": [
      "Fresh gata from the palengke splits less than canned. Either way, keep it at a low simmer once it goes in."
    ]
  },
  {
    "slug": "pinakbet",
    "category": "pork",
    "title": "Nilaga with Pinakbet-Style Vegetables",
    "short": "Nilaga, Pinakbet-Style",
    "time": "1 hr 45 min",
    "serves": "6",
    "keys": "kalabasa · ampalaya · talong · okra · sitaw",
    "photo": "img/pinakbet.jpg",
    "credit": {
      "by": "Ralff Nestor Nacor",
      "license": "CC BY-SA 4.0",
      "url": "https://commons.wikimedia.org/wiki/File:Pinakbet_(Ilocano-style),_Mar_2024.jpg"
    },
    "ingredients": [
      "<span class=\"amt\">1 kg</span> kasim, 2-inch cubes, fat trimmed",
      "<span class=\"amt\">2 L</span> water",
      "<span class=\"amt\">1</span> onion quartered, <span class=\"amt\">4</span> tomatoes quartered",
      "<span class=\"amt\">1</span> thumb ginger sliced, <span class=\"amt\">1 tbsp</span> peppercorns",
      "<span class=\"amt\">300 g</span> kalabasa, cubed",
      "<span class=\"amt\">1</span> small ampalaya, seeded, sliced thick",
      "<span class=\"amt\">2</span> talong, thick diagonal slices",
      "<span class=\"amt\">10</span> pcs okra, <span class=\"amt\">12</span> pcs sitaw",
      "<span class=\"amt\">2</span> siling haba",
      "<span class=\"amt\">½ tsp</span> salt"
    ],
    "steps": [
      "Blanch the kasim — boil, drain, rinse, wash the pot.",
      "Simmer in 2 L fresh water with onion, tomatoes, ginger, and peppercorns, uncovered <span class=\"time\">65–75 min</span>, skimming fat, until tender.",
      "Mash the softened tomatoes into the broth. Skim the fat one last time.",
      "<strong>Tame the ampalaya.</strong> Toss the slices with ½ tsp salt, rest <span class=\"time\">10 min</span>, squeeze out the bitter liquid, then rinse well under running water.",
      "Add kalabasa to the pot. Simmer <span class=\"time\">8 min</span>.",
      "Add talong and sitaw. Simmer <span class=\"time\">5 min</span>.",
      "Add okra, ampalaya, siling haba. Simmer <span class=\"time\">4 min</span>. Stop stirring hard from here or the vegetables break apart.",
      "Heat off, taste, and season."
    ],
    "notes": [
      "Layering the vegetables by cooking time is the difference between this and a mush. Hardest first, softest last."
    ]
  }
];
