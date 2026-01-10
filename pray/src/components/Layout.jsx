// Current File Tree: src/components/Layout.jsx
import React from "react";

export default function Layout({ children, title, onBack }) {
  return (
    <div className="min-h-screen bg-navy-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-white/5 bg-navy-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <span className="material-icons-outlined">arrow_back</span>
            </button>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-gold-400">
            {title || "Prayer Trainer"}
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">{children}</main>
    </div>
  );
}
