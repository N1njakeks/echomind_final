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
      'AIzaSyCWt4Xj-Vh-eILxdNwbWLHs_aqZADAb-iI'; // Fallback for demo/local dev

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

// OPTIMIZED V2 PROMPT: Less rigid constraints to prevent empty output on Gemini 3 Flash Preview
const SMART_PROMPT = `You are Echomind, a reflective learning assistant.

OBJECTIVE
Help the user process information deeply through reflection.

INSTRUCTIONS
1. **Reference Material**: If provided, use it to ground your questions. If NOT provided, ask general reflective questions about the user's thoughts or goals.
2. **One Question**: Ask exactly one thought-provoking question per turn to guide the conversation.
3. **Brevity**: Keep responses short (under 4 sentences).
4. **Tone**: Curious, calm, and encouraging. Use a conversational tone.

AVOID
- Long explanations.
- Answering for the user.
- Being overly formal.`;

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