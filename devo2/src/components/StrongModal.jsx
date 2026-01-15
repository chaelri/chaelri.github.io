import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchGemini, createCrossReferencePrompt } from '../utils/api';

export const StrongModal = () => {
  const { modalState, closeStrongModal } = useAppContext();
  const { isOpen, strongNum, contextText } = modalState;
  const [contentHTML, setContentHTML] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Parse contextText: "English Word — Original (transliteration) [Strong's]"
  const { englishWord, originalWord } = useMemo(() => {
    if (!contextText) return { englishWord: '', originalWord: '' };
    const parts = contextText.split(" — ");
    const englishWord = parts[0]?.trim() || "";
    const originalPart = parts[1] || contextText;
    const wordMatch = originalPart.match(/^([^\(]+)/);
    const originalWord = wordMatch ? wordMatch[1].trim() : "";
    return { englishWord, originalWord };
  }, [contextText]);
  
  const title = useMemo(() => {
      return `${englishWord} [${strongNum}] • Cross-references & Usage`;
  }, [englishWord, strongNum]);

  const fetchCrossReferences = useCallback(async (sNum, eWord, oWord) => {
    if (!sNum) return;

    setIsLoading(true);
    setContentHTML('');

    try {
      const prompt = createCrossReferencePrompt(sNum, eWord, oWord);
      const data = await fetchGemini(prompt, "summary");
      
      const html = data.candidates?.[0]?.content?.parts?.[0]?.text || "No references found.";
      setContentHTML(html);

    } catch (err) {
      console.error("Strong Modal fetch failed:", err);
      setContentHTML("Failed to load cross-references.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && strongNum) {
      fetchCrossReferences(strongNum, englishWord, originalWord);
    }
  }, [isOpen, strongNum, englishWord, originalWord, fetchCrossReferences]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closeStrongModal();
    }
  };

  return (
    <div 
      id="modalOverlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div 
        id="modalContent"
        className="bg-bg-card text-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative"
      >
        <button
          id="modalClose"
          className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
          onClick={closeStrongModal}
        >
          ✕
        </button>

        <h3 className="text-xl font-bold mb-1">{englishWord}</h3>
        <div className="opacity-60 text-sm mb-4">
          {originalWord} [{strongNum}] • Cross-references & Usage
        </div>
        
        {isLoading ? (
          <div className="inline-ai-loading">
            <div className="inline-ai-spinner"></div>
            <span>Finding cross-references for {strongNum}…</span>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: contentHTML }} />
        )}
      </div>
    </div>
  );
};