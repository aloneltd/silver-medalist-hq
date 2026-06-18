import React, { useState } from 'react';
import type { BridgeType } from '../types';

interface Props {
  activeBridge: BridgeType;
  onBridgeChange: (b: BridgeType) => void;
  rawJson: string;
  onJsonChange: (val: string) => void;
  onClearData: () => void;
}

const SettingsPanel: React.FC<Props> = ({ activeBridge, onBridgeChange, rawJson, onJsonChange, onClearData }) => {
  const [showBrainFeed, setShowBrainFeed] = useState(false);

  const bridges: { id: BridgeType; label: string; desc: string; color: string }[] = [
    { id: 'LinkedIn', label: 'LinkedIn Talent Grabber', desc: 'Optimizes AI for social profile extraction.', color: 'bg-blue-600' },
    { id: 'Slack', label: 'Slack Command Bridge', desc: 'Prioritizes short-form HM pitches.', color: 'bg-purple-600' },
    { id: 'ATS', label: 'ATS Direct Vault', desc: 'Standard enterprise data schema sync.', color: 'bg-slate-800' },
    { id: 'Gmail', label: 'Gmail Outreach', desc: 'Integrated email-first outreach flow.', color: 'bg-red-500' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Playbook Banner */}
      <div className="bg-orange-600 rounded-[3rem] p-10 text-white shadow-2xl shadow-orange-900/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="relative z-10">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic mb-6">Operational Playbook</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '01', text: 'Select an <strong>Active Bridge</strong> to tell the AI where your talent data is coming from today.' },
              { step: '02', text: 'Use the <strong>JD Ingestor</strong> to add requirements. The AI structures them automatically.' },
              { step: '03', text: 'Trigger a <strong>Neural Sync</strong> to calculate every match based on your data.' },
            ].map(({ step, text }) => (
              <div key={step} className="bg-white/10 p-6 rounded-2xl backdrop-blur-md border border-white/10">
                <div className="text-orange-200 text-xs font-black uppercase tracking-widest mb-2">Step {step}</div>
                <p className="text-sm font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Bridge Selector */}
          <section>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-3">
              <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
              </svg>
              Active Source Bridges
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bridges.map(bridge => (
                <button
                  key={bridge.id}
                  onClick={() => onBridgeChange(bridge.id)}
                  className={`p-6 rounded-[2rem] border-2 transition-all text-left flex items-start gap-4 group shadow-sm ${
                    activeBridge === bridge.id
                      ? 'border-orange-500 bg-white shadow-xl ring-4 ring-orange-500/5'
                      : 'border-transparent bg-white hover:border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl ${bridge.color} text-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">{bridge.label}</h4>
                    <p className="text-xs text-slate-400 font-bold leading-tight">{bridge.desc}</p>
                    {activeBridge === bridge.id && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
                        CONNECTED
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Brain Feed */}
          <section className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Neural Config Center</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Raw Data Storage (localStorage)</p>
                </div>
              </div>
              <button
                onClick={() => setShowBrainFeed(!showBrainFeed)}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  showBrainFeed ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {showBrainFeed ? 'Lock Brain' : 'Unlock Brain'}
              </button>
            </div>

            {showBrainFeed ? (
              <div>
                <div className="bg-[#020617] rounded-3xl overflow-hidden ring-1 ring-slate-800 relative">
                  <div className="absolute top-4 right-6 text-xs font-mono text-slate-600 uppercase">application/json</div>
                  <textarea
                    className="w-full h-80 bg-transparent text-blue-400 p-8 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                    value={rawJson}
                    onChange={(e) => onJsonChange(e.target.value)}
                  />
                </div>
                <p className="mt-4 text-xs text-slate-400 italic">Manual edits to this JSON will persist and update the AI's internal memory immediately.</p>
              </div>
            ) : (
              <div className="bg-slate-50 p-14 rounded-[2rem] border-2 border-dashed border-slate-200 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Config Encrypted</p>
                </div>
              </div>
            )}
          </section>

          {/* Danger Zone */}
          <section className="bg-red-50 border border-red-200 rounded-[2rem] p-8">
            <h3 className="text-xs font-black text-red-600 uppercase tracking-widest mb-4">Danger Zone</h3>
            <p className="text-sm text-slate-600 mb-4">Clear all local data (jobs, candidates, matches). This cannot be undone — the app will reload with sample data.</p>
            <button
              onClick={() => {
                if (confirm('Clear all data? This will reload sample data.')) onClearData();
              }}
              className="px-6 py-3 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-red-700 transition-colors"
            >
              Clear All Data & Reset
            </button>
          </section>
        </div>

        {/* Engine Health Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl">
            <h4 className="text-xs font-black uppercase tracking-widest text-orange-500 mb-6">Engine Health</h4>
            <div className="space-y-5">
              {[
                { label: 'Mesh Density', value: 'HIGH', pct: 92, color: 'bg-orange-500' },
                { label: 'Context Window', value: '128k', pct: 45, color: 'bg-blue-500' },
                { label: 'Model', value: 'Flash', pct: 100, color: 'bg-green-500' },
              ].map(({ label, value, pct, color }) => (
                <div key={label}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-slate-400">{label}</span>
                    <span className="text-xs font-black">{value}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 p-4 bg-white/10 rounded-2xl border border-white/10">
              <div className="text-xs text-slate-400 mb-1">AI Provider</div>
              <div className="text-sm font-black text-green-400">Gemini 2.5 Flash</div>
              <div className="text-xs text-slate-500 mt-1">Server-side · Key secured</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
