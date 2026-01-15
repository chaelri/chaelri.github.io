import React, { useEffect } from "react";
import { VerseItem } from "./VerseItem";
import { smoothScrollTo } from "../utils/ux";

export const PassageView = ({ passage }) => {
  // Global Click Listener for Reflection Links
  useEffect(() => {
    const handleLinkClick = (e) => {
      const link = e.target.closest('a[href^="#"]:not([href="#"])');
      if (!link) return;

      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id); // Target is the verse header

      if (!target) return;

      e.preventDefault();

      // Scroll to the verse
      smoothScrollTo(target, 50);

      // Highlight verse (Original JS logic)
      target.classList.remove("verse-highlight");
      void target.offsetWidth; // Force reflow
      target.classList.add("verse-highlight");
    };

    document.addEventListener("click", handleLinkClick);
    return () => document.removeEventListener("click", handleLinkClick);
  }, []);

  if (!passage || passage.verses.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        No verses found for this selection.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold mb-6" id="passageTitle">
        {passage.title}
      </h1>

      {passage.verses.map((v) => (
        <VerseItem key={v.verse} verse={v} bookName={passage.bookName} />
      ))}
    </div>
  );
};
