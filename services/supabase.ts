import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './gemini'; 

// Environment Variables
const viteEnv = (import.meta as any).env;

const SUPABASE_URL = 
  viteEnv?.VITE_SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  'https://dasfdedcymvskruytqxr.supabase.co';

const SUPABASE_ANON_KEY = 
  viteEnv?.VITE_SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhc2ZkZWRjeW12c2tydXl0cXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzYxODIsImV4cCI6MjA3OTUxMjE4Mn0.8ZRtNH419n-Ut6EhZtrJDvdtiN84wHsj3aMxxMVmXTg';

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

// --- API Keys (Chrome Extension) ---
export const fetchApiKey = async (label: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', user.id)
    .eq('label', label)
    .maybeSingle();

  if (error) {
    console.error("Error fetching API key:", error);
    return null;
  }
  return data;
};

export const createApiKey = async (label: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user");

  // Generate a random key prefixed with em_ (EchoMind)
  const key = 'em_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // Upsert ensures we update the key if it already exists for this label/user, or insert if not
  const { data, error } = await supabase
    .from('api_keys')
    .upsert(
      [{ user_id: user.id, label, key }], 
      { onConflict: 'user_id, label' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
};

// --- Documents ---
export const saveDocumentToCloud = async (title: string, content: string, type: string, pageCount?: number) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  let embedding = null;
  try {
      if (content.length > 50) {
          embedding = await generateEmbedding(content);
      }
  } catch (e) { console.warn("Embedding failed", e); }

  const { data, error } = await supabase
    .from('documents')
    .insert([{ user_id: user.id, title, content, type, embedding, is_read: false, page_count: pageCount }])
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
    .select('id, title, content, type, is_read, created_at, page_count')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return [];
  
  return data.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    type: doc.type,
    isRead: doc.is_read,
    isSelected: false,
    createdAt: new Date(doc.created_at).getTime(),
    pageCount: doc.page_count
  }));
};

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
        createdAt: new Date(doc.created_at).getTime(),
        pageCount: doc.page_count
    }));
};

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
    const { data } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    return data || [];
};

export const fetchChatMessages = async (sessionId: string) => {
    const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) return [];
    
    return data.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        text: msg.text,
        timestamp: new Date(msg.created_at).getTime(),
        isThinking: msg.is_thinking 
    }));
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