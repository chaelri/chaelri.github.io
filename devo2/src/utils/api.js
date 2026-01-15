const GEMINI_PROXY_URL = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

export async function fetchGemini(prompt, task = "summary") {
  try {
    const res = await fetch(GEMINI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: task,
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini proxy failed with status: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Gemini API call failed:", error);
    throw error;
  }
}

export function createCrossReferencePrompt(strongNum, englishWord, originalWord) {
  // Copied from original JS
  return `
    TASK: Find 5 cross-references for Strong's ${strongNum} (${englishWord} / ${originalWord}).
    OUTPUT FORMAT (STRICT):
    - RAW HTML ONLY
    - NO code blocks, backticks, or "html" labels
    - ONE outer <div>
    - Format per entry:
      <div class="cross-ref-item">
        <span class="cross-ref-ref">Book Chapter:Verse</span>
        <p class="cross-ref-text">Verse text with <strong>${englishWord}</strong> or <strong>${originalWord}</strong> BOLDED (use <strong> tag)</p>
        <p style="font-size:12px; opacity:0.8; margin-top:4px;">* Taglish explanation of usage.</p>
      </div>
    RULES:
    - BE FAST: Keep verses short.
    - HIGHLIGHT: You MUST bold the translated word in the verse text using <strong>.
    - LANGUAGE: Taglish explanation.
  `;
}

export function createDigDeeperPrompt(book, chapter, verse) {
  // Copied from original JS
  return `
    IMPORTANT OUTPUT RULES (ABSOLUTE — NO EXCEPTIONS):
    GENERAL: - RAW HTML ONLY - ONE outer <div> only - NO markdown, NO explanations, NO preaching
    LEXICAL RULES (VERY STRICT): - EVERY lexical entry MUST: 1. Start with the English meaning/word 2. Include original script (Greek/Hebrew) and transliteration in parentheses 3. Include Strong's Number in brackets 4. Follow format: English Word — original (transliteration) [Strong's Number] - DO NOT output English-only words - If original word is unknown, SKIP it
    LANGUAGE: - New Testament → GREEK ONLY - Old Testament → HEBREW ONLY
    STRUCTURE (MANDATORY):
    <div>
      <section data-col="lexical">
        <div>word — λόγος (logos) [G3056]</div>
      </section>
      <section data-col="flow">
        <div>Entity</div>
      </section>
      <section data-col="meta">
        <div data-type>Type text</div>
        <div data-focus>Focus text</div>
        <div data-time data-keyword>Time text</div>
      </section>
    </div>
    TASK: Extract structured study data for:
    ${book} ${chapter}:${verse}
  `;
}

export function createQuickContextPrompt(book, chapter, verse, text) {
    // Copied and adapted from original JS
    return `
    IMPORTANT OUTPUT RULES (STRICT):
    - Respond with RAW HTML ONLY
    - DO NOT use code blocks
    - DO NOT use backticks
    - DO NOT write the word html
    - DO NOT explain anything outside the HTML
    - The FIRST character of your response MUST be "<"
    - The LAST character of your response MUST be ">"

    HTML RULES:
    - Use ONE div only
    - Allowed tags ONLY: div, p, strong, em

    CONTENT RULES:
    - VERY SHORT (1–2 sentences)
    - Simple explanation of meaning
    - Taglish (Filipino + English)
    - Youth-friendly, casual, warm tone
    - Early-believer level (easy to understand, not deep theology)
    - No preaching
    - No applications
    - No titles
    - No verse quotation

    TASK:
    Explain this verse briefly:

    ${book} ${chapter}:${verse}
    ${text}
    `;
}

export function createAIContextSummaryPrompt(titleForGemini) {
    // Copied and adapted from original JS (only including the prompt template)
    return `You are a Bible study assistant.
    IMPORTANT: Your response will be assigned directly to element.innerHTML. Because of this, you must follow the rules below exactly.
    OUTPUT RULES (MANDATORY):
    Respond with RAW HTML ONLY
    Do NOT use any code block formatting
    Do NOT wrap the response in backticks
    Do NOT label the response as code
    Do NOT explain anything
    Do NOT include the word html anywhere
    The first character of your response must be the less-than symbol
    Start immediately with a div tag

    ALLOWED TAGS ONLY:
    div, p, ul, li, strong, em

    STYLING RULES (MUST MATCH EXACTLY):
    Use ONE outer div with THIS EXACT inline style and DO NOT MODIFY IT:

    background: linear-gradient(135deg, #486bec, #db2777);
    padding: 1rem 1.5rem 2rem;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(236, 72, 153, 0.45);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 16px;
    line-height: 1.4;
    color: #ffffff;
    max-width: 360px;
    margin-bottom: 2rem;
    box-sizing: border-box;

    Title rules:
    - The FIRST element inside the div must be a p tag WITH inline styles:
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 0.8rem;
    - The title format must be:
      "{BOOK} {CHAPTER} {VERSE (if it exists)} Context ✨"
    - Use the actual book name and chapter from the task
    - Title should feel calm and clear (slightly stronger than body text)

    List rules:
    - Use a ul directly under the title
    - The ul MUST include inline styles:
      margin-top: 1rem;
      margin-bottom: 0;
      padding-left: 1.25rem;
    - 3 to 5 short bullet points only
    - Short, clean sentences
    - Use <strong> to highlight key theological identities (e.g. Jesus, Word, Light, Lamb of God)
    - Use <em> to highlight important actions or roles (e.g. became flesh, witnessing, calling disciples)
    - Do NOT overuse emphasis — only 1–2 emphasized phrases per bullet
    - No extra spacing or decoration

    CONTENT RULES:
    Very concise
    Neutral, study-focused tone
    No modern application
    No verse quotations

    TASK:
    Create a compact background context for ${titleForGemini}.
    `;
}

export function createAIReflectionQuestionsPrompt({ book, chapter, versesText }) {
    // Copied and adapted from original JS (only including the prompt template)
    return `
    IMPORTANT OUTPUT RULES (STRICT):
    - Respond with RAW HTML ONLY
    - DO NOT use code blocks
    - DO NOT use backticks
    - DO NOT write the word html
    - The FIRST character must be "<"
    - Use ONE outer div only
    - EACH question must be followed by a <textarea> for the user's answer

    ALLOWED TAGS:
    div, p, ol, li, strong, em, textarea, a

    ROLE:
    You generate DISCUSSION AND REFLECTION QUESTIONS.
    You must NOT give answers.
    You must NOT speak as God.

    TASK:
    Generate EXACTLY 3 numbered questions based on the passage.

    CRITICAL LINKING RULE (MUST FOLLOW):
    - EVERY verse reference MUST be written as an <a> link
    - Link format: <a href="#X" class="reflection-link">v. X</a> or <a href="#X" class="reflection-link">vv. X–Y</a>
    - The href MUST always point to the FIRST verse in the reference
    - DO NOT include any verse numbers outside of <a> tags
    - STRICTOR RULE: DO NOT include parentheses around the link or the text inside the link (e.g., write "v. 5", NOT "(v. 5)" and NOT "<a>(v. 5)</a>")
    - If a question references multiple verses or ranges, EACH one must be linked
    - Final output must contain ZERO plain-text verse references and ZERO parentheses surrounding verse links

    QUESTION STYLE (MATCH THE SAMPLE):
    - Personally directed reflection tone (address the reader directly)
    - Questions MUST speak in second person ("you", "your")
    - Questions should invite personal meaning, conviction, or response
    - At least ONE question should ask about practical steps or responses you might take

    PERSONALIZATION RULE (STRICT):
    - ALL questions MUST be directly addressed to the reader

    STRUCTURE:
    - NO title
    - NO intro sentence
    - An <ol> with EXACTLY 3 <li> items
    - Inside each <li>:
      - A single <p> containing the full question text (including the verse link)
      - A <textarea> immediately after the <p>

    PASSAGE:
    ${book} ${chapter}
    ${versesText}
    `;
}