import React, { useEffect, useState } from 'react';
import { lockAppScroll } from '../utils/ux';

const messages = [
  "Reading ancient scrolls 📜",
  "Aligning verses ✨",
  "Consulting apostles 🕊️",
  "Almost there 🙏",
];

export const AILoadingOverlay = ({ title = "Generating context…" }) => {
  const [seconds, setSeconds] = useState(15);
  const [msgIndex, setMsgIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    lockAppScroll(true);

    const interval = setInterval(() => {
      setSeconds(prev => Math.max(0, prev - 1));
      setDots(prev => (prev + 1) % 4);
      if (seconds % 4 === 3 && msgIndex < messages.length - 1) {
        setMsgIndex(prev => prev + 1);
      }
      if (seconds <= 0) clearInterval(interval);
    }, 1000);

    return () => {
      clearInterval(interval);
      lockAppScroll(false);
    };
  }, [seconds, msgIndex]);

  const dotStr = ".".repeat(dots);
  const displayText = `(up to 15s) ⏳ ${messages[msgIndex]}${dotStr} (${seconds}s)`;

  return (
    <div 
      id="ai-loading-overlay" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm"
    >
      <div 
        className="ai-loading-card bg-bg-card text-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 transition-all"
        style={{ animation: "aiPulse 1.6s ease-in-out infinite" }}
      >
        <div className="ai-spinner w-8 h-8 border-4 border-gray-600 border-t-primary rounded-full animate-spin"></div>
        <span id="ai-loading-text" className="text-sm font-medium">
          {title} ({displayText})
        </span>
      </div>
    </div>
  );
};