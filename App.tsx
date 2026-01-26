import React, { useState, useEffect, useRef } from 'react';
import { supabase, signIn, signUp, signOut, fetchUserDocuments, saveDocumentToCloud, createChatSession, saveChatMessage, findSimilarDocuments, fetchChatSessions, fetchChatMessages, deleteDocument, fetchDocumentContent, deleteChatSession, updateDocumentSummary, getQuestionnaireStatus } from './services/supabase';
import { generateAnswer, generateEmbedding, setGeminiApiKey } from './services/gemini';
import { extractTextFromPdf } from './services/pdf';
import { SourceFile, ChatMessage, ChatSession } from './types';
import ChromeExtensionSettings from './components/ChromeExtensionSettings';
import QuestionnaireModal from './components/QuestionnaireModal';
import ApiKeyModal from './components/ApiKeyModal';
import { 
  LogOut, 
  FileText, 
  MessageSquare, 
  Send, 
  Loader2, 
  BrainCircuit, 
  CheckSquare, 
  Square,
  Upload,
  X,
  Plus,
  Menu as MenuIcon,
  ChevronLeft,
  Sparkles,
  Settings,
  Trash2,
  Lock,
  Info,
  ClipboardList,
  Library,
  History as HistoryIcon
} from 'lucide-react';

const MAX_MESSAGES_PER_SESSION = 10;

// --- Initial Loader Component ---
const InitialLoader = () => (
  <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 animate-in fade-in duration-500">
    <div className="flex flex-col items-center space-y-8">
      <div className="flex items-center space-x-4">
        <BrainCircuit className="w-12 h-12 text-slate-800 animate-pulse" />
        <h1 className="text-4xl font-bold text-slate-800 tracking-tight">EchoMind</h1>
      </div>
      
      <div className="flex flex-col items-center space-y-3">
        <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-slate-800 animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '30%' }}></div>
        </div>
        <p className="text-slate-400 text-sm font-medium tracking-wide animate-pulse">
          Synchronizing knowledge base...
        </p>
      </div>
    </div>
    <style>{`
      @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
    `}</style>
  </div>
);

// --- Auth Screen Component ---
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
          <BrainCircuit className="w-10 h-10 mr-2 text-slate-700" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">EchoMind</h1>
        </div>
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input type="email" required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:outline-none text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <input type="password" required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:outline-none text-base" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-slate-800 text-white py-3 rounded-lg hover:bg-slate-900 transition-colors font-medium disabled:opacity-50 flex justify-center items-center text-base">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          {isSignUp ? "Already have an account?" : "No account yet?"}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-slate-800 hover:underline font-medium">{isSignUp ? 'Sign In' : 'Sign Up'}</button>
        </p>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [documents, setDocuments] = useState<SourceFile[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Chat State
  const [chatMode, setChatMode] = useState<'standard' | 'reflective'>('standard');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // NEW: Manual selection state for new sessions
  const [selectedMode, setSelectedMode] = useState<'standard' | 'reflective'>('standard');

  const [viewingDoc, setViewingDoc] = useState<SourceFile | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Questionnaire State
  const [questionnaireType, setQuestionnaireType] = useState<'pre' | 'post' | null>(null);
  const [surveyStatus, setSurveyStatus] = useState({ pre: false, post: false });

  // API Key State
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // STUDY LOGIC: Calculate existing modes
  const hasV1 = chatSessions.some(s => s.mode === 'standard');
  const hasV2 = chatSessions.some(s => s.mode === 'reflective');
  const sessionLimitReached = hasV1 && hasV2;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        await loadData(session.user.id);
        const status = await getQuestionnaireStatus();
        setSurveyStatus(status);
        // We will prompt for Pre-Survey only when user tries to Start Session
      }
      setIsAppLoading(false);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setDocuments([]);
        setMessages([]);
        setChatSessions([]);
        setCurrentSessionId(null);
        setSurveyStatus({ pre: false, post: false });
        setUserApiKey(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session);
        if (session) {
            loadData(session.user.id);
            getQuestionnaireStatus().then(status => setSurveyStatus(status));
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!currentSessionId) {
      if (selectedMode === 'standard' && hasV1 && !hasV2) setSelectedMode('reflective');
      if (selectedMode === 'reflective' && hasV2 && !hasV1) setSelectedMode('standard');
    }
  }, [hasV1, hasV2, currentSessionId, selectedMode]);

  const loadData = async (userId?: string) => {
    let uid = userId || (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return;
    try {
      const [docs, sessions] = await Promise.all([fetchUserDocuments(uid), fetchChatSessions(uid)]);
      setDocuments(docs);
      setChatSessions(sessions);
    } catch (e: any) {
      console.error("Failed to load data", e);
      if (e.message?.includes("refresh_token")) await handleLogout();
    }
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setDocuments([]);
    setMessages([]);
    setChatSessions([]);
    setCurrentSessionId(null);
    setUserApiKey(null);
  };

  const handleNewChat = () => {
    if (sessionLimitReached) {
        alert("Limit reached: You have already created both V1 & V2 chats.");
        return;
    }
    setMessages([]);
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
    if (!hasV1) setSelectedMode('standard');
    else if (!hasV2) setSelectedMode('reflective');
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat session?")) return;
    try {
      await deleteChatSession(id);
      const updatedSessions = chatSessions.filter(s => s.id !== id);
      setChatSessions(updatedSessions);
      if (currentSessionId === id) {
        setMessages([]);
        setCurrentSessionId(null);
      }
    } catch (err) {
      console.error("Failed to delete chat", err);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setLoading(true);
    setIsSidebarOpen(false);
    
    // Check for API key before accessing old sessions too, if needed?
    // For now, we assume user might need to re-enter key if they refresh.
    if (!userApiKey) {
        // If we want to force key on old sessions too:
        // setShowApiKeyModal(true);
        // But let's assume the Start Flow handles the initial key entry.
        // If they click an old session without a key, they might get an error on send.
        // We'll prompt them when they try to send if key is missing (implicit in handleSend).
        // For better UX, let's just prompt now if missing.
        setShowApiKeyModal(true);
        // We continue to load UI, but they can't send until key is in.
    }

    try {
      const msgs = await fetchChatMessages(sessionId);
      const session = chatSessions.find(s => s.id === sessionId);
      setMessages(msgs);
      setCurrentSessionId(sessionId);
      if (session?.mode) setChatMode(session.mode);
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
      let content = '', type = 'text', pageCount = 1;
      if (file.type === 'application/pdf') {
        type = 'pdf';
        const pdfData = await extractTextFromPdf(file);
        content = pdfData.text;
        pageCount = pdfData.pageCount;
      } else content = await file.text();
      await saveDocumentToCloud(file.name, content, type, pageCount);
      if (session?.user?.id) await loadData(session.user.id);
    } catch (err) { console.error("Upload failed", err); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    if (!confirm("Delete document?")) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (viewingDoc?.id === id) setViewingDoc(null);
    } catch (err) { console.error("Failed to delete document", err); }
  };

  const toggleDocumentSelection = (id: string) => {
    setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, isSelected: !doc.isSelected } : doc));
  };

  const handleViewDocument = async (doc: SourceFile) => {
    setViewingDoc(doc);
    if(window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // --- NEW FLOW START ---
  const handleStartSessionClick = () => {
    // 1. Check Limit
    if (sessionLimitReached) {
        alert("Limit reached: You have already created both V1 & V2 chats. Please use the existing sessions in history.");
        return;
    }

    // 2. Check Docs
    const selectedFiles = documents.filter(d => d.isSelected);
    // Note: We allow starting without docs if they want generic chat, but typically we want docs.
    // If you want to enforce docs:
    /* if (selectedFiles.length === 0) { alert("Please select at least one document from the Knowledge Base."); return; } */

    // 3. Check Pre-Survey
    if (!surveyStatus.pre) {
        setQuestionnaireType('pre');
        return;
    }

    // 4. Check API Key
    if (!userApiKey) {
        setShowApiKeyModal(true);
        return;
    }

    // 5. Create Session
    initiateNewStudySession(selectedFiles);
  };

  const initiateNewStudySession = async (selectedFiles: SourceFile[]) => {
    // Determine mode
    let modeToCreate = selectedMode;
    if (modeToCreate === 'standard' && hasV1) modeToCreate = 'reflective';
    if (modeToCreate === 'reflective' && hasV2) modeToCreate = 'standard';
    
    setMessages([]);
    
    try {
      const sourceIds = selectedFiles.map(d => d.id);
      const title = `Session (${modeToCreate === 'standard' ? 'V1' : 'V2'})`;
      const sessionData = await createChatSession(title, sourceIds, modeToCreate);
      
      setCurrentSessionId(sessionData.id);
      setChatMode(modeToCreate);
      
      if (session?.user?.id) {
        const updatedSessions = await fetchChatSessions(session.user.id);
        setChatSessions(updatedSessions);
      }
      
    } catch (e) {
      console.error("Study session initialization failed", e);
      alert("Error creating session. Please try again.");
    }
  };

  // Called when Pre-Questionnaire finishes
  const handleSurveyComplete = async () => {
      await updateSurveyStatus();
      setQuestionnaireType(null);
      // Immediately Prompt for API Key after Pre-Survey
      if (!userApiKey) {
          setShowApiKeyModal(true);
      }
  };

  const handleApiKeySubmit = (key: string) => {
      setGeminiApiKey(key);
      setUserApiKey(key);
      setShowApiKeyModal(false);
      
      // If we were trying to start a session, retry now
      // Logic: If we are not in a session, and have selected docs, we likely clicked start.
      // Or we can just let them click start again. 
      // Better UX: If no current session, trigger the start logic.
      if (!currentSessionId) {
           const selectedFiles = documents.filter(d => d.isSelected);
           if (sessionLimitReached) return;
           initiateNewStudySession(selectedFiles);
      }
  };

  const updateSurveyStatus = async () => {
      const status = await getQuestionnaireStatus();
      setSurveyStatus(status);
  };

  const sendMessage = async (overrideText?: string) => {
    const textToUse = overrideText || inputText;
    if (!textToUse.trim() || loading || !currentSessionId) return;
    
    // Check API Key again just in case
    if (!userApiKey) {
        setShowApiKeyModal(true);
        return;
    }

    const userMsgCount = messages.filter(m => m.role === 'user').length;
    if (userMsgCount >= MAX_MESSAGES_PER_SESSION) return;
    
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: textToUse, timestamp: Date.now(), isThinking: chatMode === 'reflective' };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      await saveChatMessage(currentSessionId, userMsg);
      const selectedDocs = documents.filter(d => d.isSelected);
      
      // We only use selected docs for context if they are explicitly selected in the sidebar
      // Otherwise we fall back to RAG if no selection? 
      // For this study, let's assume the session is bound to the IDs saved in DB, 
      // OR we just use whatever is currently checked in the sidebar as "Active Context".
      // Let's stick to sidebar selection as "Active Context".
      
      let context = "";
      if (selectedDocs.length > 0) {
          context = selectedDocs.map(d => `Document: ${d.title}\nContent: ${d.content || ""}`).join("\n\n");
      } else {
         // Fallback RAG if nothing selected? Or just chat?
         // Let's do simple RAG if nothing selected, using embedding
         const similar = await findSimilarDocuments(await generateEmbedding(textToUse));
         context = similar.map((d: any) => `Document: ${d.title}\nContent: ${d.content}`).join("\n\n");
      }

      const aiResponseText = await generateAnswer(context, newMessages.map(m => ({ role: m.role, text: m.text })), chatMode);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', text: aiResponseText, timestamp: Date.now(), isThinking: chatMode === 'reflective' };
      
      setMessages(prev => [...prev, aiMsg]);
      await saveChatMessage(currentSessionId, aiMsg);

      // --- STUDY TRIGGER LOGIC ---
      const updatedUserCount = newMessages.filter(m => m.role === 'user').length;
      if (updatedUserCount >= MAX_MESSAGES_PER_SESSION) {
         if (hasV1 && hasV2) {
             if (!surveyStatus.post) {
                 setTimeout(() => {
                     setQuestionnaireType('post');
                 }, 1500);
             }
         }
      }

    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "Request error.";
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: `Error: ${errMsg}`, timestamp: Date.now() }]);
    } finally { setLoading(false); }
  };

  if (isAppLoading) return <InitialLoader />;
  if (!session) return <AuthScreen onLogin={() => {}} />;

  const totalPages = documents.reduce((sum, d) => sum + (d.pageCount || 1), 0);
  const isSessionLocked = !!currentSessionId;
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isLimitReached = userMessageCount >= MAX_MESSAGES_PER_SESSION;

  const displayMode = currentSessionId ? chatMode : selectedMode;

  return (
    <div className="flex h-[100dvh] bg-slate-50 text-slate-800 font-sans overflow-hidden relative">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed md:relative inset-y-0 left-0 w-72 md:w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl md:shadow-none z-30 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg flex items-center text-slate-700"><BrainCircuit className="w-5 h-5 mr-2 text-slate-600" />EchoMind</h2>
          <div className="flex items-center space-x-1">
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Settings className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><LogOut className="w-4 h-4" /></button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* --- SIDEBAR CONTENT --- */}
        <div className="flex-1 flex flex-col min-h-0 border-b border-slate-100 relative">
            <div className="px-4 py-2 bg-slate-50/50 flex items-center justify-between border-b border-slate-100 shrink-0">
                 <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Library className="w-3.5 h-3.5 mr-1.5" /> Knowledge
                 </div>
                 <label className="cursor-pointer p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors" title="Upload">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <input type="file" className="hidden" accept=".pdf,.txt,.md,.json" onChange={handleFileUpload} />
                 </label>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 text-slate-400 px-4 text-center"><span className="text-xs">No documents. Add some!</span></div>
              ) : documents.map(doc => (
                <div key={doc.id} className={`group flex items-center p-2 mb-1 rounded-md transition-all cursor-pointer ${doc.isSelected ? 'bg-slate-100 border-slate-200' : 'hover:bg-slate-50 border-transparent'} border`} onClick={() => handleViewDocument(doc)}>
                  <button className="mr-3 text-slate-400 shrink-0" onClick={(e) => { e.stopPropagation(); toggleDocumentSelection(doc.id); }}>
                    {doc.isSelected ? <CheckSquare className="w-4 h-4 text-slate-800" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0"><p className={`text-xs md:text-sm font-medium truncate ${doc.isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{doc.title}</p></div>
                  <button onClick={(e) => handleDeleteDocument(e, doc.id)} className="ml-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            
            {/* Start Button in Sidebar */}
            <div className="p-3 border-t border-slate-100 shrink-0 bg-white z-10">
              <button 
                onClick={handleStartSessionClick} 
                disabled={sessionLimitReached}
                className={`w-full py-2 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm transition-all ${sessionLimitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
              >
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                {sessionLimitReached ? 'Limit reached' : `Start ${selectedMode === 'reflective' ? 'V2' : 'V1'} Session`}
              </button>
            </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
            <div className="px-4 py-2 bg-slate-50/50 flex items-center justify-between border-b border-slate-100 shrink-0">
                 <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <HistoryIcon className="w-3.5 h-3.5 mr-1.5" /> History
                 </div>
                 <button 
                    onClick={handleNewChat}
                    disabled={sessionLimitReached}
                    className={`p-1 rounded text-slate-400 transition-colors ${sessionLimitReached ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200 cursor-pointer'}`}
                    title="New Session"
                 >
                    <Plus className="w-3.5 h-3.5" />
                 </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {chatSessions.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-20 text-slate-400 px-4 text-center">
                    <span className="text-xs">No sessions yet.</span>
                    <span className="text-[10px] mt-1 text-amber-500">Create 1x V1 & 1x V2</span>
                 </div>
              )}
              {chatSessions.map(session => (
                <div key={session.id} onClick={() => handleSelectSession(session.id)} className={`group flex items-center p-2 mb-1 rounded-md transition-all cursor-pointer border ${currentSessionId === session.id ? 'bg-white border-slate-200 shadow-sm' : 'hover:bg-white/50 border-transparent'}`}>
                  <div className="mr-3 flex-shrink-0 relative">
                     <MessageSquare className={`w-4 h-4 ${currentSessionId === session.id ? 'text-slate-800' : 'text-slate-400'}`} />
                     {session.mode === 'reflective' && <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full ring-1 ring-white" title="V2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs md:text-sm font-medium truncate ${currentSessionId === session.id ? 'text-slate-900' : 'text-slate-700'}`}>{session.title || "Untitled"}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{session.mode === 'reflective' ? 'V2' : 'V1'}</p>
                  </div>
                  <button onClick={(e) => handleDeleteChat(e, session.id)} className="ml-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
        </div>

      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur-sm flex items-center px-4 md:px-6 justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center min-w-0 overflow-hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-2 text-slate-500 hover:bg-slate-100 rounded-lg"><MenuIcon className="w-6 h-6" /></button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-base md:text-lg truncate">{currentSessionId ? (chatSessions.find(s => s.id === currentSessionId)?.title || "Session") : "New Session"}</h1>
              <div className="flex items-center gap-3 text-[10px] md:text-xs text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                <span className={displayMode === 'reflective' ? 'text-indigo-500 font-bold' : ''}>{displayMode === 'reflective' ? "V2" : "V1"}</span>
                {currentSessionId && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className={isLimitReached ? "text-red-500" : ""}>{userMessageCount} / {MAX_MESSAGES_PER_SESSION}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
             {/* STUDY BUTTONS */}
             <div className="flex mr-2 gap-1">
                <button 
                  onClick={() => setQuestionnaireType('pre')}
                  className={`flex items-center justify-center py-1.5 px-3 text-[10px] md:text-xs rounded font-bold transition-all ${surveyStatus.pre ? 'bg-green-100 text-green-700' : 'bg-slate-800 text-white'}`}
                >
                  {surveyStatus.pre ? <CheckSquare className="w-3 h-3 mr-1"/> : <ClipboardList className="w-3 h-3 mr-1" />} Pre
                </button>
                <button 
                  onClick={() => setQuestionnaireType('post')}
                  className={`flex items-center justify-center py-1.5 px-3 text-[10px] md:text-xs rounded font-bold transition-all ${surveyStatus.post ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white'}`}
                >
                   {surveyStatus.post ? <CheckSquare className="w-3 h-3 mr-1"/> : <ClipboardList className="w-3 h-3 mr-1" />} Post
                </button>
             </div>

            <div className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => !currentSessionId && !hasV1 && setSelectedMode('standard')}
                  disabled={!!currentSessionId || hasV1}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all 
                    ${displayMode === 'standard' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}
                    ${!currentSessionId && !hasV1 ? 'hover:text-slate-800 cursor-pointer' : 'cursor-default opacity-70'}
                  `}
                >
                  V1
                </button>
                <button 
                  onClick={() => !currentSessionId && !hasV2 && setSelectedMode('reflective')}
                  disabled={!!currentSessionId || hasV2}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all 
                    ${displayMode === 'reflective' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}
                    ${!currentSessionId && !hasV2 ? 'hover:text-slate-800 cursor-pointer' : 'cursor-default opacity-70'}
                  `}
                >
                  V2
                </button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto relative overscroll-contain">
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-32 md:pb-20">
              {messages.length === 0 && !currentSessionId && (
                <div className="h-96 flex flex-col items-center justify-center text-slate-300 px-6 text-center">
                  {documents.length > 0 ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4 mx-auto text-slate-600"><FileText className="w-6 h-6" /></div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Select & Start</h3>
                        <p className="text-slate-500 mb-6 text-sm leading-relaxed">
                            Use the checkboxes in the sidebar to select documents. <br/>Then click "Start Session".
                        </p>
                        <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-400 border border-slate-100">
                           {documents.filter(d => d.isSelected).length} Documents selected
                        </div>
                    </div>
                  ) : <><BrainCircuit className="w-16 h-16 mb-4 opacity-10" /><p className="text-sm">Ready for uploads.</p></>}
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] md:max-w-[80%] p-3.5 md:p-4 rounded-2xl shadow-sm text-[13px] md:text-sm whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}>{msg.text}</div>
                </div>
              ))}
              {loading && <div className="flex w-full justify-start"><div className="bg-white border border-slate-200 p-3 md:p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /><span className="text-xs text-slate-400">Processing...</span></div></div>}
              {isLimitReached && <div className="flex w-full justify-center mt-6"><div className="bg-slate-100 border border-slate-200 text-slate-500 text-xs py-2 px-4 rounded-full flex items-center"><Lock className="w-3 h-3 mr-2" />Limit reached for this session.</div></div>}
            </div>
        </div>

        {currentSessionId && (
          <div className="p-3 md:p-4 bg-white border-t border-slate-200 shrink-0 z-20 shadow-[0_-8px_20px_-5px_rgba(0,0,0,0.05)] md:shadow-none pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="max-w-4xl mx-auto relative flex items-center">
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isLimitReached && sendMessage()} placeholder={isLimitReached ? "Limit reached." : "Message..."} className={`w-full pl-4 md:pl-5 pr-12 py-3 md:py-4 border rounded-xl focus:outline-none transition-all text-sm ${isLimitReached ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-slate-300 focus:bg-white'}`} disabled={loading || isLimitReached} />
              <button onClick={() => sendMessage()} disabled={loading || !inputText.trim() || isLimitReached} className="absolute right-2 p-2 md:p-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-30 transition-colors"><Send className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {showSettings && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}><div onClick={e => e.stopPropagation()}><ChromeExtensionSettings /></div></div>}
      
      {/* Questionnaire Modal */}
      {questionnaireType && (
        <QuestionnaireModal 
          type={questionnaireType} 
          onClose={() => setQuestionnaireType(null)} 
          onComplete={handleSurveyComplete}
        />
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <ApiKeyModal 
            onClose={() => setShowApiKeyModal(false)}
            onSubmit={handleApiKeySubmit}
        />
      )}

      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewingDoc(null)}>
          <div className="bg-white md:rounded-2xl shadow-2xl w-full h-full md:max-w-4xl md:h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-100 bg-white sticky top-0">
              <div className="flex items-center min-w-0 mr-4"><button onClick={() => setViewingDoc(null)} className="md:hidden p-2 mr-2 -ml-2 text-slate-500"><ChevronLeft className="w-6 h-6" /></button><h3 className="font-bold text-slate-800 truncate text-sm md:text-base">{viewingDoc.title}</h3></div>
              <button onClick={() => setViewingDoc(null)} className="hidden md:block p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-8 bg-slate-50/50">{viewingDoc.content ? <pre className="whitespace-pre-wrap font-sans text-xs md:text-sm text-slate-600 leading-relaxed">{viewingDoc.content}</pre> : <div className="flex justify-center items-center h-full text-slate-400"><Loader2 className="animate-spin w-8 h-8" /></div>}</div>
          </div>
        </div>
      )}
    </div>
  );
}