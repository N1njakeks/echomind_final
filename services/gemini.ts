import { GoogleGenAI } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;
let userProvidedKey: string | null = null;

// Allow the app to set the key dynamically at runtime
export const setGeminiApiKey = (key: string) => {
  if (key && key.startsWith("AIza")) {
    userProvidedKey = key;
    aiClient = null; // Force re-initialization
    console.log("Gemini Service: User API Key set successfully.");
  } else {
    console.warn("Gemini Service: Invalid key format ignored.");
  }
};

const getClient = () => {
  // Always verify if a client needs to be (re)created
  if (!aiClient) {
    // STRICT PRIORITY:
    // 1. User provided key (from Settings/DB)
    // 2. Vite Env Var (Fallback for local dev)
    const apiKey = userProvidedKey || (import.meta as any).env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API Key is missing. Please enter your Google API Key in the settings.");
    }

    if (!apiKey.startsWith("AIza")) {
        throw new Error("Invalid API Key format. Key must start with 'AIza'.");
    }

    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

// --- System Prompts ---

const STANDARD_PROMPT = `
### SYSTEM ROLE
You are a knowledgeable AI assistant. Your goal is to answer the user’s questions clearly and accurately based on the provided documents or your general knowledge.

### RESPONSE GUIDELINES
1. Be factual, concise, and clear.
2. Provide brief clarifications or examples if they help the user understand the content.
3. Avoid structured reflection or guidance through personal insight.
5. Keep tone neutral and style comparable to a reflective AI.

### SUCCESS METRIC
The user receives accurate and understandable answers that are comparable in style and length to a reflective response.
`;

const SMART_PROMPT = `CONTEXT
The user has already reviewed summaries, themes, and patterns from today’s reading. Do not summarize or restate content. Your role is to help them process meaning, not recall information.

CORE OBJECTIVE
Guide the user through a complete reflective arc that:
grounds in a specific reading moment
explores thoughts and emotions
evaluates what worked and what didn’t
examines deeper meaning
distills learning
shapes future intent

You must ensure all of these occur, but never name or reference any framework, cycle, or reflective model.

CONVERSATION SHAPE
Aim for ~10 conversational turns in total
Ask one main question per turn, with optional gentle follow-ups
Let the conversation breathe: adapt wording to the user’s responses
It is acceptable to linger or probe when something feels important

REFLECTION GUARANTEES (INTERNAL – NEVER EXPLICIT)
Across the conversation, make sure you:
Anchor reflection in a specific moment or piece the user encountered
Invite emotional and cognitive reactions, past and present
Explore what felt most valuable/helpful vs. confusing, questionable, or unhelpful
Ask why it mattered and what it connects to in the user’s goals, beliefs, or interests
Help the user articulate what they learned and what they might do differently next time
End by shaping a concrete, forward-looking intention for future reading or inquiry

STYLE GUIDELINES
Warm, curious, unhurried
Sound like a thoughtful peer, not a tutor
Reflect the user’s own words back to them when possible
Avoid stacking questions; depth over breadth
3–5 sentences per response max

ENDING THE SESSION
Close the conversation by briefly reflecting back the user’s insight and inviting one intentional direction for future reading. Then say goodbye.

OPENING LINE (USE ONCE)
“Hey, I’m glad you’re here. Thinking back on today’s reading, what’s one piece or idea that’s still lingering with you?”`;

/**
 * Generates vector embedding for text
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = getClient();
  try {
      // Note: text-embedding-004 might not be available on free tier keys in some regions
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("Failed to generate embedding");
      }
      
      return response.embeddings[0].values;
  } catch (e) {
      console.warn("Embedding failed (likely Free Tier limitation or model not found). Continuing without embeddings.");
      return [];
  }
};

export const generateAnswer = async (
  context: string, 
  history: { role: string, text: string }[],
  mode: 'standard' | 'reflective'
): Promise<string> => {
  const ai = getClient();
  
  const systemInstruction = mode === 'reflective' ? SMART_PROMPT : STANDARD_PROMPT;
  
  const lastUserMsg = history[history.length - 1].text;
  
  let finalPrompt = "";
  
  if (context) {
      finalPrompt = `CONTEXT FROM DOCUMENTS:\n${context}\n\nUSER QUESTION:\n${lastUserMsg}`;
  } else {
      finalPrompt = lastUserMsg;
  }

  const previousHistory = history.slice(0, history.length - 1);
  
  const contents = previousHistory.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
  }));
  
  contents.push({
      role: 'user',
      parts: [{ text: finalPrompt }]
  });

  // NO RETRY LOGIC - Direct Call
  const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: contents,
      config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 4096, 
          temperature: 0.7,
      }
  });
  
  return response.text || "No response generated.";
};