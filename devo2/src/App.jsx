import React, { useState, useCallback } from "react";
import { Layout } from "./components/Layout";
import { PassageSelector } from "./components/PassageSelector";
import { usePassage } from "./hooks/usePassage";
import { AILoadingOverlay } from "./components/AILoadingOverlay";
import { useAppContext } from "./context/AppContext";
import { StrongModal } from "./components/StrongModal";
import { PassageView } from "./components/PassageView";
import { AICard } from "./components/AICard";
import { NotesSummary } from "./components/NotesSummary";
import { dbGet } from "./utils/indexedDB";

export default function App() {
  const {
    showAILoading,
    setShowAILoading,
    toggleReflectionVisibility,
    reflectionVisible,
  } = useAppContext();

  const [passageLoaded, setPassageLoaded] = useState(false);
  const [passageError, setPassageError] = useState(null);
  const [aiCacheKey, setAICacheKey] = useState(null); // Key to re-render AI component on load

  const { currentPassage, isDataLoading } = usePassage();

  const handleLoadPassage = useCallback(async () => {
    if (isDataLoading || !currentPassage) return;

    setShowAILoading(true);
    setPassageLoaded(false);
    setPassageError(null);

    try {
      if (!currentPassage.verses.length) {
        throw new Error("No verses found for this selection.");
      }

      // Simulate network wait time for AI even if loading from cache
      const cached = await dbGet(currentPassage.devotionId);
      const delay = cached ? 500 : 1500; // Faster if cached
      await new Promise((resolve) => setTimeout(resolve, delay));

      setPassageLoaded(true);
      setAICacheKey(currentPassage.devotionId); // Trigger AI/Summary components
    } catch (err) {
      console.error("Load Passage Error:", err);
      setPassageError(
        err.message || "Failed to load passage or generate AI content."
      );
    } finally {
      setShowAILoading(false);
    }
  }, [currentPassage, isDataLoading, setShowAILoading]);

  const renderPassageView = () => {
    if (isDataLoading) {
      return (
        <div className="landing p-8 text-center text-gray-400">
          Loading Bible data...
        </div>
      );
    }

    if (passageError) {
      return (
        <div className="p-5 rounded-xl bg-bg-card text-center shadow-lg">
          <p className="font-semibold mb-3 text-red-400">⚠️ {passageError}</p>
          <div className="flex gap-3 justify-center">
            <button
              className="py-2 px-4 bg-primary rounded-lg hover:bg-primary/80"
              onClick={handleLoadPassage}
            >
              Retry
            </button>
            <button
              className="py-2 px-4 bg-gray-500 rounded-lg hover:bg-gray-500/80"
              onClick={() => setPassageError(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      );
    }

    if (!passageLoaded || !currentPassage) {
      return (
        <div className="landing p-8 text-center">
          <div className="landing-card bg-bg-card p-6 rounded-xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-3">Open the Word 📖</h2>
            <p className="text-gray-400">
              Select a book and chapter, then press{" "}
              <strong>Search & Load Passage</strong>.
            </p>
          </div>
        </div>
      );
    }

    return <PassageView passage={currentPassage} />;
  };

  const renderSummaryView = () => {
    if (!passageLoaded || !currentPassage) return null;

    // Use aiCacheKey to force re-render AICard/NotesSummary when a new passage is loaded
    return (
      <div className="space-y-6" key={aiCacheKey}>
        <h2
          className="text-2xl font-bold border-b border-gray-700 pb-2 mb-4"
          id="summaryTitle"
        >
          {currentPassage.title}
        </h2>

        <AICard
          devotionId={currentPassage.devotionId}
          passage={currentPassage}
        />

        <button
          id="toggleReflectionBtn"
          className="w-full py-2 bg-gray-700/50 hover:bg-gray-700/70 rounded-lg text-sm font-semibold transition"
          onClick={toggleReflectionVisibility}
        >
          {reflectionVisible
            ? "🙏 Hide Guided Reflection"
            : "🙏 Show Guided Reflection"}
        </button>

        <NotesSummary passage={currentPassage} />
      </div>
    );
  };

  return (
    <>
      <Layout
        passage={
          <>
            <PassageSelector onSelectPassage={handleLoadPassage} />
            {renderPassageView()}
          </>
        }
        summary={renderSummaryView()}
      />

      {showAILoading && <AILoadingOverlay />}

      <StrongModal />
    </>
  );
}
