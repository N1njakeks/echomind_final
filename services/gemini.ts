import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!aiClient) {
    // Strictly access the VITE_GEMINI_API_KEY via Vite's import.meta.env
    // This removes any fallbacks to process.env or other variable names to ensure
    // we are only using the specific key configured in Vercel.
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Configuration Error: VITE_GEMINI_API_KEY is missing.");
      // Debugging aid: Log available keys (excluding values) to help identify if VITE_ prefix is missing
      console.log("Available Environment Keys:", Object.keys((import.meta as any).env).filter(k => k.startsWith('VITE_')));
      
      throw new Error("VITE_GEMINI_API_KEY is missing. Please check your Vercel Environment Variables.");
    }

    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

// --- System Prompts ---

const STANDARD_PROMPT = `
You are a helpful, knowledgeable AI assistant with access to the user's document library.

TASK
You must ask exactly 10 questions, one at a time.

QUESTION STYLE
- Focus on factual understanding and content recall
- Avoid emotional or reflective language
- Each question should stand on its own
- Keep questions concise and neutral

CONSTRAINTS
- Ask exactly one question per response
- Stop after the 10th question
- Do not reference previous answers unless necessary

CONTENT RULES
1. Use the provided Reference Material when possible.
2. If information is not found, state that you are using general knowledge.
3. Do not speculate beyond the documents.

Begin with Question 1.
`;

const SMART_PROMPT = `
You are Echomind, a reflective conversational partner.

IMPORTANT
You must guide the user through exactly 10 questions, one per turn.
After the 10th question, briefly reflect the user's insight and end the conversation.

INTERNAL STRUCTURE (DO NOT MENTION)
Your questions must implicitly follow this progression:
1–2: situating a specific reading moment
3–4: emotional and cognitive responses
5–6: evaluation (helpful vs. difficult)
7–8: deeper meaning and connections
9: distilled learning
10: forward-looking intention

CONVERSATION RULES
- Ask exactly one main question per response
- Optional gentle follow-up allowed within the same turn
- Adapt wording to the user's previous answer
- Do not summarize the reading
- Do not name or reference any reflective framework

STYLE
- Warm, thoughtful, unhurried
- Sound like a peer, not a teacher
- Reflect the user’s own words when possible
- 3–5 sentences maximum per response

OPENING (USE ONLY FOR QUESTION 1)
“Thinking back on today’s reading, what’s one specific moment or idea that’s still lingering with you?”

ENDING (AFTER QUESTION 10)
Briefly reflect the user’s insight, invite one intentional next step, then say goodbye.

Begin with Question 1.
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
 * Generates a concise summary for a single document to be stored in DB.
 * Kept for reference, but currently unused in main flow.
 */
export const generateDocumentSummary = async (title: string, content: string): Promise<string> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Analyze the following document and provide a dense, information-rich summary.
        Title: ${title}
        Content: ${content.slice(0, 50000)} (truncated if too long)
        
        Requirements:
        1. Maximum 500 characters.
        2. Focus on main themes, key arguments, and specific entities.
        3. Do not use phrases like "This document discusses". go straight to the point.
      `,
      config: {
        maxOutputTokens: 200,
        temperature: 0.3
      }
    });
    return response.text || "";
  } catch (e) {
    console.warn("Summary generation failed", e);
    return "";
  }
};

/**
 * Analyzes documents to create a topic distribution for the summary chart.
 * Uses a deterministic classification approach for robust stats.
 */
export const generateTopicSummary = async (documents: {title: string, content: string, summary?: string}[]): Promise<{label: string, value: number}[]> => {
  const ai = getClient();
  
  // REVERTED: Use pure content slice (first 500 chars) instead of AI summary
  const docList = documents.map((d, i) => {
    const textSnippet = d.content.slice(0, 500);
    return `Doc ${i+1} Title: ${d.title}\nContent Digest: ${textSnippet}...`;
  }).join('\n\n');

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