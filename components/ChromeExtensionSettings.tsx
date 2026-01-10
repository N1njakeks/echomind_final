import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchApiKey, createApiKey } from '../services/supabase';

const ChromeExtensionSettings = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve Supabase URL similarly to services/supabase.ts
  const viteEnv = (import.meta as any).env;
  const SUPABASE_URL = 
    viteEnv?.VITE_SUPABASE_URL || 
    process.env.VITE_SUPABASE_URL || 
    'https://dasfdedcymvskruytqxr.supabase.co';
    
  const ENDPOINT_URL = `${SUPABASE_URL}/functions/v1/save-content`;

  useEffect(() => {
    loadKey();
  }, []);

  const loadKey = async () => {
    try {
      setIsLoading(true);
      const data = await fetchApiKey('chrome');
      if (data) {
        setApiKey(data.key);
      }
    } catch (err) {
      console.error("Error loading key:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const data = await createApiKey('chrome');
      setApiKey(data.key);
    } catch (err: any) {
      console.error(err);
      setError("Failed to create key. Database error.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Key size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Chrome Extension Setup</h3>
            <p className="text-xs text-slate-500">Connect your browser to EchoMind</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-bold mb-2 text-xs uppercase tracking-wide opacity-80">How it works</p>
          <ol className="list-decimal ml-4 space-y-1 text-slate-700">
            <li>Open the Echomind Chrome Extension.</li>
            <li>Click the settings (gear) icon.</li>
            <li>Copy the URL and Key below into the fields.</li>
          </ol>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-slate-400 w-8 h-8" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                1. API Endpoint URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 px-3 py-3 rounded-lg text-xs font-mono break-all">
                  {ENDPOINT_URL}
                </code>
                <button 
                  onClick={() => copyToClipboard(ENDPOINT_URL, 'url')}
                  className="p-3 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 transition-colors"
                  title="Copy URL"
                >
                  {copiedField === 'url' ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                2. Your Extension Key
              </label>
              
              {apiKey ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-3 rounded-lg text-xs font-mono break-all">
                    {apiKey}
                  </code>
                  <button 
                    onClick={() => copyToClipboard(apiKey, 'key')}
                    className="p-3 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 transition-colors"
                    title="Copy Key"
                  >
                    {copiedField === 'key' ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-500 mb-3">No key generated yet.</p>
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
                    {isGenerating ? "Generating..." : "Generate Key"}
                  </button>
                  {error && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                      <AlertCircle size={12} /> {error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChromeExtensionSettings;
