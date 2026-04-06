// AI service — calls the same Gemini proxy as the PWA
// The proxy expects: POST to root URL with { task: "summary", contents: [{ parts: [{ text }] }] }
const GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app';

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'summary',
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini proxy error: ${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function getDigDeeperForSegment(
  bookName: string,
  chapter: number,
  verses: string,
  title: string
): Promise<string> {
  return callGemini(`You are a Bible study assistant. ${TONE}

Give a deep theological and historical analysis of ${bookName} ${chapter}:${verses} ("${title}").

Cover:
- **Historical context** — what was happening in that time period
- **Original language insights** — key Hebrew/Greek words and their deeper meaning
- **Theological significance** — why this matters in the bigger biblical narrative
- **Practical application** — how this applies today

Use **bold** for key terms. Keep each section to 2-3 sentences. Be thorough but concise.`);
}

const TONE = `Be direct — no greetings, no filler, no "Hey there!", no "Great question!", no restating the verse. Start immediately with the insight. Use clear, simple English. Bold key terms with **double asterisks**.`;

export async function getContextSummary(
  bookName: string,
  chapter: number,
  versesText: string
): Promise<string> {
  return callGemini(`You are a Bible study assistant. ${TONE}

Give a brief context summary for ${bookName} Chapter ${chapter}. Cover:
1. **Background** — What's happening at this point in the book
2. **Key Themes** — Main ideas in this chapter
3. **Watch For** — Things the reader should pay attention to

Here are the verses:
${versesText}`);
}

// ─── Story Types ────────────────────────────────────────────────────────────

export interface AtAGlance {
  characters: { name: string; role: string }[];
  setting: string;
  timeline: string;
  oneLineSubject: string;
  oneLineRest: string;
}

export type DisplayType = 'conversation' | 'narration' | 'list' | 'teaching' | 'contrast' | 'sequence';

export interface StorySegment {
  title: string;
  materialIcon: string;
  verses: string;
  displayType: DisplayType;
  content: {
    messages?: { speaker: string; text: string }[];
    points?: { icon?: string; text: string; emoji?: string }[];
    headers?: string[];
    rows?: string[][];
    quote?: string;
    speaker?: string;
    explanation?: string;
    left?: { label: string; text: string };
    right?: { label: string; text: string };
    steps?: { text: string; emoji?: string }[];
    reflection?: string;
    verseRef?: string;
  };
}

export async function getAtAGlance(
  bookName: string,
  chapter: number,
  versesText: string
): Promise<AtAGlance> {
  const raw = await callGemini(`You are a Bible study assistant. For ${bookName} Chapter ${chapter}, provide a quick visual snapshot.

Return ONLY valid JSON, no markdown fences:
{
  "characters": [{"name": "Character Name", "role": "brief role like 'Prophet' or 'Apostle'"}],
  "setting": "Location or context where this takes place",
  "timeline": "Approximate time period or era",
  "oneLineSubject": "The key subject noun/phrase of the sentence e.g. 'The Word', 'God's promise', 'Jesus'",
  "oneLineRest": "the rest of the sentence continuing from the subject"
}

RULES:
- characters: list ALL named people (max 6). If no named characters, use roles like "The Psalmist"
- setting: be specific — city, region, or situation
- timeline: use approximate dates or eras like "~30 AD", "During the Exodus", "Babylonian Exile"
- oneLineSubject + oneLineRest together form one punchy sentence (max 15 words total). The subject is the main noun/person/concept of the chapter — e.g. "The Word", "Abraham", "God's covenant". NOT random first words.

PASSAGE:
${versesText}`);

  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      characters: Array.isArray(parsed.characters) ? parsed.characters.slice(0, 6) : [],
      setting: String(parsed.setting || 'Unknown'),
      timeline: String(parsed.timeline || 'Ancient times'),
      oneLineSubject: String(parsed.oneLineSubject || bookName),
      oneLineRest: String(parsed.oneLineRest || `Chapter ${chapter}`),
    };
  } catch {
    return { characters: [], setting: '', timeline: '', oneLineSubject: bookName, oneLineRest: `Chapter ${chapter}` };
  }
}

const ICON_LIST = '"light-mode","water-drop","park","pets","person","groups","favorite","local-fire-department","auto-awesome","menu-book","church","bolt","shield","visibility","healing","handshake","gavel","sailing","terrain","nightlight","celebration","warning","star","home","explore","psychology","volunteer-activism"';

export async function getChapterTimeline(
  bookName: string,
  chapter: number,
  versesText: string
): Promise<StorySegment[]> {
  const verseCount = versesText.split('\n').filter((l) => l.trim()).length;
  const targetSegments = Math.max(3, Math.min(10, Math.ceil(verseCount / 8)));

  const raw = await callGemini(`You are a Bible study assistant creating an interactive story breakdown for ${bookName} Chapter ${chapter}.

Break the chapter into ${targetSegments} sequential segments. For EACH segment, pick the BEST displayType based on the content:

DISPLAY TYPES:
- "conversation": when there is dialogue between characters. Content: {"messages": [{"speaker": "Name", "text": "what they say/do"}]}
- "narration": for action, events, descriptions. Content: {"points": [{"text": "short point", "emoji": "optional single emoji or empty string"}]} — use 3-5 bullet points, NOT paragraphs. Emoji: add a trendy/subtle emoji ONLY when it fits naturally (max 2-3 out of 5 points get an emoji, the rest empty string). Think ✨🕊️👀🔥💀🫣🤝 vibes — not churchy, not overdone.
- "list": for genealogies, lists of names/items. Content: {"headers": ["Col1","Col2"], "rows": [["val1","val2"]]}
- "teaching": when someone teaches a key concept or makes a declaration. Content: {"quote": "the key verse/teaching", "speaker": "who said it", "verseRef": "the specific verse number the quote is from e.g. '5' or '12'", "explanation": "1-2 sentence explanation"}
- "contrast": for before/after, comparison, old vs new. Content: {"left": {"label": "Before", "text": "..."}, "right": {"label": "After", "text": "..."}, "reflection": "1 sentence practical learning from this contrast"}
- "sequence": for step-by-step creation, journeys, processes. Content: {"steps": [{"text": "Step description", "emoji": "optional single emoji or empty string"}]} — same emoji rules as narration

RULES:
- Every verse must be in exactly one segment, no gaps, no overlaps
- Title: character-first when possible ("Jesus Heals the Blind Man" not "A Miracle")
- materialIcon: use ONLY from: ${ICON_LIST}
- Use a MIX of displayTypes — do NOT make every segment "narration"
- For conversations: paraphrase in simple modern English, keep messages SHORT (1-2 sentences each, max 20 words per message), biblical accuracy
- For narration points: each point max 15 words, scannable
- For teaching quotes: keep quotes concise and impactful, not full verses. Use **bold** in explanation
- For contrast: use **bold** for key terms in both sides
- Keep ALL text concise — short sentences, easy to scan on mobile
- Do NOT include a "digDeeper" field

Return ONLY valid JSON array, no markdown fences:
[
  {
    "title": "Character-First Title",
    "materialIcon": "icon-name",
    "verses": "1-5",
    "displayType": "narration",
    "content": {"points": [{"icon": "light-mode", "text": "Short scannable point"}]}
  }
]

PASSAGE:
${versesText}`);

  // Try multiple extraction strategies
  const strategies = [
    // 1. Strip markdown fences
    () => raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim(),
    // 2. Extract first JSON array from the response
    () => {
      const match = raw.match(/\[[\s\S]*\]/);
      return match ? match[0] : '';
    },
  ];

  for (const extract of strategies) {
    try {
      const cleaned = extract();
      if (!cleaned) continue;
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 15).map((s: any) => {
          const dt = ['conversation', 'narration', 'list', 'teaching', 'contrast', 'sequence']
            .includes(s.displayType) ? s.displayType : 'narration';
          return {
            title: String(s.title || 'Summary'),
            materialIcon: String(s.materialIcon || 'auto-awesome'),
            verses: String(s.verses || ''),
            displayType: dt as DisplayType,
            content: s.content || {},
          };
        });
      }
    } catch {}
  }

  // If all parsing fails, retry the API call once
  try {
    const retry = await callGemini(`Return ONLY a valid JSON array for a Bible chapter story breakdown. No markdown, no explanation, just the JSON array starting with [ and ending with ]. The chapter is ${bookName} ${chapter}.

Previous attempt returned invalid JSON. Please fix and return valid JSON array of story segments.`);
    const match = retry.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 15).map((s: any) => ({
          title: String(s.title || 'Summary'),
          materialIcon: String(s.materialIcon || 'auto-awesome'),
          verses: String(s.verses || ''),
          displayType: (['conversation', 'narration', 'list', 'teaching', 'contrast', 'sequence'].includes(s.displayType) ? s.displayType : 'narration') as DisplayType,
          content: s.content || {},
        }));
      }
    }
  } catch {}

  throw new Error('Failed to generate story breakdown. Please try again.');
}

export interface ChapterClosing {
  recapPoints: string[];
  reflectionP1: string;
  reflectionP2: string;
}

export async function getChapterClosing(
  bookName: string,
  chapter: number,
  versesText: string
): Promise<ChapterClosing> {
  const raw = await callGemini(`You are a warm, empathetic Bible study guide. For ${bookName} Chapter ${chapter}, create a closing reflection.

Return ONLY valid JSON, no markdown fences:
{
  "recapPoints": ["point 1", "point 2", "point 3"],
  "reflectionP1": "2 sentences MAX: a relatable feeling, linked to the chapter.",
  "reflectionP2": "2 sentences MAX: one clear takeaway + one line about God's character."
}

RULES:
- recapPoints: exactly 3 bullet points, each max 12 words, summarizing the key moments of the chapter
- reflectionP1 + reflectionP2: KEEP IT SHORT. Max 2 sentences each, max 30 words each. DON'T start with book name. No filler. No rhetorical questions. Relatable and real — like talking to a friend. No churchy language. Use "we/us/our" not "I/me/my".

PASSAGE:
${versesText}`);

  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      recapPoints: Array.isArray(parsed.recapPoints) ? parsed.recapPoints.slice(0, 5) : [],
      reflectionP1: String(parsed.reflectionP1 || ''),
      reflectionP2: String(parsed.reflectionP2 || ''),
    };
  } catch {
    return {
      recapPoints: [`${bookName} ${chapter} — a chapter worth revisiting.`],
      reflectionP1: `Take a moment to sit with what you just read in ${bookName} ${chapter}.`,
      reflectionP2: `God is present in every verse, every word. Let it settle in your heart.`,
    };
  }
}

export async function getQuickContext(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string
): Promise<string> {
  return callGemini(`You are a Bible study assistant. Be extremely concise.

Explain ${bookName} ${chapter}:${verseNum} in exactly 2-3 short sentences. Start directly with the verse reference (e.g., "${bookName} ${chapter}:${verseNum} tells us..."). Cover what it means in context and why it matters. No headers, no bullet points, no fluff, no greetings — just the core insight.

IMPORTANT: Bold the key theological terms and important words using **double asterisks**.

"${verseText}"`);
}

export async function getReflectionQuestions(
  bookName: string,
  chapter: number,
  versesText: string
): Promise<string> {
  return callGemini(`You are a Bible study assistant. ${TONE}

Generate 5 guided reflection questions for ${bookName} Chapter ${chapter}. Make them personal and applicable to daily life. Number them 1-5.

The passage:
${versesText}`);
}

export async function getDigDeeper(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string
): Promise<string> {
  return callGemini(`You are a premium Bible study tool. ${TONE}

${bookName} ${chapter}:${verseNum}: "${verseText}"

Give a dense, high-value word study. NO fluff. Every word must earn its place. ~120 words total.

#### Original Language
- **English Word** — Greek/Hebrew script (transliteration, pronunciation) — meaning. Max 2-3 key words.
- Example format: **Word** — λόγος (logos, LOH-goss) — reason, divine utterance.

#### Deeper Meaning
- 2 sharp insights. Connect to broader theology. One sentence each.

#### Cross-References
- 3 verses max. **Reference** — one-line why it matters.

#### Takeaway
- One powerful sentence for real life. Make it hit.

STRICT: No greetings. No "this verse tells us". No padding. Start with #### Original Language immediately.`);
}

export async function getCrossReferences(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string
): Promise<string> {
  return callGemini(`You are a Bible study assistant. ${TONE}

Find cross-references for ${bookName} ${chapter}:${verseNum}:
"${verseText}"

List 5-8 cross-references. For each, give:
- The reference (e.g., Romans 8:28)
- A brief explanation of how it connects to this verse`);
}

export async function getSuggestedQuestions(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string
): Promise<string[]> {
  const raw = await callGemini(`Generate 4 unique, thought-provoking questions someone might ask about ${bookName} ${chapter}:${verseNum}: "${verseText}"

RULES:
- Questions should be specific to THIS verse, not generic.
- Focus on: real-life application, surprising insights, theological implications, emotional/relational angles.
- Do NOT ask about word meanings or historical context (those are covered elsewhere).
- Each question must be 1 short sentence, under 10 words.
- Return ONLY the 4 questions, one per line, no numbers, no bullets, no extra text.`);

  return raw.split('\n').map(q => q.trim()).filter(q => q.length > 5).slice(0, 4);
}

export async function getFollowUpQuestions(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string,
  userQuestion: string,
  aiAnswer: string
): Promise<string[]> {
  const raw = await callGemini(`Based on this conversation about ${bookName} ${chapter}:${verseNum} ("${verseText}"):

User asked: "${userQuestion}"
Answer given: "${aiAnswer}"

Generate 3 natural follow-up questions the user might want to ask next.
RULES:
- Each under 8 words
- Build on what was just discussed — go deeper, not sideways
- One per line, no numbers, no bullets
- No generic questions like "what does this mean"`)

  return raw.split('\n').map(q => q.trim()).filter(q => q.length > 5).slice(0, 3);
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function sendVerseChat(
  bookName: string,
  chapter: number,
  verseNum: number,
  verseText: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string> {
  // Match the PWA pattern: embed history in the prompt text
  const historyStr = history.length
    ? `HISTORY: ${JSON.stringify(history.slice(-5))}`
    : '';

  return callGemini(`You are a Bible study assistant. ${TONE}

CONTEXT: ${bookName} ${chapter}:${verseNum} - "${verseText}"
${historyStr}

RULES:
- Be very concise (max 3 sentences).
- Focus on the specific verse context.
- Stay youth-friendly and encouraging.
- Do NOT start with greetings like "Hey there!" or "Great question!" — start directly with the answer referencing the verse.
- Bold key theological terms using **double asterisks**.

QUESTION: ${userMessage}`);
}
