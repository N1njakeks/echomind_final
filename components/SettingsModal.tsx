import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, Loader2, RefreshCw, AlertCircle, Eye, EyeOff, Save, Globe, Puzzle } from 'lucide-react';
import { fetchApiKey, createApiKey, storeUserProvidedApiKey } from '../services/supabase';
import { setGeminiApiKey } from '../services/gemini';

interface SettingsModalProps {
  onClose: () => void;
  onApiKeyUpdate: (key: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onApiKeyUpdate }) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'chrome'>('gemini');
  
  // Gemini State
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSavingGemini, setIsSavingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Chrome State
  const [chromeKey, setChromeKey] = useState<string | null>(null);
  const [isLoadingChrome, setIsLoadingChrome] = useState(false);
  const [isGeneratingChrome, setIsGeneratingChrome] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    // Load Gemini Key
    const gKey = await fetchApiKey('google_gemini');
    if (gKey) setGeminiKey(gKey.key);

    // Load Chrome Key
    setIsLoadingChrome(true);
    try {
      const cKey = await fetchApiKey('chrome');
      if (cKey) setChromeKey(cKey.key);
    } finally {
      setIsLoadingChrome(false);
    }
  };

  // --- Gemini Handlers ---
  const handleSaveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey.startsWith('AIza')) {
        setGeminiStatus('error');
        return;
    }
    
    setIsSavingGemini(true);
    try {
        await storeUserProvidedApiKey('google_gemini', geminiKey);
        setGeminiApiKey(geminiKey); // Update in-memory service
        onApiKeyUpdate(geminiKey);  // Update App state
        setGeminiStatus('success');
        setTimeout(() => setGeminiStatus('idle'), 2000);
    } catch (err) {
        console.error(err);
        setGeminiStatus('error');
    } finally {
        setIsSavingGemini(false);
    }
  };

  // --- Chrome Handlers ---
  const handleGenerateChrome = async () => {
    setIsGeneratingChrome(true);
    try {
      const data = await createApiKey('chrome');
      setChromeKey(data.key);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingChrome(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField('chrome');
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="bg-white w-[90vw] md:w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col min-h-[500px] h-auto mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-bold text-xl text-slate-800">Settings</h3>
        <p className="text-xs text-slate-500">Configure your AI and connections</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button 
            onClick={() => setActiveTab('gemini')}
            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'gemini' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-slate-500 hover:bg-slate-50'}`}
        >
            <Globe size={16} /> Google AI
        </button>
        <button 
            onClick={() => setActiveTab('chrome')}
            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'chrome' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-slate-500 hover:bg-slate-50'}`}
        >
            <Puzzle size={16} /> Extension
        </button>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 overflow-y-auto">
        
        {/* GEMINI TAB */}
        {activeTab === 'gemini' && (
            <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <h4 className="font-bold text-amber-800 text-sm mb-1 flex items-center gap-2">
                        <Key size={14} /> API Key Required
                    </h4>
                    <p className="text-xs text-amber-700 leading-relaxed">
                        To use the EchoMind chat features, you must provide your own Google Gemini API Key. The key is stored securely in your private database.
                    </p>
                </div>

                <form onSubmit={handleSaveGemini} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Google API Key</label>
                        <div className="relative">
                            <input 
                                type={showGeminiKey ? "text" : "password"}
                                value={geminiKey}
                                onChange={(e) => { setGeminiKey(e.target.value); setGeminiStatus('idle'); }}
                                placeholder="AIza..."
                                className="w-full pl-4 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-mono"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowGeminiKey(!showGeminiKey)}
                                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                            >
                                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                             <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline font-medium">
                                Get a free key
                             </a>
                             {geminiStatus === 'error' && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> Invalid Key format</span>}
                             {geminiStatus === 'success' && <span className="text-xs text-green-500 flex items-center gap-1"><Check size={12}/> Saved successfully</span>}
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSavingGemini || !geminiKey}
                        className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center justify-center disabled:opacity-50"
                    >
                        {isSavingGemini ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                        Save API Key
                    </button>
                </form>
            </div>
        )}

        {/* CHROME TAB */}
        {activeTab === 'chrome' && (
            <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                    <p className="font-bold mb-2 text-xs uppercase tracking-wide opacity-80">Setup Instructions</p>
                    <ol className="list-decimal ml-4 space-y-1 text-slate-700 text-xs">
                        <li>Install the EchoMind Chrome Extension.</li>
                        <li>Open the extension settings (gear icon).</li>
                        <li>Copy the key below and paste it there.</li>
                    </ol>
                </div>

                {isLoadingChrome ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-300" /></div>
                ) : (
                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Extension Connection Key</label>
                        {chromeKey ? (
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-slate-800 text-emerald-400 px-3 py-3 rounded-lg text-xs font-mono break-all border border-slate-700">
                                    {chromeKey}
                                </code>
                                <button 
                                    onClick={() => copyToClipboard(chromeKey)}
                                    className="p-3 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 transition-colors"
                                >
                                    {copiedField === 'chrome' ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                                <p className="text-xs text-slate-400 mb-3">No key generated yet.</p>
                                <button 
                                    onClick={handleGenerateChrome}
                                    disabled={isGeneratingChrome}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors disabled:opacity-50"
                                >
                                    {isGeneratingChrome ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                                    Generate Key
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

      </div>
      
      <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
        <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
            Close
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;