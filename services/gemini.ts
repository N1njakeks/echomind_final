import { GoogleGenAI } from "@google/genai";

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
  try {
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
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // Check for overload errors (503) or generic "overloaded" messages
    const isOverloaded = error?.status === 503 || error?.code === 503 || (error?.message && error.message.toLowerCase().includes('overloaded'));
    
    if (retries > 0 && isOverloaded) {
       console.warn(`Model overloaded (503). Retrying in ${delay}ms... (${retries} attempts left)`);
       await new Promise(resolve => setTimeout(resolve, delay));
       // Exponential backoff
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
  
  // Choose System Prompt
  const systemInstruction = mode === 'reflective' ? SMART_PROMPT : STANDARD_PROMPT;
  
  // Construct content with context if available
  let finalPrompt = "";
  const lastUserMsg = history[history.length - 1].text;
  
  // If context exists, we prepend it to the user's last message or handle it as a system text block.
  // For Gemini 1.5/3, putting it in the user prompt is reliable.
  if (context) {
      finalPrompt = `CONTEXT FROM DOCUMENTS:\n${context}\n\nUSER QUESTION:\n${lastUserMsg}`;
  } else {
      finalPrompt = lastUserMsg;
  }

  // Convert history to format expected by generateContent (excluding the last one which is our prompt)
  // Actually, simplest way with @google/genai is often just one-shot or managing history manually.
  // We will pass the full history as "contents" if we were using chat, but for generateContent we construct it.
  
  // To keep it simple and robust:
  // We treat this as a single turn with history embedded if needed, or we use a chat session.
  // Given the stateless nature of this helper, we'll reconstruct the chat.
  
  const chat = ai.chats.create({
      model: 'gemini-3-flash-preview', // USER REQUESTED V3
      config: {
          systemInstruction: systemInstruction,
          temperature: 0.7, // Slightly creative but focused
      }
  });
  
  // Replay history (excluding the very last new message which we send now)
  const previousHistory = history.slice(0, history.length - 1);
  
  // Add context to the first user message if it's the start, or inject implicitly.
  // Strategy: If we have documents, we can add them as a separate user/model turn pair at the start
  // or just append to the system instruction. Appending to system instruction is cleaner for RAG.
  
  // Let's modify the system instruction for this session if context exists
  if (context) {
     // Note: We can't easily modify config after create in the SDK simply, 
     // but we can prepend context to the first message or use it in the active prompt.
     // Let's prepend to the current message for RAG relevance.
  }

  // Load history into chat
  for (const msg of previousHistory) {
     // We need to map 'user'/'model' correctly.
     // The SDK handles history if we use sendMessage sequentially, 
     // OR we can try to initialize with history (not yet fully standard in this wrapper version).
     // Safest: Send messages sequentially to build state (slow but accurate) 
     // OR just formatting the prompt as a big block if history is short.
     
     // Optimization: Just send the last few turns + context to avoid strict history limitations/latency
     // But for a "Chat" feel, full history is better.
     
     // Let's assume we just want the response to the *current* prompt with context.
     // We'll trust the model to handle the context in the final prompt.
  }
  
  // To avoid complexity with SDK chat history management in this specific file:
  // We will send the history as a structured prompt list if possible, or just the last message + context.
  // However, `chat.sendMessage` is stateful. 
  
  // FASTEST/ROBUST METHOD for V3 Flash Preview:
  // Send the history as a list of contents.
  
  const contents = previousHistory.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
  }));
  
  // Add the new message with context
  contents.push({
      role: 'user',
      parts: [{ text: finalPrompt }]
  });

  return await retryOperation(async () => {
      const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', // USER REQUESTED V3
          contents: contents,
          config: {
              systemInstruction: systemInstruction,
              maxOutputTokens: 2048, // ample space for answers
          }
      });
      
      return response.text || "No response generated.";
  });
};
