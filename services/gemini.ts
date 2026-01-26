import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;
let userProvidedKey: string | null = null;

// Allow the app to set the key dynamically at runtime
export const setGeminiApiKey = (key: string) => {
  userProvidedKey = key;
  aiClient = null; // Force re-initialization
};

const getClient = () => {
  if (!aiClient) {
    // Priority: User Key > Vite Env Key
    const apiKey = userProvidedKey || (import.meta as any).env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API Key is missing. Please provide a Google API Key.");
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
  const response = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: text
  });

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error("Failed to generate embedding");
  }
  
  return response.embeddings[0].values;
};

/**
 * Generates an answer using the full chat history for stateful conversation.
 * SINGLE ATTEMPT ONLY (No Retry) for clean evaluation data.
 */
export const generateAnswer = async (
  context: string, 
  history: { role: 'user' | 'model', text: string }[], 
  mode: 'standard' | 'reflective'
): Promise<string> => {
  const ai = getClient();
  
  const baseSystemInstruction = mode === 'reflective' ? SMART_PROMPT : STANDARD_PROMPT;
  
  let finalSystemInstruction = baseSystemInstruction;
  if (context) {
    finalSystemInstruction = `=== REFERENCE MATERIAL (SOURCE OF TRUTH) ===\n${context}\n\n=== END REFERENCE MATERIAL ===\n\n${baseSystemInstruction}`;
  }

  // Format history for Gemini API
  const contents = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        temperature: 0.7,
        systemInstruction: finalSystemInstruction,
        // Disable safety filters to allow 1:1 recitation of user documents
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    // 1. Standard text getter
    if (response.text) return response.text;

    // 2. Deep check for text in candidates if getter failed
    const candidateText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText) return candidateText;

    // 3. Analyze failure reason for evaluation transparency
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason) {
       console.warn("Model Finish Reason:", candidate.finishReason);
       return `[NO OUTPUT] Model stopped with reason: ${candidate.finishReason}`;
    }
    
    return "[NO OUTPUT] Empty response received (Unknown reason).";

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    if (error instanceof Error) {
        return `[ERROR] ${error.message}`;
    }
    return "[ERROR] Unknown connection error.";
  }
};