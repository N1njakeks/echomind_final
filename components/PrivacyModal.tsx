import React from 'react';
import { X, Shield, Lock, Database, Server } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Shield size={20} />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Privacy & Usage</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-600 leading-relaxed">
          
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 text-emerald-800 font-medium text-xs">
            <p className="flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              Your privacy is important to us. Here we transparently explain what happens with your data.
            </p>
          </div>

          <section>
            <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400" />
              1. Data Storage (Supabase)
            </h4>
            <p>
              All inputs you make in this web app are stored in a secure database (Supabase). This includes:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1 text-slate-500">
              <li>Uploaded documents and their contents.</li>
              <li>Chat histories and messages.</li>
              <li>Answers from questionnaires (Pre/Post Study).</li>
              <li>Your email address and password (for login).</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-400" />
              2. Data Processing (Google Gemini AI)
            </h4>
            <p>
              To provide the app's functions (e.g., chatting with documents, reflection), your uploaded documents and chat messages are sent to the <strong>Google Gemini API</strong>.
            </p>
            <p className="mt-2">
              Google processes this data to generate responses.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-slate-900 mb-2">3. Usage for Research Purposes</h4>
            <p>
              The data stored in the database (especially chat histories and questionnaires) will be evaluated anonymously by the research team to investigate the effectiveness of reflective AI systems.
            </p>
            <p className="mt-2">
              We do <strong>not</strong> share your documents with uninvolved third parties (except technically necessary to Google for processing).
            </p>
          </section>

          <section className="border-t border-slate-100 pt-4">
            <h4 className="font-bold text-red-600 mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Important Note
            </h4>
            <p className="text-slate-700 font-medium">
              Please do <strong>not</strong> upload documents containing highly sensitive, confidential, or personal data (e.g., health data, financial data, private addresses).
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
          <button onClick={onClose} className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition-colors text-xs">
            Understood
          </button>
        </div>

      </div>
    </div>
  );
};

export default PrivacyModal;