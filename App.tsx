import React, { useState, useEffect, useRef } from 'react';
import { supabase, signIn, signUp, signOut, fetchUserDocuments, saveDocumentToCloud, createChatSession, saveChatMessage, findSimilarDocuments, fetchChatSessions, fetchChatMessages, deleteDocument, fetchDocumentContent, deleteChatSession, updateDocumentSummary } from './services/supabase';
import { generateAnswer, generateEmbedding, generateTopicSummary, generateDocumentSummary } from './services/gemini';
import { extractTextFromPdf } from './services/pdf';
import { SourceFile, ChatMessage, ChatSession } from './types';
import ChromeExtensionSettings from './components/ChromeExtensionSettings';
import QuestionnaireModal from './components/QuestionnaireModal'; // Import
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
  ClipboardList
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

// --- Knowledge Distribution Component ---
const KnowledgeDistribution = ({ data }: { data: { label: string, value: number }[] }) => {
  const colors = ['bg-slate-800', 'bg-slate-600', 'bg-slate-500', 'bg-slate-400', 'bg-slate-300', 'bg-slate-200'];
  const totalValue = data.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>Topic Distribution</span>
          <span>100%</span>
        </div>
        <div className="h-6 w-full flex rounded-lg overflow-hidden ring-1 ring-slate-200 shadow-sm bg-slate-100">
          {data.map((item, index) => {
            const widthPercentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            return (
              <div 
                key={index}
                style={{ width: `${widthPercentage}%` }} 
                className={`${colors[index % colors.length]} h-full transition-all duration-1000 ease-out border-r border-white/10 last:border-0`}
                title={`${item.label}: ${Math.round(item.value)}%`}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all group">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]} group-hover:scale-110 transition-transform`} />
              <span className="font-medium text-slate-700 text-sm truncate max-w-[140px]">{item.label}</span>
            </div>
            <span className="text-sm font-bold text-slate-400 group-hover:text-slate-600">{Math.round(item.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
  const [sidebarTab, setSidebarTab] = useState<'docs' | 'chats'>('docs');
  const [chatMode, setChatMode] = useState<'standard' | 'reflective'>('standard');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<SourceFile | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewData, setOverviewData] = useState<{ label: string, value: number }[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // NEW: Questionnaire State
  const [questionnaireType, setQuestionnaireType] = useState<'pre' | 'post' | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // STUDY LOGIC: Calculate existing modes
  const hasV1 = chatSessions.some(s => s.mode === 'standard');
  const hasV2 = chatSessions.some(s => s.mode === 'reflective');
  const sessionLimitReached = hasV1 && hasV2;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) await loadData(session.user.id);
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
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session);
        if (session) loadData(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

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
  };

  const handleNewChat = () => {
    if (sessionLimitReached) {
        alert("Limit reached: You have already created both V1 & V2 chats.");
        return;
    }
    setMessages([]);
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
    setShowOverview(false);
    setOverviewData(null);
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
        setShowOverview(false);
      }
    } catch (err) {
      console.error("Failed to delete chat", err);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setLoading(true);
    setIsSidebarOpen(false);
    setShowOverview(false);
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

  const initiateNewStudySession = async (selectedFiles: SourceFile[]) => {
    if (sessionLimitReached) {
        alert("Limit reached: You have already created both V1 & V2 chats. Please use the existing sessions in history.");
        return;
    }

    const modeToCreate = !hasV1 ? 'standard' : 'reflective';
    
    setIsAnalyzing(true);
    setShowOverview(true);
    setMessages([]);
    
    try {
      const sourceIds = selectedFiles.map(d => d.id);
      const title = `Analysis (${modeToCreate === 'standard' ? 'V1' : 'V2'})`;
      const sessionData = await createChatSession(title, sourceIds, modeToCreate);
      
      setCurrentSessionId(sessionData.id);
      setChatMode(modeToCreate);
      
      if (session?.user?.id) {
        const updatedSessions = await fetchChatSessions(session.user.id);
        setChatSessions(updatedSessions);
      }

      const validDocs = selectedFiles.filter(d => d.content) as any[];
      const summary = await generateTopicSummary(validDocs);
      setOverviewData(summary);
      
    } catch (e) {
      console.error("Study session initialization failed", e);
      alert("Error creating session. Please try again.");
      setShowOverview(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectAllAndAnalyze = () => {
    const updatedDocs = documents.map(d => ({ ...d, isSelected: true }));
    setDocuments(updatedDocs);
    initiateNewStudySession(updatedDocs);
  };

  const startAnalysis = () => {
    const selected = documents.filter(d => d.isSelected);
    if (selected.length === 0) return;
    initiateNewStudySession(selected);
  };

  const sendMessage = async (overrideText?: string) => {
    const textToUse = overrideText || inputText;
    if (!textToUse.trim() || loading || !currentSessionId) return;
    
    const userMsgCount = messages.filter(m => m.role === 'user').length;
    if (userMsgCount >= MAX_MESSAGES_PER_SESSION) return;
    
    if (showOverview) setShowOverview(false);

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: textToUse, timestamp: Date.now(), isThinking: chatMode === 'reflective' };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      await saveChatMessage(currentSessionId, userMsg);
      const selectedDocs = documents.filter(d => d.isSelected);
      let context = selectedDocs.length > 0 
        ? selectedDocs.map(d => `Document: ${d.title}\nContent: ${d.content || ""}`).join("\n\n")
        : (await findSimilarDocuments(await generateEmbedding(textToUse))).map((d: any) => `Document: ${d.title}\nContent: ${d.content}`).join("\n\n");

      const aiResponseText = await generateAnswer(context, [...messages, userMsg].map(m => ({ role: m.role, text: m.text })), chatMode);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', text: aiResponseText, timestamp: Date.now(), isThinking: chatMode === 'reflective' };
      
      setMessages(prev => [...prev, aiMsg]);
      await saveChatMessage(currentSessionId, aiMsg);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "Request error.", timestamp: Date.now() }]);
    } finally { setLoading(false); }
  };

  if (isAppLoading) return <InitialLoader />;
  if (!session) return <AuthScreen onLogin={() => {}} />;

  const selectedPages = documents.filter(d => d.isSelected).reduce((sum, d) => sum + (d.pageCount || 1), 0);
  const selectedCount = documents.filter(d => d.isSelected).length;
  const totalPages = documents.reduce((sum, d) => sum + (d.pageCount || 1), 0);
  const isSessionLocked = !!currentSessionId;
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isLimitReached = userMessageCount >= MAX_MESSAGES_PER_SESSION;

  return (
    <div className="flex h-[100dvh] bg-slate-50 text-slate-800 font-sans overflow-hidden relative">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed md:relative inset-y-0 left-0 w-72 md:w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl md:shadow-none z-30 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center text-slate-700"><BrainCircuit className="w-5 h-5 mr-2 text-slate-600" />EchoMind</h2>
          <div className="flex items-center space-x-1">
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Settings className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><LogOut className="w-4 h-4" /></button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex border-b border-slate-100">
          <button onClick={() => setSidebarTab('docs')} className={`flex-1 py-3 text-sm font-medium transition-colors ${sidebarTab === 'docs' ? 'text-slate-800 border-b-2 border-slate-800 bg-slate-50' : 'text-slate-500 hover:text-slate-700'}`}>Knowledge</button>
          <button onClick={() => setSidebarTab('chats')} className={`flex-1 py-3 text-sm font-medium transition-colors ${sidebarTab === 'chats' ? 'text-slate-800 border-b-2 border-slate-800 bg-slate-50' : 'text-slate-500 hover:text-slate-700'}`}>History</button>
        </div>

        {sidebarTab === 'docs' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4">
              <label className="flex items-center justify-center w-full px-4 py-3 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 border-dashed cursor-pointer hover:bg-slate-100 transition-colors">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Upload className="w-5 h-5 mr-2" />}
                <span className="font-medium text-sm">{uploading ? 'Processing' : 'Add Content'}</span>
                <input type="file" className="hidden" accept=".pdf,.txt,.md,.json" onChange={handleFileUpload} />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 px-4 text-center"><FileText className="w-8 h-8 mb-2 opacity-50" /><span className="text-xs">No documents yet.</span></div>
              ) : documents.map(doc => (
                <div key={doc.id} className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer ${doc.isSelected ? 'bg-slate-100 border-slate-200' : 'hover:bg-slate-50 border-transparent'} border`} onClick={() => handleViewDocument(doc)}>
                  <button className="mr-3 text-slate-400" onClick={(e) => { e.stopPropagation(); toggleDocumentSelection(doc.id); }}>
                    {doc.isSelected ? <CheckSquare className="w-5 h-5 text-slate-800" /> : <Square className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0"><p className={`text-sm font-medium truncate ${doc.isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{doc.title}</p></div>
                  <button onClick={(e) => handleDeleteDocument(e, doc.id)} className="ml-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {documents.some(d => d.isSelected) && (
              <div className="p-4 border-t border-slate-100">
                <button 
                  onClick={startAnalysis} 
                  disabled={sessionLimitReached}
                  className={`w-full py-3 rounded-lg flex items-center justify-center text-sm font-bold shadow-lg transition-all ${sessionLimitReached ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {sessionLimitReached ? 'Limit reached' : 'Analyze & Start Session'}
                </button>
              </div>
            )}
          </div>
        )}

        {sidebarTab === 'chats' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4">
              <button 
                onClick={handleNewChat}
                disabled={sessionLimitReached}
                className={`flex items-center justify-center w-full px-4 py-3 rounded-lg border transition-all shadow-sm ${sessionLimitReached ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                <Plus className="w-5 h-5 mr-2" />
                <span className="font-medium text-sm">{sessionLimitReached ? 'Limit reached' : 'New Session'}</span>
              </button>
              
              <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                 <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                 <p className="text-[10px] text-amber-700 leading-tight">
                    <strong>Study mode:</strong> Create exactly one V1 and one V2 chat.
                 </p>
              </div>

               {/* TRIGGER BUTTONS FOR STUDY */}
               <div className="mt-2 grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setQuestionnaireType('pre')}
                    className="flex items-center justify-center py-2 px-2 bg-slate-800 text-white text-xs rounded hover:bg-slate-700 font-medium"
                  >
                    <ClipboardList className="w-3 h-3 mr-1" /> Pre-Q
                  </button>
                  <button 
                    onClick={() => setQuestionnaireType('post')}
                    className="flex items-center justify-center py-2 px-2 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 font-medium"
                  >
                    <ClipboardList className="w-3 h-3 mr-1" /> Post-Q
                  </button>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {chatSessions.map(session => (
                <div key={session.id} onClick={() => handleSelectSession(session.id)} className={`group flex items-center p-3 mb-1 rounded-md transition-all cursor-pointer border ${currentSessionId === session.id ? 'bg-slate-100 border-slate-200' : 'hover:bg-slate-50 border-transparent'}`}>
                  <div className="mr-3 flex-shrink-0 relative">
                     <MessageSquare className={`w-4 h-4 ${currentSessionId === session.id ? 'text-slate-800' : 'text-slate-400'}`} />
                     {session.mode === 'reflective' && <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full ring-1 ring-white" title="V2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${currentSessionId === session.id ? 'text-slate-900' : 'text-slate-700'}`}>{session.title || "Untitled"}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{session.mode === 'reflective' ? 'V2' : 'V1'}</p>
                  </div>
                  <button onClick={(e) => handleDeleteChat(e, session.id)} className="ml-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur-sm flex items-center px-4 md:px-6 justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center min-w-0 overflow-hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-2 text-slate-500 hover:bg-slate-100 rounded-lg"><MenuIcon className="w-6 h-6" /></button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-base md:text-lg truncate">{currentSessionId ? (chatSessions.find(s => s.id === currentSessionId)?.title || "Session") : "New Session"}</h1>
              <div className="flex items-center gap-3 text-[10px] md:text-xs text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                <span className={chatMode === 'reflective' ? 'text-indigo-500 font-bold' : ''}>{chatMode === 'reflective' ? "V2" : "V1"}</span>
                <span className="text-slate-300">|</span>
                <span className={isLimitReached ? "text-red-500" : ""}>{userMessageCount} / {MAX_MESSAGES_PER_SESSION}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg scale-90 md:scale-100 origin-right opacity-70">
            <button disabled className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all ${chatMode === 'standard' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>V1</button>
            <button disabled className={`px-3 md:px-4 py-1.5 rounded-md text-[10px] md:text-xs font-bold transition-all ${chatMode === 'reflective' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>V2</button>
            <div className="pl-1 pr-1 text-slate-400" title="Mode locked">
               <Lock className="w-3 h-3" />
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto relative overscroll-contain">
          {showOverview ? (
            <div className="min-h-full flex flex-col items-center justify-center p-6 md:p-12 space-y-12 animate-in fade-in zoom-in-95 duration-700 pb-32">
              <div className="text-center max-w-2xl">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4 tracking-tight">Oh, you have <span className="text-slate-500">{selectedPages} pages</span> of knowledge ready.</h2>
                <p className="text-slate-500 text-lg">Here's a pulse of your selection for this {chatMode === 'reflective' ? 'V2' : 'V1'} session.</p>
              </div>
              <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-sm">
                {isAnalyzing ? <div className="flex flex-col items-center justify-center py-20 space-y-4"><Loader2 className="w-12 h-12 animate-spin text-slate-800" /><p className="text-slate-400 font-medium animate-pulse">Mapping content pulse...</p></div> 
                : overviewData && <div className="space-y-12"><KnowledgeDistribution data={overviewData} /><div className="pt-8 border-t border-slate-100"><p className="text-center text-slate-600 font-medium mb-6">What would you like to explore?</p><div className="max-w-xl mx-auto flex items-center relative"><input autoFocus type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={`Ask about these ${selectedCount} docs...`} className="w-full pl-6 pr-14 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-400 focus:outline-none focus:bg-white transition-all text-sm" /><button onClick={() => sendMessage()} className="absolute right-3 p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors"><Send className="w-5 h-5" /></button></div></div></div>}
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-32 md:pb-20">
              {messages.length === 0 && !currentSessionId && (
                <div className="h-96 flex flex-col items-center justify-center text-slate-300 px-6 text-center">
                  {documents.length > 0 ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4 mx-auto text-slate-600"><FileText className="w-6 h-6" /></div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Knowledge Base Ready</h3>
                        <p className="text-slate-500 mb-6 text-sm leading-relaxed">You have <strong>{totalPages} pages</strong> saved. Use the "Analyze & Start" button on the left to begin a study session.</p>
                        <button onClick={selectAllAndAnalyze} disabled={sessionLimitReached} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                          <Sparkles className="w-4 h-4 mr-2" />
                          {sessionLimitReached ? 'Limit reached' : 'Analyze All & Start'}
                        </button>
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
          )}
        </div>

        {!showOverview && currentSessionId && (
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
