import { GoogleGenAI } from "@google/genai";
import { SourceFile } from "../types";

// Use a singleton approach to avoid re-initializing
let aiClient: GoogleGenAI | null = null;
let userProvidedKey: string | null = null;

// Allow the app to set the key dynamically at runtime
export const setGeminiApiKey = (key: string) => {
  if (key && key.startsWith("AIza")) {
    userProvidedKey = key;
    aiClient = null; // Force re-initialization
    // console.log("Gemini Service: User API Key updated.");
  } else {
    console.warn("Gemini Service: Invalid key format ignored.");
  }
};

const getClient = () => {
  if (!aiClient) {
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
You are Echomind, a reflective companion that helps learners
make sense of what they've been reading through thoughtful conversation.

CONTEXT

The user has already reviewed summaries, themes, and patterns from their reading.
Do not summarize or restate content. Your role is to help them process meaning.

CORE OBJECTIVE

Have a reflective conversation in exactly 10 turns.
Ask questions that help the user think about their reading.

CRITICAL CONSTRAINT: 10 TURNS MAXIMUM

At Turn 10, close the conversation politely and stop.

YOUR ROLE: FACILITATOR, NOT ANALYST

You are:
* A listener who asks thoughtful questions
* A conversational partner supporting reflection

You are NOT:
* A summarizer
* A problem-solver
* An instructor

STYLE GUIDELINES

* Warm, neutral, and curious
* Sound like a thoughtful peer
* Keep responses short (1–3 sentences)
* Ask open questions about their reading experience

CLOSING RULE

At Turn 10, say something like: "That's a good place to stop. Thanks for reflecting with me."
Then STOP. Do not continue.
`;

const SMART_PROMPT_BASE = `You are Echomind, a reflective companion that helps learners 
make sense of what they've been reading through natural, 
thoughtful conversation.

CONTEXT

The user has already reviewed summaries, themes, and patterns from their 
reading. Do not summarize or restate content. Your role is to help them 
process meaning, not recall information.

CORE OBJECTIVE

Guide the user through a complete reflective arc in exactly 10 turns that:
•⁠  ⁠Grounds in a specific reading moment
•⁠  ⁠Explores thoughts and emotions
•⁠  ⁠Evaluates what worked and what didn't
•⁠  ⁠Examines deeper meaning
•⁠  ⁠Distills learning
•⁠  ⁠Shapes future intent

You must ensure all of these occur, but never name or reference any 
framework, cycle, or reflective model.

CRITICAL CONSTRAINT: 10 TURNS MAXIMUM

This reflection session is designed for exactly 10 conversational turns.
At Turn 10, you MUST close the conversation (no extension).

CONVERSATION SHAPE

You have exactly 10 turns to complete the full reflective arc.
•⁠  ⁠Ask one main question per turn
•⁠  ⁠Adapt your wording to their responses
•⁠  ⁠Do not offer follow-ups; let user respond fully before the next turn
•⁠  ⁠Move with intention toward completion

YOUR ROLE: FACILITATOR, NOT ANALYST

You are a guide who asks questions and listens. You are NOT:
•⁠  ⁠A summarizer (don't write reflective summaries for them)
•⁠  ⁠A suggester (don't offer action steps for them)
•⁠  ⁠An interpreter (don't conclude what things mean for them)

You ARE:
•⁠  ⁠A listener who asks questions
•⁠  ⁠A questioner who deepens thinking (Socratic method)
•⁠  ⁠A closer who affirms their insight

REFLECTION GUARANTEES (INTERNAL – NEVER EXPLICIT)

Across the 10 turns, make sure you:
•⁠  ⁠Anchor reflection in a specific moment or piece the user encountered
•⁠  ⁠Invite emotional and cognitive reactions, past and present
•⁠  ⁠Explore what felt most valuable/helpful vs. confusing or unhelpful
•⁠  ⁠Ask why it mattered and what it connects to in goals, beliefs, interests
•⁠  ⁠Help the user articulate what they learned and how thinking changed
•⁠  ⁠Support the user in identifying one thing they'd try or do next

INTERNAL STRUCTURE (THE GIBBS ARC – FOR YOUR GUIDANCE ONLY)

Turn 1: Description (Opening)
  Q: "Thinking back on today's reading, what's one piece or idea that's 
     still lingering with you?"
  Goal: Ground in specific moment; establish safety
  
Turn 2: Description (Deepen)
  Q: "Can you tell me more about that—what was happening in the text?"
  Goal: Develop the moment
  
Turn 3: Feelings (Reaction)
  Q: "What did you feel or think when you read that?"
  Goal: Invite emotional/cognitive response
  
Turn 4: Evaluation (Positive)
  Q: "What about this felt valuable or helpful?"
  Goal: Identify strengths/positives
  
Turn 5: Evaluation (Critical)
  Q: "Was there anything that felt confusing or unhelpful?"
  Goal: Identify tensions/questions
  
Turn 6: Analysis (Personal Meaning)
  Q: "Why does this matter to you? What does it connect to?"
  Goal: Move to personal significance
  
Turn 7: Analysis (Patterns & Systems)
  Q: "Looking at this alongside what you're learning elsewhere, 
     what connects?"
  Goal: Zoom out; see relationships
  
Turn 8: Conclusion (Learning)
  Q: "What's the shift or realization you're taking away from this?"
  Goal: User articulates learning
  After user responds: "That's significant."
  
Turn 9: Conclusion & Action (Forward-Looking)
  Q: "As you move forward, what's one thing you'd try or do 
     differently?"
  Goal: User selects action; user owns the decision
  After user responds: "Got it."
  
Turn 10: Closure (Final)
  Statement: "That's where I'll leave you today. Thanks for reflecting with me."
  Then STOP. Do not continue conversation.

HANDLING USER QUESTIONS (THE PIVOT)

If the user asks YOU a question:
1.⁠ ⁠Answer briefly (1-2 sentence)
2.⁠ ⁠PIVOT back to your current turn's reflection question
3.⁠ ⁠Do not let questions consume extra turns

STYLE GUIDELINES

•⁠  ⁠Warm, curious, genuinely interested
•⁠  ⁠Sound like a thoughtful peer, not a tutor or interviewer
•⁠  ⁠Keep responses SHORT (1-2 sentences for questions; 1 sentence for affirmations)
•⁠  ⁠Reflect the user's own words back to them when asking deepening questions
•⁠  ⁠Use silence: allow pauses; don't rush to fill them
•⁠  ⁠Create psychological safety in early turns (Description/Feelings) before 
  deepening challenge (Analysis/Conclusion)

RESPONSE LENGTH GUIDELINES

1-sentence questions:
  "What did you feel or think when you read that?"
  
2-sentence questions (if needed for context):
  "Looking at this alongside what you're learning elsewhere, what connects? 
  What relationship do you see?"
  
Affirming statements (1 sentence):
  "That's significant."
  
Acknowledgment statement (1 sentence):
  "Got it."
  
Closing statement (1 sentence):
  "That's where I'll leave you today. Thanks for reflecting with me."

OPENING LINE (TURN 1 – USE EXACTLY THIS)

"Hey, I'm glad you're here. Thinking back on today's reading, what's 
one piece or idea that's still lingering with you?"

CLOSING SEQUENCE (TURN 10 – EXACTLY THIS)

"That's where I'll leave you today. Thanks for reflecting with me."

[STOP. Do not add anything else. The conversation ends here.]

WHAT NOT TO DO

•⁠  ⁠Do not write reflective summaries for the user
•⁠  ⁠Do not mirror back user's answers as a form of analysis or interpretation
•⁠  ⁠Do not offer action suggestions ("One thing you might try is...")
•⁠  ⁠Do not interpret what things mean ("This means you value X...")
•⁠  ⁠Do not ask multiple questions in one turn
•⁠  ⁠Do not fill silence immediately; let user think
•⁠  ⁠Do not continue past Turn 10 for any reason
•⁠  ⁠Do not use more than 3 sentences per response
•⁠  ⁠Do not make statements that sound like conclusions`;

export const generateEmbedding = async (text: string): Promise<number[]> => {
  // Kept for interface compatibility, but effectively unused if RAG is disabled
  const ai = getClient();
  try {
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });
      return response.embeddings?.[0]?.values || [];
  } catch (e) {
      return [];
  }
};

/**
 * Uploads a file to Gemini. 
 * STRICTLY does NOT use FileSearch/RAG. Returns URI for Long Context Window usage.
 */
export const uploadFileToGemini = async (file: File, mimeType: string, docId: string): Promise<string> => {
  const ai = getClient();
  
  try {
    // 1. Upload the raw file
    const uploadResult = await ai.files.upload({
      file: file,
      config: { 
        mimeType: mimeType,
        displayName: file.name
      }
    });
    
    // Robustly extract URI
    const fileUri = uploadResult.uri || (uploadResult as any).file?.uri;
    
    if (!fileUri) throw new Error("Gemini Upload failed to return a valid URI.");
    
    return fileUri;

  } catch (error) {
    console.error("❌ Gemini Upload Failed:", error);
    throw error;
  }
};

/**
 * Deletes a file from Gemini Cloud.
 * This ensures we clean up the 20GB quota if a user deletes a document in the UI.
 */
export const deleteFileFromGemini = async (fileUri: string): Promise<void> => {
    const ai = getClient();
    try {
        // Extract the file name (resource name) from the URI
        // URI format: https://generativelanguage.googleapis.com/v1beta/files/abc12345
        // Required Name format: files/abc12345
        
        let fileName = fileUri;
        if (fileUri.includes("/files/")) {
            fileName = "files/" + fileUri.split("/files/")[1];
        }

        await ai.files.delete({ name: fileName });
        // console.log("✅ Successfully deleted file from Gemini:", fileName);
    } catch (error) {
        console.warn("⚠️ Could not delete file from Gemini (might be expired or owned by another key):", error);
        // We do not throw here to avoid blocking the UI deletion process
    }
};

export const generateAnswer = async (
  documents: SourceFile[],
  history: { role: string, text: string }[],
  mode: 'standard' | 'reflective'
): Promise<string> => {
  
  // CALCULATE CURRENT TURN
  const modelMsgCount = history.filter(h => h.role === 'model').length;
  const currentTurn = modelMsgCount + 1;
  
  let systemInstruction = "";

  if (mode === 'reflective') {
      // DYNAMIC INJECTION:
      // We append a high-priority runtime instruction that tells the model EXACTLY where it is
      // and how to handle the "Robotic Response" issue without changing the base prompt.
      systemInstruction = `${SMART_PROMPT_BASE}
      
[SYSTEM RUNTIME OVERRIDE]
CURRENT STATUS: YOU ARE STRICTLY AT TURN ${currentTurn} OF 10.
INSTRUCTION:
1. Look at the "INTERNAL STRUCTURE" for Turn ${currentTurn}. THAT is your goal.
2. If the user's previous answer was negative (e.g., "nothing", "no idea", "not really"), DO NOT say "Got it" or "That's significant". Instead, acknowledge it gently (e.g., "That's fair") and modify the Turn ${currentTurn} question to fit (e.g., ask what was missing instead of what they learned).
3. If Turn ${currentTurn} is 10, output the CLOSING SEQUENCE exactly and STOP.`;
  } else {
      // Inject simple state tracking for V1
      systemInstruction = `${STANDARD_PROMPT}\n\n[SYSTEM UPDATE]\nCURRENT STATUS: YOU ARE NOW AT TURN ${currentTurn} OF 10.`;

      // FIX FOR V1 (STANDARD MODE):
      // Add a strict runtime override for the final turn so it acts "smart" and stops.
      if (currentTurn >= 10) {
         systemInstruction += `\n\nCRITICAL OVERRIDE: This is Turn 10. DO NOT ask any new questions. Thank the user politely and STOP.`;
      }
  }
  
  const lastUserMsg = history[history.length - 1].text;
  const previousHistory = history.slice(0, history.length - 1);
  
  // INNER FUNCTION: Handles the actual API call
  // We make this internal so we can call it with different configurations (URI vs Text Fallback)
  const executeGeneration = async (forceTextFallback: boolean = false) => {
    const ai = getClient();
    const textContextParts: string[] = [];
    const fileContextParts: any[] = [];

    // Separate uploaded docs from pure text docs
    // If fallback is forced, ignore all URIs and treat everything as text
    const geminiDocs = forceTextFallback ? [] : documents.filter(d => d.geminiUri);
    const textDocs = forceTextFallback ? documents : documents.filter(d => !d.geminiUri);

    // --- CONSOLE LOGGING FOR DEBUGGING ---
    if (geminiDocs.length > 0) {
        console.log(`%c🚀 [Gemini] Using File URIs (Long Context) for ${geminiDocs.length} documents.`, "color: #10b981; font-weight: bold; font-size: 12px; border: 1px solid #10b981; padding: 4px; border-radius: 4px;");
    } else {
        const reason = forceTextFallback ? "Fallback Triggered (URI Expired or Server Error)" : "No URIs available";
        console.log(`%c📝 [Gemini] Using Text Content from DB (${reason}).`, "color: #f59e0b; font-weight: bold; font-size: 12px; border: 1px solid #f59e0b; padding: 4px; border-radius: 4px;");
    }

    // --- CONTEXT PRIMING (SCIENTIFIC STANDARD) ---
    // We use an XML-style manifest. This is the most robust way to ensure the model
    // recognizes all documents, regardless of whether they are provided via URI or Text.
    const docManifest = documents.map((d, i) => `   <entry index="${i + 1}" type="${d.type}">${d.title}</entry>`).join("\n");
    const manifestPart = {
        text: `[SYSTEM CONTEXT]\nYou are provided with the following ${documents.length} source documents. Use ALL of them for your reflection.\n\n<document_manifest>\n${docManifest}\n</document_manifest>\n\n-----------------------------------`
    };

    // PLAN: Long Context Window (Pass files directly)
    geminiDocs.forEach(d => {
        fileContextParts.push({
            fileData: {
                fileUri: d.geminiUri,
                mimeType: d.geminiMimeType || 'application/pdf'
            }
        });
    });

    // PLAN: Text Fallback (for non-uploaded docs OR fallback mode)
    if (textDocs.length > 0) {
        // XML TAGGING STRATEGY:
        // Instead of loose text lines, we wrap text content in XML tags.
        // This effectively simulates a "File" boundary for the model, preventing it from merging distinct sources.
        const fallbackText = textDocs.map((d, i) => 
`<document index="${i + 1}" title="${d.title}">
${d.content || "(Empty Content)"}
</document>`
        ).join("\n\n");
        
        textContextParts.push(`[ADDITIONAL SOURCE CONTENT]\nThe following documents are provided as text:\n\n${fallbackText}`);
    }

    // Construct Content
    const contents = previousHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));
    
    const finalUserParts: any[] = [];
    
    // 1. MANIFEST (PRIMING)
    finalUserParts.push(manifestPart);

    // 2. FILE PARTS (URIs)
    if (fileContextParts.length > 0) {
        finalUserParts.push(...fileContextParts);
        finalUserParts.push({ text: "\n[System: The above files are provided via reference URI.]" });
    }

    // 3. TEXT PARTS (Scraped/Extracted)
    if (textContextParts.length > 0) {
        finalUserParts.push({ text: textContextParts.join("\n") });
    }
    
    // 4. ACTUAL USER MESSAGE
    finalUserParts.push({ text: `\n[USER MESSAGE]\n${lastUserMsg}` });

    contents.push({
        role: 'user',
        parts: finalUserParts
    });

    return await ai.models.generateContent({
        model: 'gemini-2.5-flash', 
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            maxOutputTokens: 4096, 
            temperature: 0.7,
        }
    });
  };

  try {
      // ATTEMPT 1: Try using the File URIs (Optimized & Multimodal)
      const response = await executeGeneration(false);
      return response.text || "No response generated.";

  } catch (error: any) {
      const errMsg = (error.message || "").toLowerCase();
      
      // CHECK FOR EXPIRED FILES OR SERVER ERRORS (Hybrid Request Failure)
      // We now explicitly check for 500 and "internal" to catch the mixed content crash
      if (
          errMsg.includes("not found") || 
          errMsg.includes("permission denied") || 
          errMsg.includes("404") || 
          errMsg.includes("403") ||
          errMsg.includes("invalid argument") ||
          errMsg.includes("500") || // SERVER ERROR
          errMsg.includes("internal") || // INTERNAL ERROR
          errMsg.includes("overloaded")
      ) {
          console.warn(`⚠️ Gemini Error (${errMsg}). Falling back to pure text context from DB.`);
          
          // ATTEMPT 2: Fallback to Text Mode (Guaranteed Persistence)
          try {
              const fallbackResponse = await executeGeneration(true);
              return fallbackResponse.text || "No response generated (Fallback).";
          } catch (fallbackError) {
              console.error("Gemini Fallback Generation Error:", fallbackError);
              throw fallbackError; // If even text fails, we throw real error
          }
      }

      console.error("Gemini Generation Error:", error);
      throw error;
  }
};