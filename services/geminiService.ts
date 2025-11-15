
import { GoogleGenAI } from "@google/genai";
import { RULES_CONTENT } from "../constants";

// Guarded AI client: only construct if API key present to avoid runtime errors in dev/test.
const apiKey = process.env.API_KEY || (typeof window !== 'undefined' ? (window as any).__API_KEY : undefined);
let ai: GoogleGenAI | null = null;
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('Could not initialize GoogleGenAI client:', err);
    ai = null;
  }
}

const systemInstruction = `You are REFY, an expert AI assistant for soccer referees. Your purpose is to provide clear, concise, and accurate answers to questions about the Laws of the Game. Base your answers strictly on official soccer rules. When asked for advice on game management (like stoppage time), provide standard guidelines. Be helpful, direct, and act as a reliable tool for a referee during a match.`;

function findRelevantRules(query: string) {
  const q = query.toLowerCase();
  // Score rules by number of keyword matches
  const scored = RULES_CONTENT.map(r => {
    const text = (r.title + ' ' + r.content).toLowerCase();
    let score = 0;
    // look for simple tokens
    q.split(/\W+/).filter(Boolean).forEach(tok => {
      if (text.includes(tok)) score += 1;
    });
    return { rule: r, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  return scored; // may be empty
}

function firstSentences(text: string, count = 2) {
  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  return sentences.slice(0, count).join(' ');
}

function localAnswer(query: string): string {
  const scored = findRelevantRules(query);
  if (scored.length === 0) {
    const titles = RULES_CONTENT.map(r => `- ${r.title}`).join('\n');
    return `I couldn't find a close match in the quick rules reference. Topics you can ask about:\n${titles}`;
  }

  // Build a concise local summary from top matches
  const top = scored.slice(0, 2);
  const summaryParts: string[] = [];
  top.forEach(s => {
    const sent = firstSentences(s.rule.content, 2);
    summaryParts.push(`${s.rule.title}: ${sent}`);
  });

  const titles = scored.slice(0, 4).map(s => `- ${s.rule.title}`).join('\n');
  return `Short rules-based answer (from quick reference):\n\n${summaryParts.join('\n\n')}\n\nSee also:\n${titles}`;
}

export const askAIReferee = async (question: string): Promise<string> => {
  // Try local helper first for short/obvious questions to avoid unnecessary API calls
  try {
    const scored = findRelevantRules(question);
    // If local has a direct match (not just full list), prefer to augment AI rather than replace
    const hasMatch = scored.length > 0;

    if (!ai) {
      // No AI available — return a concise local answer instead of dumping rule text
      return localAnswer(question);
    }

    // Build a clear prompt that includes the system instruction and the user question
    const prompt = `${systemInstruction}\n\nUser question: ${question}\n\nIf the question is about a specific rule, cite the rule title and provide a short answer (1-4 sentences). If unsure, say you are unsure and suggest relevant rules.`;

    // The SDK shape can vary; use a robust attempt and validate output
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: question }
        ],
        config: { temperature: 0.15, maxOutputTokens: 800 }
      } as any);

      // Attempt to extract text from known response shapes
      const text = (response && (response.text || response.outputText || response.output?.[0]?.content || (Array.isArray(response.outputs) && response.outputs[0]?.content?.[0]?.text))) || '';

      if (typeof text === 'string' && text.trim().length > 10) {
        // If AI produced a short/low-quality reply, append concise local matches to improve usefulness
        if (text.trim().length < 80 && hasMatch) {
          return `${text.trim()}\n\nRelevant rules:\n\n${firstSentences(scored[0].rule.content, 2)}`;
        }
        return text.trim();
      }

      // If response is empty or unexpected, fall back to concise local answer
      return localAnswer(question);
    } catch (err) {
      console.warn('AI call failed, falling back to local rules:', err);
      return `AI service unavailable or returned an error. ${localAnswer(question)}`;
    }
  } catch (err) {
    console.error('askAIReferee error:', err);
    return "Sorry, I couldn't process your question right now.";
  }
};
