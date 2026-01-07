import { GoogleGenAI } from "@google/genai";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  // The API key must be obtained exclusively from the environment variable process.env.API_KEY
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiClient;
};

// --- System Prompts ---

const STANDARD_PROMPT = `You are a conversational companion talking with the user about what they’ve been reading.

Have a natural, friendly conversation. Ask open-ended questions and respond to what the user says.

Keep responses warm, human, and concise.`;

const SMART_PROMPT = `You are Echomind, a reflective companion that helps learners make sense of what they’ve been reading through natural, thoughtful conversation.

CONTEXT

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
 * Generates vector embedding for text using text-embedding-004
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = getClient();
  // Using the specific embedding model
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
 * Generates an answer using either Standard (Flash) or Reflective (Pro) mode
 */
export const generateAnswer = async (
  context: string, 
  question: string, 
  mode: 'standard' | 'reflective'
): Promise<string> => {
  const ai = getClient();
  
  // Choose System Prompt based on mode
  const baseSystemInstruction = mode === 'reflective' ? SMART_PROMPT : STANDARD_PROMPT;
  
  // Append Context to System Instruction if available
  let systemInstruction = baseSystemInstruction;
  if (context) {
    systemInstruction += `\n\n[CONTEXT FROM USER DOCUMENTS]\nUse the following information as context for your reflection or conversation if relevant, but prioritize the user's personal reflection:\n${context}`;
  }

  try {
    if (mode === 'reflective') {
      // SMART MODE: gemini-3-pro-preview for better instruction following
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: question,
        config: {
          systemInstruction,
          // Using a small thinking budget to allow for "thoughtful" processing of the reflection arc
          thinkingConfig: {
            thinkingBudget: 2048, 
          }
        }
      });
      return response.text || "No response generated.";
    } else {
      // STANDARD MODE: gemini-3-flash-preview for fast, casual chat
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: question,
        config: {
            systemInstruction
        }
      });
      return response.text || "No response generated.";
    }
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return "I'm sorry, I encountered an error communicating with the AI model.";
  }
};