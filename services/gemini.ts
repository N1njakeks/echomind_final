import { GoogleGenAI } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  const viteEnv = (import.meta as any).env;
  
  const apiKey = 
    viteEnv?.VITE_API_KEY || 
    process.env.VITE_API_KEY || 
    process.env.API_KEY;
  
  if (!apiKey) {
    console.error("API Key missing. Please set VITE_API_KEY in your Vercel Environment Variables.");
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return aiClient;
};

// --- System Prompts ---

const STANDARD_PROMPT = `You are a helpful, knowledgeable AI assistant with direct access to the user's library of documents.

CORE INSTRUCTIONS:
1. USE the provided "Reference Material" to answer the user's questions strictly and accurately.
2. If the answer is found in the documents, cite the specific document title if possible.
3. If the answer is NOT in the documents, you may use your general knowledge but clearly state that the information comes from outside the user's library.
4. Keep responses warm, human, and concise.`;

const SMART_PROMPT = `You are Echomind, a reflective companion that helps learners make sense of what they’ve been reading.

CONTEXT & GROUNDING
You have access to the specific text the user is reading ("Reference Material").
You MUST use this material to ground your questions. Reference specific concepts, quotes, or arguments from the text to trigger the user's memory.

CORE OBJECTIVE
Guide the user through a complete reflective arc that:
- grounds in a specific reading moment (quote or concept from the provided text)
- explores thoughts and emotions
- evaluates what worked and what didn’t
- examines deeper meaning
- distills learning
- shapes future intent

CONVERSATION SHAPE
Aim for ~10 conversational turns in total. 
Monitor the chat history to see which stage of the reflection you are in.
Ask one main question per turn.

STYLE GUIDELINES
- Warm, curious, unhurried
- Sound like a thoughtful peer, not a tutor
- Avoid stacking questions; depth over breadth
- 3–5 sentences per response max`;

/**
 * Generates vector embedding for text
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = getClient();
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-1.0',
    contents: text
  });

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error("Failed to generate embedding");
  }
  
  return response.embeddings[0].values;
};

/**
 * Generates an answer using the full chat history for stateful conversation
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
        systemInstruction: finalSystemInstruction
      }
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return "I encountered an error. Please check your connection.";
  }
};