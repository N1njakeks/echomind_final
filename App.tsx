import React, { useState, useEffect } from 'react';
import { supabase, signIn, signUp, signOut, fetchUserDocuments, saveDocumentToCloud, createChatSession, saveChatMessage, findSimilarDocuments, fetchChatSessions, fetchChatMessages } from './services/supabase';
import { generateAnswer, generateEmbedding } from './services/gemini';
import { extractTextFromPdf } from './services/pdf';
import { SourceFile, ChatMessage, ChatSession } from './types';
import { 
  LogOut, 
  FileText, 
  MessageSquare, 
  Send, 
  Loader2, 
  BrainCircuit, 
  Sparkles, 
  CheckSquare, 
  Square,
  Upload,
  X,
  MessageCircle,
  Plus,
  History
} from 'lucide-react';

// --- Auth Component ---
const AuthScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await signUp(email, password);
        setError('Check your email for confirmation link!');
      } else {
        await signIn(email, password);
        onLogin();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
        <div className="flex items-center justify-center mb-6 text-slate-800">
          <BrainCircuit className="w-10 h-10 mr-2 text-indigo-600" />
          <h1 className="text-2xl font-bold tracking-tight">EchoMind KB</h1>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {isSignUp ? "Already have an account?" : "No account yet?"}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-indigo-600 hover:underline">
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [session, setSession] = useState<any>(null);
  
  // Data State
  const [documents, setDocuments] = useState<SourceFile[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // UI State
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'docs' | 'chats'>('docs');
  
  // Chat Configuration
  const [chatMode, setChatMode] = useState<'standard' | 'reflective'>('standard');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<SourceFile | null>(null);

  // Initialize
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadData();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadData();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    const [docs, sessions] = await Promise.all([
      fetchUserDocuments(),
      fetchChatSessions()
    ]);
    setDocuments(docs);
    setChatSessions(sessions);
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setDocuments([]);
    setMessages([]);
    setChatSessions([]);
    setCurrentSessionId(null);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setChatMode('standard');
  };

  const handleSelectSession = async (sessionId: string) => {
    setLoading(true);
    try {
      const msgs = await fetchChatMessages(sessionId);
      setMessages(msgs);
      setCurrentSessionId(sessionId);
      
      // Determine mode based on last message style or keep standard
      // If the last model message was "thinking", we could switch mode, 
      // but purely visual indication is usually enough.
    } catch (e) {
      console.error("Failed to load session", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let content = '';
      let type = 'text';

      if (file.type === 'application/pdf') {
        type = 'pdf';
        content = await extractTextFromPdf(file);
      } else {
        content = await file.text();
      }

      await saveDocumentToCloud(file.name, content, type);
      await loadData(); // Refresh list
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload file. See console.");
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const toggleDocumentSelection = (id: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === id ? { ...doc, isSelected: !doc.isSelected } : doc
    ));
  };

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      // 1. Ensure Session exists
      let sessionId = currentSessionId;
      const selectedDocs = documents.filter(d => d.isSelected);
      
      if (!sessionId) {
        const sessionData = await createChatSession(
          userMsg.text.slice(0, 30) + (userMsg.text.length > 30 ? "..." : ""), 
          selectedDocs.map(d => d.id)
        );
        sessionId = sessionData.id;
        setCurrentSessionId(sessionId);
        // Refresh session list to show new chat in sidebar
        fetchChatSessions().then(setChatSessions);
      }

      await saveChatMessage(sessionId!, userMsg);

      // 2. RAG Logic
      let context = "";
      
      if (selectedDocs.length > 0) {
        context = selectedDocs.map(d => `Document: ${d.title}\nContent: ${d.content}`).join("\n\n");
      } else {
        const embedding = await generateEmbedding(userMsg.text);
        const similarDocs = await findSimilarDocuments(embedding);
        if (similarDocs && similarDocs.length > 0) {
            context = similarDocs.map((d: any) => `Document: ${d.title}\nContent: ${d.content}`).join("\n\n");
        }
      }

      // 3. Generate Answer
      const aiResponseText = await generateAnswer(context, userMsg.text, chatMode);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: aiResponseText,
        timestamp: Date.now(),
        // IMPORTANT: Set isThinking based on mode. This is saved to DB via saveChatMessage
        isThinking: chatMode === 'reflective'
      };

      setMessages(prev => [...prev, aiMsg]);
      await saveChatMessage(sessionId!, aiMsg);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: "Sorry, I encountered an error processing your request.",
        timestamp: Date.now()
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!session) return <AuthScreen onLogin={() => {}} />;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Sidebar - Knowledge Base & History */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center text-slate-700">
            <BrainCircuit className="w-5 h-5 mr-2 text-indigo-600" />
            EchoMind
          </h2>
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Tabs */}
        <div className="flex border-b border-slate-100">
          <button 
            onClick={() => setSidebarTab('docs')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${sidebarTab === 'docs' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <FileText className="w-4 h-4 mr-2" />
            Documents
          </button>
          <button 
            onClick={() => setSidebarTab('chats')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${sidebarTab === 'chats' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <History className="w-4 h-4 mr-2" />
            History
          </button>
        </div>

        {/* Tab Content: Documents */}
        {sidebarTab === 'docs' && (
          <>
            <div className="p-4">
              <label className="flex items-center justify-center w-full px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 border-dashed cursor-pointer hover:bg-indigo-100 transition-colors">
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Upload className="w-5 h-5 mr-2" />
                )}
                <span className="font-medium text-sm">{uploading ? 'Processing...' : 'Upload PDF / Text'}</span>
                <input type="file" className="hidden" accept=".pdf,.txt,.md,.json" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-2">
              {documents.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">
                  No documents yet.<br/>Upload knowledge to begin.
                </div>
              )}
              {documents.map(doc => (
                <div 
                  key={doc.id} 
                  className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer ${
                    doc.isSelected ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'
                  } border`}
                  onClick={() => setViewingDoc(doc)}
                >
                  <button 
                    className="mr-3 text-slate-400 group-hover:text-indigo-600 p-1 rounded hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDocumentSelection(doc.id);
                    }}
                  >
                    {doc.isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-0.5">
                      <FileText className="w-3 h-3 mr-1.5 text-slate-400" />
                      <p className={`text-sm font-medium truncate ${doc.isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {doc.title}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 truncate pl-5">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tab Content: Chats */}
        {sidebarTab === 'chats' && (
          <>
            <div className="p-4">
              <button 
                onClick={handleNewChat}
                className="flex items-center justify-center w-full px-4 py-3 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2 text-indigo-600" />
                <span className="font-medium text-sm">New Conversation</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              {chatSessions.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">
                  No history yet.
                </div>
              )}
              {chatSessions.map(session => (
                <div 
                  key={session.id} 
                  onClick={() => handleSelectSession(session.id)}
                  className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer border ${
                    currentSessionId === session.id 
                      ? 'bg-indigo-50 border-indigo-100' 
                      : 'hover:bg-slate-50 border-transparent border-b-slate-50'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 mr-3 flex-shrink-0 ${currentSessionId === session.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${currentSessionId === session.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {session.title || "Untitled Chat"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-sm flex items-center px-6 justify-between sticky top-0 z-10">
          <div>
            <h1 className="font-bold text-slate-800 text-lg">
              {currentSessionId ? (chatSessions.find(s => s.id === currentSessionId)?.title || "Chat") : "New Chat"}
            </h1>
            <p className="text-xs text-slate-500">
              {chatMode === 'reflective' ? "Reflective Coach (Smart)" : "Standard Assistant"}
            </p>
          </div>
          
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setChatMode('standard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center transition-all ${chatMode === 'standard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
              Standard
            </button>
            <button 
              onClick={() => setChatMode('reflective')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center transition-all ${chatMode === 'reflective' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Smart
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium text-slate-400">Start a conversation</p>
              <p className="text-sm">Select documents from the left to chat with context.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
                }`}
              >
                {/* Visual indicator for Reflective/Thinking messages */}
                {msg.isThinking && msg.role === 'model' && (
                  <div className="mb-2 pb-2 border-b border-slate-100 text-xs text-indigo-500 font-medium flex items-center">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Reflective Insight
                  </div>
                )}
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex w-full justify-start">
               <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2">
                 <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                 <span className="text-xs text-slate-500 font-medium">
                   {chatMode === 'reflective' ? "Reflecting..." : "Typing..."}
                 </span>
               </div>
             </div>
          )}
          <div id="scroll-anchor" />
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={documents.some(d => d.isSelected) ? `Ask about ${documents.filter(d=>d.isSelected).length} selected documents...` : "Ask anything..."}
              className="w-full pl-5 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white transition-all text-sm"
              disabled={loading}
            />
            <button 
              onClick={sendMessage}
              disabled={loading || !inputText.trim()}
              className="absolute right-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setViewingDoc(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{viewingDoc.title}</h3>
                  <p className="text-xs text-slate-500">{new Date(viewingDoc.createdAt).toLocaleString()} • {viewingDoc.type}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingDoc(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="prose prose-slate max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600 leading-relaxed">
                  {viewingDoc.content}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setViewingDoc(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}