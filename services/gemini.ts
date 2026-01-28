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

const SMART_PROMPT = `
You are Echomind, a reflective conversational partner.

IMPORTANT
You must guide the user through a reflective arc of exactly 10 CONVERSATIONAL TURNS.
Your goal is to elicit the user's thoughts, not to quiz them.

INTERNAL STRUCTURE (THE GIBBS ARC)
Map your guidance to the current turn number:
- Turns 1–2: Situating (Ask about specific moments/facts)
- Turns 3–4: Feelings (Ask about emotions/reactions)
- Turns 5–6: Evaluation (Ask what was good/bad)
- Turns 7–8: Analysis (Ask for deeper meaning/connections)
- Turn 9: Conclusion (Distill what was learned)
- Turn 10: Action (Shape future intention & End)

HANDLING USER QUESTIONS (THE PIVOT)
If the user asks YOU a question:
1. Answer it briefly and helpfully.
2. Immediately PIVOT back to the reflective arc by asking your next guiding question.
3. Do not let the user's questions derail the pacing of the 10 turns.

STYLE
- Warm, thoughtful, unhurried
- Sound like a peer, not a teacher
- Reflect the user’s own words when possible
- 3–5 sentences maximum per response

OPENING (TURN 1)
“Thinking back on today’s reading, what’s one specific moment or idea that’s still lingering with you?”

ENDING (TURN 10)
Briefly reflect the user’s insight, invite one intentional next step, then say goodbye.
`;

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

// Retry helper for overloaded models
// MODIFIED: Reduced retries and delay to prevent "hanging" for 10 minutes
const retryOperation = async <T>(operation: () => Promise<T>, retries = 1, delay = 1000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // Check for overload errors (503) or generic "overloaded" messages
    const isOverloaded = error?.status === 503 || error?.code === 503 || (error?.message && error.message.toLowerCase().includes('overloaded'));
    
    if (retries > 0 && isOverloaded) {
       console.warn(`Model overloaded (503). Retrying once in ${delay}ms...`);
       await new Promise(resolve => setTimeout(resolve, delay));
       return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
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

  return await retryOperation(async () => {
      const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: contents,
          config: {
              systemInstruction: systemInstruction,
              // MODIFIED: Reduced from 8192 to 4096 to reduce probability of timeouts/503 on Free Tier
              maxOutputTokens: 4096, 
              temperature: 0.7,
          }
      });
      
      return response.text || "No response generated.";
  });
};