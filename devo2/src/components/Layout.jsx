import React, { useRef, useState, useEffect } from 'react';

export const Layout = ({ passage, summary }) => {
  const layoutRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Logic for the Scroll Top button on mobile
  useEffect(() => {
    const layoutEl = layoutRef.current;
    if (!layoutEl) return;

    const handleScroll = () => {
      // Only show on screens <= 900px width (Tailwind 'desktop' breakpoint)
      if (window.innerWidth <= 900) {
        setShowScrollTop(layoutEl.scrollTop > 160);
      } else {
        setShowScrollTop(false);
      }
    };

    layoutEl.addEventListener('scroll', handleScroll);
    return () => layoutEl.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTop = () => {
    layoutRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      ref={layoutRef}
      className="layout h-screen overflow-y-auto bg-bg-dark text-white"
    >
      <div className="desktop:grid desktop:grid-cols-[1fr_360px] max-w-7xl mx-auto">
        
        {/* Left Column: Passage View (output) */}
        <main className="min-h-screen p-4 desktop:p-8 border-r border-gray-700">
          {passage}
        </main>
        
        {/* Right Column: Summary/AI (summary) */}
        <aside className="summary desktop:h-screen desktop:overflow-y-auto bg-bg-dark p-4 desktop:p-6">
          {summary}
        </aside>

      </div>
      
      {/* Scroll Top Button (Mobile only) */}
      {showScrollTop && (
        <button
          id="scrollTopBtn"
          className="fixed bottom-4 right-4 z-40 p-3 bg-secondary hover:bg-primary rounded-full shadow-lg transition-all"
          onClick={handleScrollTop}
          title="Scroll to Top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </div>
  );
};