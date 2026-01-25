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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching API key:", error);
    return null;
  }
  return data;
};

export const createApiKey = async (label: string) => {
  const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  const key = `sk_app_${uuid.replace(/-/g, '')}`;

  await supabase
    .from('api_keys')
    .delete()
    .eq('label', label);

  const { data, error } = await supabase
    .from('api_keys')
    .insert([{ key, label }]) 
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
  // REMOVED: Summary generation logic

  try {
      // 1. Generate Embedding only
      if (content.length > 50) {
          embedding = await generateEmbedding(content);
      }
  } catch (e) { console.warn("AI Processing failed", e); }

  const { data, error } = await supabase
    .from('documents')
    .insert([{ 
        user_id: user.id, 
        title, 
        content, 
        type, 
        embedding, 
        // summary: "", // Removed summary field from insert
        is_read: false 
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// NEW: Update document summary specifically
export const updateDocumentSummary = async (docId: string, summary: string) => {
  const { error } = await supabase
    .from('documents')
    .update({ summary: summary })
    .eq('id', docId);

  if (error) {
    console.error("Error updating summary:", error);
    throw error;
  }
};

export const fetchUserDocuments = async (userId?: string) => {
  let uid = userId;
  if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      uid = user.id;
  }

  // REVERT: Added 'content' back to select so it loads immediately.
  // Added 'summary' to select (can keep fetching it, just won't use it much)
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, content, summary, type, is_read, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Fetch docs error:", error);
    return [];
  }
  
  return data.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content, 
    summary: doc.summary, 
    type: doc.type,
    isRead: doc.is_read,
    isSelected: false,
    createdAt: new Date(doc.created_at).getTime(),
    pageCount: 1 // Default fallback
  }));
};

export const fetchDocumentContent = async (id: string): Promise<string> => {
    const { data, error } = await supabase
        .from('documents')
        .select('content')
        .eq('id', id)
        .single();
        
    if (error || !data) {
        throw new Error("Could not fetch content");
    }
    return data.content;
};

export const deleteDocument = async (id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user");

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;
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
        .select('id, title, content, type, created_at') 
        .in('id', ids);

    return (docs || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        type: doc.type,
        createdAt: new Date(doc.created_at).getTime(),
        pageCount: 1
    }));
};

export const createChatSession = async (title: string, sourceIds: string[], mode: 'standard' | 'reflective') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");
    
    let fallbackTitle = title;
    if (mode === 'reflective') {
        fallbackTitle = `${title} [V2]`;
    }
    
    const { data, error } = await supabase
        .from('chat_sessions')
        .insert([{ user_id: user.id, title: fallbackTitle, source_ids: sourceIds }])
        .select().single();
        
    if (error) throw error;
    
    return { ...data, title: title, mode: mode }; 
};

export const fetchChatSessions = async (userId?: string) => {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        uid = user.id;
    }

    const { data } = await supabase
        .from('chat_sessions')
        .select('*') 
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
        
    return (data || []).map((session: any) => {
        let mode = 'standard';
        let title = session.title;

        if (title && title.includes('[V2]')) {
            mode = 'reflective';
            title = title.replace('[V2]', '').trim();
        }

        return {
            ...session,
            title,
            mode: mode
        };
    });
};

export const deleteChatSession = async (sessionId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user");

  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) throw error;
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

// --- Questionnaire ---
export const submitQuestionnaire = async (data: any) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user");

  const payload = {
    ...data,
    user_id: user.id,
  };

  const { error } = await supabase
    .from('questionnaire_responses')
    .insert([payload]);

  if (error) throw error;
};
