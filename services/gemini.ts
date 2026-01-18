import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!aiClient) {
    // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
        temperature: 0.7, // Keep chat slightly creative
        systemInstruction: finalSystemInstruction,
        // CRITICAL FIX: Disable safety filters to allow 1:1 recitation of user documents
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    if (response.text) return response.text;

    // Enhanced Error Handling: If text is empty, check finishReason
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason) {
        console.warn("Gemini Finish Reason:", candidate.finishReason);
        if (candidate.finishReason !== 'STOP') {
            return `I couldn't generate a response. The model stopped due to: ${candidate.finishReason}. (Likely safety or recitation check).`;
        }
    }
    
    return "No response generated (Empty output).";

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    if (error instanceof Error) {
        return `Connection Error: ${error.message}`;
    }
    return "I encountered an error. Please check your connection and API Key.";
  }
};