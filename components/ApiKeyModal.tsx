import React, { useState } from 'react';
import { Key, ChevronRight, AlertCircle, ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
  onSubmit: (key: string) => void;
  onClose: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSubmit, onClose }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !key.startsWith('AIza')) {
      setError('Invalid API Key format. It usually starts with "AIza".');
      return;
    }
    onSubmit(key.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Key size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Enter Google API Key</h3>
            <p className="text-xs text-slate-500">Required for this study session</p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            To participate in this study using the latest AI models, please provide your own Google Gemini API Key.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                API Key
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(''); }}
                placeholder="AIza..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-mono"
                autoFocus
              />
              {error && (
                <div className="flex items-center gap-2 mt-2 text-xs text-red-500">
                  <AlertCircle size={12} /> {error}
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
                <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700">
                    Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-900">Get one here</a> (Free of charge).
                </div>
            </div>

            <button
              type="submit"
              disabled={!key}
              className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              Connect & Start
              <ChevronRight className="w-4 h-4 ml-2" />
            </button>
          </form>
          
          <button onClick={onClose} className="w-full mt-3 text-xs text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;