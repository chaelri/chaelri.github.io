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
- **Word** (transliteration) — meaning. Max 2-3 key words only.

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
