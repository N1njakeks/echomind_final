import React, { useState, useEffect, useRef } from 'react';
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
  History,
  Menu as MenuIcon,
  ChevronLeft
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
    <div className="flex items-center justify-center h-full bg-slate-100 p-4">
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
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
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 flex justify-center items-center text-base"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {isSignUp ? "Already have an account?" : "No account yet?"}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-indigo-600 hover:underline font-medium">
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
  const [documents, setDocuments] = useState<SourceFile[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'docs' | 'chats'>('docs');
  const [chatMode, setChatMode] = useState<'standard' | 'reflective'>('standard');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<SourceFile | null>(null);
  
  // Mobile UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
    setIsSidebarOpen(false);
  };

  const handleSelectSession = async (sessionId: string) => {
    setLoading(true);
    setIsSidebarOpen(false);
    try {
      const msgs = await fetchChatMessages(sessionId);
      setMessages(msgs);
      setCurrentSessionId(sessionId);
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
      await loadData();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
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

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      let sessionId = currentSessionId;
      const selectedDocs = documents.filter(d => d.isSelected);
      
      if (!sessionId) {
        const sessionData = await createChatSession(
          userMsg.text.slice(0, 30) + (userMsg.text.length > 30 ? "..." : ""), 
          selectedDocs.map(d => d.id)
        );
        sessionId = sessionData.id;
        setCurrentSessionId(sessionId);
        fetchChatSessions().then(setChatSessions);
      }

      await saveChatMessage(sessionId!, userMsg);

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

      const historyForAi = newMessages.map(m => ({ role: m.role, text: m.text }));
      const aiResponseText = await generateAnswer(context, historyForAi, chatMode);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: aiResponseText,
        timestamp: Date.now(),
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
    <div className="flex h-full bg-slate-50 text-slate-800 font-sans overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile Drawer / Desktop Fixed */}
      <div className={`
        fixed md:relative inset-y-0 left-0 w-72 md:w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl md:shadow-none z-30 transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center text-slate-700">
            <BrainCircuit className="w-5 h-5 mr-2 text-indigo-600" />
            EchoMind
          </h2>
          <div className="flex items-center space-x-2">
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-100">
          <button 
            onClick={() => setSidebarTab('docs')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${sidebarTab === 'docs' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <FileText className="w-4 h-4 mr-2" />
            Docs
          </button>
          <button 
            onClick={() => setSidebarTab('chats')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${sidebarTab === 'chats' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <History className="w-4 h-4 mr-2" />
            History
          </button>
        </div>

        {sidebarTab === 'docs' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4">
              <label className="flex items-center justify-center w-full px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 border-dashed cursor-pointer hover:bg-indigo-100 transition-colors">
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Upload className="w-5 h-5 mr-2" />
                )}
                <span className="font-medium text-sm">{uploading ? 'Wait...' : 'Upload Knowledge'}</span>
                <input type="file" className="hidden" accept=".pdf,.txt,.md,.json" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {documents.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">No documents.</div>
              )}
              {documents.map(doc => (
                <div 
                  key={doc.id} 
                  className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer ${
                    doc.isSelected ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'
                  } border`}
                  onClick={() => { setViewingDoc(doc); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
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
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                      <p className={`text-sm font-medium truncate ${doc.isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {doc.title}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sidebarTab === 'chats' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4">
              <button 
                onClick={handleNewChat}
                className="flex items-center justify-center w-full px-4 py-3 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2 text-indigo-600" />
                <span className="font-medium text-sm">New Chat</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {chatSessions.map(session => (
                <div 
                  key={session.id} 
                  onClick={() => handleSelectSession(session.id)}
                  className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer border ${
                    currentSessionId === session.id ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 mr-3 flex-shrink-0 ${currentSessionId === session.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <p className={`text-sm font-medium truncate ${currentSessionId === session.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                    {session.title || "Untitled Chat"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur-sm flex items-center px-4 md:px-6 justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center min-w-0 overflow-hidden">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 mr-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-base md:text-lg truncate">
                {currentSessionId ? (chatSessions.find(s => s.id === currentSessionId)?.title || "Chat") : "New Chat"}
              </h1>
              <div className="flex items-center text-[10px] md:text-xs text-slate-500 uppercase tracking-wider">
                <span className={chatMode === 'reflective' ? 'text-indigo-600 font-bold' : ''}>
                  {chatMode === 'reflective' ? "• Smart Mode" : "• Standard"}
                </span>
                {documents.some(d => d.isSelected) && (
                  <span className="ml-2 text-indigo-500 truncate italic">
                    ({documents.filter(d => d.isSelected).length} docs active)
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg scale-90 md:scale-100 origin-right">
            <button 
              onClick={() => setChatMode('standard')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all ${chatMode === 'standard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Base
            </button>
            <button 
              onClick={() => setChatMode('reflective')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all ${chatMode === 'reflective' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Smart
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 px-6 text-center">
              <BrainCircuit className="w-16 h-16 mb-4 opacity-20 text-indigo-600" />
              <p className="text-lg font-medium text-slate-400">EchoMind Knowledge Base</p>
              <p className="text-sm max-w-xs mt-2">Start a chat or select documents from the menu to analyze them with AI.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[90%] md:max-w-[80%] p-3.5 md:p-4 rounded-2xl shadow-sm text-[13px] md:text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
                }`}
              >
                {msg.isThinking && msg.role === 'model' && (
                  <div className="mb-2 pb-2 border-b border-slate-100 text-[9px] md:text-[10px] text-indigo-500 font-bold uppercase tracking-widest flex items-center">
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
               <div className="bg-white border border-slate-200 p-3 md:p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2">
                 <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                 <span className="text-xs text-slate-400 font-medium">EchoMind is thinking...</span>
               </div>
             </div>
          )}
        </div>

        <div className="p-3 md:p-4 bg-white border-t border-slate-200 shrink-0">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask anything..."
              className="w-full pl-4 md:pl-5 pr-12 py-3 md:py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white transition-all text-sm shadow-inner"
              disabled={loading}
            />
            <button 
              onClick={sendMessage}
              disabled={loading || !inputText.trim()}
              className="absolute right-2 p-2 md:p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Document Viewer Modal - Improved for Mobile */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewingDoc(null)}>
          <div 
            className="bg-white md:rounded-2xl shadow-2xl w-full h-full md:max-w-4xl md:h-[85vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-100 bg-white sticky top-0">
              <div className="flex items-center min-w-0 mr-4">
                <button onClick={() => setViewingDoc(null)} className="md:hidden p-2 mr-2 -ml-2 text-slate-500">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h3 className="font-bold text-slate-800 truncate text-sm md:text-base">{viewingDoc.title}</h3>
              </div>
              <button onClick={() => setViewingDoc(null)} className="hidden md:block p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-8 bg-slate-50/50">
              <pre className="whitespace-pre-wrap font-sans text-xs md:text-sm text-slate-600 leading-relaxed">
                {viewingDoc.content}
              </pre>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end md:hidden">
              <button 
                onClick={() => setViewingDoc(null)}
                className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}