import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './gemini'; 

// Environment Variables
// Fix for Vercel/Vite: Check import.meta.env first
const viteEnv = (import.meta as any).env;

const SUPABASE_URL = 
  viteEnv?.VITE_SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  'https://dasfdedcymvskruytqxr.supabase.co';

const SUPABASE_ANON_KEY = 
  viteEnv?.VITE_SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhc2ZkZWRjeW12c2tydXl0cXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzYxODIsImV4cCI6MjA3OTUxMjE4Mn0.8ZRtNH419n-Ut6EhZtrJDvdtiN84wHsj3aMxxMVmXTg';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase credentials missing. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Auth ---
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

// --- Documents ---
export const saveDocumentToCloud = async (title: string, content: string, type: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  // Embedding Generation Logic (wird in gemini.ts implementiert)
  let embedding = null;
  try {
      if (content.length > 50) {
          embedding = await generateEmbedding(content);
      }
  } catch (e) { console.warn("Embedding failed", e); }

  const { data, error } = await supabase
    .from('documents')
    .insert([{ user_id: user.id, title, content, type, embedding, is_read: false }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const fetchUserDocuments = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('documents')
    .select('id, title, content, type, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return [];
  
  return data.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    type: doc.type,
    isRead: doc.is_read,
    isSelected: false, // Default UI state
    createdAt: new Date(doc.created_at).getTime()
  }));
};

// --- Vector Search (RAG) ---
// WICHTIG: Nutzt die existierende RPC Funktion 'match_documents'
export const findSimilarDocuments = async (embedding: number[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.5, 
        match_count: 5,
        filter_user_id: user.id
    });

    if (error || !data) return [];
    
    // Fetch full content for context
    const ids = data.map((d: any) => d.id);
    if (ids.length === 0) return [];

    const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .in('id', ids);

    return (docs || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        type: doc.type,
        createdAt: new Date(doc.created_at).getTime()
    }));
};

// --- Chat Persistence ---
export const createChatSession = async (title: string, sourceIds: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");
    
    const { data, error } = await supabase
        .from('chat_sessions')
        .insert([{ user_id: user.id, title, source_ids: sourceIds }])
        .select().single();
    if (error) throw error;
    return data;
};

export const fetchChatSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase.from('chat_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return data || [];
};

export const saveChatMessage = async (sessionId: string, message: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('chat_messages').insert([{
        session_id: sessionId,
        user_id: user.id,
        role: message.role,
        text: message.text,
        is_thinking: message.isThinking || false
    }]);
};