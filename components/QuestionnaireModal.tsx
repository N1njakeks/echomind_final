import React, { useState } from 'react';
import { X, CheckCircle, ChevronRight, AlertCircle, HelpCircle } from 'lucide-react';
import { submitQuestionnaire } from '../services/supabase';

interface QuestionnaireModalProps {
  type: 'pre' | 'post';
  onClose: () => void;
}

const LikertScale = ({ 
  label, 
  value, 
  onChange, 
  leftLabel = "Strongly disagree", 
  rightLabel = "Strongly agree" 
}: { 
  label: string; 
  value: number | undefined; 
  onChange: (val: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) => (
  <div className="mb-6 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
    <p className="mb-3 text-sm font-semibold text-slate-800">{label}</p>
    <div className="flex justify-between gap-1 md:gap-2">
      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
        <button
          key={num}
          onClick={() => onChange(num)}
          className={`
            w-8 h-8 md:w-10 md:h-10 rounded-full text-xs md:text-sm font-bold transition-all
            ${value === num 
              ? 'bg-slate-800 text-white scale-110 shadow-md ring-2 ring-offset-1 ring-slate-800' 
              : 'bg-white text-slate-500 hover:bg-slate-200 border border-slate-200'
            }
          `}
        >
          {num}
        </button>
      ))}
    </div>
    <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium uppercase tracking-wide">
       <span>{leftLabel}</span>
       <span>{rightLabel}</span>
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle }: { title: string, subtitle?: string }) => (
  <div className="mb-6 mt-2">
    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
    {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    <div className="h-1 w-12 bg-indigo-500 rounded-full mt-2"></div>
  </div>
);

const QuestionnaireModal: React.FC<QuestionnaireModalProps> = ({ type, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [formData, setFormData] = useState<any>({});

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Basic validation
    // For 'Pre', check a few mandatory fields
    if (type === 'pre') {
       if (!formData.pre_age || !formData.pre_gender || !formData.pre_field_of_study) {
         setError("Please fill in all demographic information.");
         return;
       }
    }
    // For 'Post', check if comparison is made
    if (type === 'post') {
        if (!formData.comp_preferred_response) {
            setError("Please select which response was more suitable.");
            return;
        }
    }

    setLoading(true);
    setError(null);
    try {
      await submitQuestionnaire(formData);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError("Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center shadow-2xl animate-in zoom-in-95">
           <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
             <CheckCircle className="w-8 h-8" />
           </div>
           <h2 className="text-xl font-bold text-slate-800">Thank you!</h2>
           <p className="text-slate-500 mt-2">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-500" />
              {type === 'pre' ? 'Pre-Study Questionnaire' : 'Post-Study Evaluation'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">Research Study: Standard vs. Reflective AI</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-white scroll-smooth">
          
          {type === 'pre' && (
            <>
              <div className="space-y-4">
                <SectionHeader title="A1. Demographic Information" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                        <input 
                          type="number" 
                          className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g., 24"
                          onChange={(e) => handleChange('pre_age', parseInt(e.target.value))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                        <select 
                          className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                          onChange={(e) => handleChange('pre_gender', e.target.value)}
                          defaultValue=""
                        >
                            <option value="" disabled>Select...</option>
                            <option value="Female">Female</option>
                            <option value="Male">Male</option>
                            <option value="Diverse">Diverse / Non-binary</option>
                            <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Field of Study</label>
                        <input 
                          type="text" 
                          className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g., Computer Science"
                          onChange={(e) => handleChange('pre_field_of_study', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Current Level</label>
                        <select 
                          className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                          onChange={(e) => handleChange('pre_study_level', e.target.value)}
                          defaultValue=""
                        >
                            <option value="" disabled>Select...</option>
                            <option value="Bachelor">Bachelor</option>
                            <option value="Master">Master</option>
                            <option value="Doctoral">Doctoral</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
              </div>

              <div>
                <SectionHeader title="A2. Experience with AI Tools" subtitle="1 = Strongly disagree ... 7 = Strongly agree" />
                <LikertScale 
                  label="I regularly use AI-based text generation tools (e.g., ChatGPT, Gemini)." 
                  value={formData.pre_ai_usage_frequency} 
                  onChange={(v) => handleChange('pre_ai_usage_frequency', v)} 
                />
                <LikertScale 
                  label="I feel confident in using AI-based tools for writing and analytical tasks." 
                  value={formData.pre_ai_self_efficacy} 
                  onChange={(v) => handleChange('pre_ai_self_efficacy', v)} 
                />
                <LikertScale 
                  label="I know how to formulate prompts to obtain higher-quality responses from AI systems." 
                  value={formData.pre_prompt_skill} 
                  onChange={(v) => handleChange('pre_prompt_skill', v)} 
                />
              </div>

              <div>
                <SectionHeader title="A3. Trust in AI" />
                <LikertScale 
                  label="I generally trust AI systems to provide accurate information." 
                  value={formData.pre_trust_in_ai} 
                  onChange={(v) => handleChange('pre_trust_in_ai', v)} 
                />
                <LikertScale 
                  label="I expect AI tools to generate high-quality and relevant responses." 
                  value={formData.pre_expected_quality} 
                  onChange={(v) => handleChange('pre_expected_quality', v)} 
                />
                <LikertScale 
                  label="I am generally skeptical about the quality of AI-generated content." 
                  value={formData.pre_ai_skepticism} 
                  onChange={(v) => handleChange('pre_ai_skepticism', v)} 
                />
              </div>
            </>
          )}

          {type === 'post' && (
            <>
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6">
                <h4 className="font-bold text-indigo-900 text-sm mb-1">Context Reference</h4>
                <p className="text-xs text-indigo-700">
                  <strong>Response A</strong> = V1 (Standard Chat Mode)<br/>
                  <strong>Response B</strong> = V2 (Reflective Chat Mode)
                </p>
              </div>

              <div>
                <SectionHeader title="B1. Overall Comparison" />
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="mb-3 text-sm font-semibold text-slate-800">Which response was overall more suitable for the reflection task?</p>
                    <div className="flex gap-4">
                        <label className={`flex-1 p-3 border rounded-lg cursor-pointer transition-all ${formData.comp_preferred_response === 'A' ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white hover:bg-slate-50'}`}>
                            <input type="radio" name="pref" className="hidden" onChange={() => handleChange('comp_preferred_response', 'A')} />
                            <span className="block text-center font-bold text-slate-700">Response A (V1)</span>
                        </label>
                        <label className={`flex-1 p-3 border rounded-lg cursor-pointer transition-all ${formData.comp_preferred_response === 'B' ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white hover:bg-slate-50'}`}>
                            <input type="radio" name="pref" className="hidden" onChange={() => handleChange('comp_preferred_response', 'B')} />
                            <span className="block text-center font-bold text-slate-700">Response B (V2)</span>
                        </label>
                    </div>
                </div>
                <LikertScale 
                  label="How large was the overall quality difference?" 
                  value={formData.comp_quality_difference} 
                  onChange={(v) => handleChange('comp_quality_difference', v)}
                  leftLabel="No difference"
                  rightLabel="Very large difference" 
                />
              </div>

              {/* Tabs for Evaluation could be here, but simpler to just list them for scroll */}
              
              <div className="border-t border-slate-100 pt-8">
                <SectionHeader title="Evaluation of Response A (V1)" subtitle="Standard Mode" />
                
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Readability & Info</h4>
                <LikertScale label="Easy to read and understand" value={formData.a_readability} onChange={(v) => handleChange('a_readability', v)} />
                <LikertScale label="Well structured" value={formData.a_structure} onChange={(v) => handleChange('a_structure', v)} />
                <LikertScale label="Covered relevant aspects" value={formData.a_coverage} onChange={(v) => handleChange('a_coverage', v)} />
                <LikertScale label="Accurate and precise" value={formData.a_accuracy} onChange={(v) => handleChange('a_accuracy', v)} />

                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 mt-8">Usefulness & Reflection</h4>
                <LikertScale label="Useful for solving the task" value={formData.a_usefulness} onChange={(v) => handleChange('a_usefulness', v)} />
                <LikertScale label="Demonstrated reflective engagement" value={formData.a_reflective_depth} onChange={(v) => handleChange('a_reflective_depth', v)} />
                <LikertScale label="Encouraged me to reflect" value={formData.a_reflection_trigger} onChange={(v) => handleChange('a_reflection_trigger', v)} />
                <LikertScale label="Made use of context" value={formData.a_context_usage} onChange={(v) => handleChange('a_context_usage', v)} />
              </div>

              <div className="border-t border-slate-100 pt-8">
                <SectionHeader title="Evaluation of Response B (V2)" subtitle="Reflective Mode" />
                
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Readability & Info</h4>
                <LikertScale label="Easy to read and understand" value={formData.b_readability} onChange={(v) => handleChange('b_readability', v)} />
                <LikertScale label="Well structured" value={formData.b_structure} onChange={(v) => handleChange('b_structure', v)} />
                <LikertScale label="Covered relevant aspects" value={formData.b_coverage} onChange={(v) => handleChange('b_coverage', v)} />
                <LikertScale label="Accurate and precise" value={formData.b_accuracy} onChange={(v) => handleChange('b_accuracy', v)} />

                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 mt-8">Usefulness & Reflection</h4>
                <LikertScale label="Useful for solving the task" value={formData.b_usefulness} onChange={(v) => handleChange('b_usefulness', v)} />
                <LikertScale label="Demonstrated reflective engagement" value={formData.b_reflective_depth} onChange={(v) => handleChange('b_reflective_depth', v)} />
                <LikertScale label="Encouraged me to reflect" value={formData.b_reflection_trigger} onChange={(v) => handleChange('b_reflection_trigger', v)} />
                <LikertScale label="Made use of context" value={formData.b_context_usage} onChange={(v) => handleChange('b_context_usage', v)} />
              </div>

              <div className="border-t border-slate-100 pt-8">
                <SectionHeader title="Open Feedback" />
                <label className="block text-sm font-medium text-slate-700 mb-2">What did you particularly like about the better response, and why?</label>
                <textarea 
                   className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none h-32 text-sm"
                   placeholder="Your thoughts..."
                   onChange={(e) => handleChange('open_best_response_reason', e.target.value)}
                ></textarea>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
            {error ? (
                <div className="text-red-500 text-xs flex items-center"><AlertCircle className="w-4 h-4 mr-1"/>{error}</div>
            ) : <div></div>}
            
            <button 
                onClick={handleSubmit}
                disabled={loading}
                className="bg-slate-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center disabled:opacity-50"
            >
                {loading ? 'Submitting...' : 'Submit Questionnaire'}
                <ChevronRight className="w-4 h-4 ml-2" />
            </button>
        </div>
      </div>
    </div>
  );
};

export default QuestionnaireModal;
