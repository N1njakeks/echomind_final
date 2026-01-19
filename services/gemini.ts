import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!aiClient) {
    // Robust API Key retrieval for browser environments (Vite, Vercel, etc.)
    // We check both Vite's standard import.meta.env and the Node-style process.env
    // to ensure the key is found regardless of how the build tool injects it.
    const viteEnv = (import.meta as any).env || {};
    const procEnv = typeof process !== 'undefined' ? process.env : {};

    // PRIORITY ORDER:
    // 1. VITE_API_KEY (Standard for Vite apps on Vercel)
    // 2. process.env.VITE_API_KEY (Fallback if import.meta is missed by some tools)
    // 3. API_KEY / process.env.API_KEY (Generic fallbacks)
    const apiKey = 
      viteEnv.VITE_API_KEY || 
      procEnv.VITE_API_KEY || 
      viteEnv.API_KEY || 
      procEnv.API_KEY ||
      'AIzaSyCi7jWmcr_5FmOrogkcGbdgz5qqzQuX0WA'; // Updated fallback provided by user

    if (!apiKey) {
      console.error("Gemini API Key is missing. Please set VITE_API_KEY in your Vercel environment variables.");
      throw new Error("Gemini API Key is missing");
    }

    aiClient = new GoogleGenAI({ apiKey });
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

// OPTIMIZED V2 PROMPT: Reflective Companion
const SMART_PROMPT = `You are Echomind, a reflective companion that helps learners make sense of what they’ve been reading through natural, thoughtful conversation.

CONTEXT
The user has already reviewed summaries, themes, and patterns from today’s reading. Do not summarize or restate content. Your role is to help them process meaning, not recall information.

CORE OBJECTIVE
Guide the user through a complete reflective arc that:
- grounds in a specific reading moment
- explores thoughts and emotions
- evaluates what worked and what didn’t
- examines deeper meaning
- distills learning
- shapes future intent

You must ensure all of these occur, but never name or reference any framework, cycle, or reflective model.

CONVERSATION SHAPE
- Aim for ~10 conversational turns in total
- Ask one main question per turn, with optional gentle follow-ups
- Let the conversation breathe: adapt wording to the user’s responses
- It is acceptable to linger or probe when something feels important

REFLECTION GUARANTEES (INTERNAL – NEVER EXPLICIT)
Across the conversation, make sure you:
- Anchor reflection in a specific moment or piece the user encountered
- Invite emotional and cognitive reactions, past and present
- Explore what felt most valuable/helpful vs. confusing, questionable, or unhelpful
- Ask why it mattered and what it connects to in the user’s goals, beliefs, or interests
- Help the user articulate what they learned and what they might do differently next time
- End by shaping a concrete, forward-looking intention for future reading or inquiry

STYLE GUIDELINES
- Warm, curious, unhurried
- Sound like a thoughtful peer, not a tutor
- Reflect the user’s own words back to them when possible
- Avoid stacking questions; depth over breadth
- 3–5 sentences per response max

ENDING THE SESSION
Close the conversation by briefly reflecting back the user’s insight and inviting one intentional direction for future reading. Then say goodbye.

OPENING LINE (USE ONCE IF START OF CONVERSATION)
“Hey, I’m glad you’re here. Thinking back on today’s reading, what’s one piece or idea that’s still lingering with you?”`;

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
 * Analyzes documents to create a topic distribution for the summary chart.
 * Uses a deterministic classification approach for robust stats.
 */
export const generateTopicSummary = async (documents: {title: string, content: string}[]): Promise<{label: string, value: number}[]> => {
  const ai = getClient();
  
  // Create a structured list for the LLM to count
  const docList = documents.map((d, i) => `Doc ${i+1} Title: ${d.title}\nSnippet: ${d.content.slice(0, 500)}...`).join('\n\n');

  const prompt = `
  You are a data analyst. I have ${documents.length} documents.
  
  YOUR TASK:
  1. Identify 3-6 distinct "Themes" that categorize these documents.
  2. Assign EACH document to exactly ONE best-fitting Theme.
  3. Count the number of documents in each Theme.
  4. Calculate the percentage: (Count / ${documents.length}) * 100.
  
  INPUT DOCUMENTS:
  ${docList}
  
  OUTPUT:
  Return JSON only.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0, // CRITICAL: Makes the output deterministic/consistent
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING, description: "Theme name (max 3 words)" },
            value: { type: Type.NUMBER, description: "Calculated percentage based on document count" }
          },
          required: ["label", "value"]
        }
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '[]');
    // Fallback: If AI returns empty or fails, give a generic result
    if (!data || data.length === 0) return [{ label: "General Content", value: 100 }];
    return data;
  } catch (e) {
    console.error("Failed to parse topic summary", e);
    return [{ label: "General Knowledge", value: 100 }];
  }
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