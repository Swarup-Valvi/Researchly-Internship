import React from 'react';
import { GraduationCap, ShieldCheck, Sparkles, Database } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-surface py-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-800">Researchly.io</span>
          <span className="text-slate-400">— AI-Powered Academic Discovery, Credibility Verification & Submissions</span>
        </div>

        <div className="text-[11px] text-slate-500">
          Deadline data:{' '}
          <a href="https://github.com/ccfddl/ccf-deadlines" target="_blank" rel="noopener noreferrer"
             className="underline hover:text-slate-700">ccfddl</a>{' '}(MIT)
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1 text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            12-Hour Automated LLM Pipeline
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            9-Dimension Credibility Verification
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            Supabase DB & Auth
          </span>
        </div>
      </div>
    </footer>
  );
}

