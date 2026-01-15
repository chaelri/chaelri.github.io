import React, { useMemo } from 'react';
import { usePassage } from '../hooks/usePassage';

export const PassageSelector = ({ onSelectPassage }) => {
  const {
    bookId,
    chapterNum,
    verseNum,
    bibleMeta,
    handleBookChange,
    handleChapterChange,
    handleVerseChange,
  } = usePassage();

  const chapterCount = useMemo(() => {
    return bibleMeta[bookId]?.chapters.length || 0;
  }, [bookId, bibleMeta]);

  const verseCount = useMemo(() => {
    return bibleMeta[bookId]?.chapters[chapterNum - 1] || 0;
  }, [bookId, chapterNum, bibleMeta]);

  const SelectorControl = ({ label, value, onChange, options }) => {
    const hasValue = !!value;
    
    const controlClasses = `p-3 rounded-xl bg-bg-card transition-all duration-200 ${
      hasValue ? 'ring-2 ring-primary shadow-lg' : 'hover:ring-1 hover:ring-gray-600'
    }`;
    
    return (
      <div className={controlClasses}>
        <label className="text-xs text-gray-400 block mb-1">{label}</label>
        <select
          className="w-full bg-transparent text-white focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-gray-800 text-white">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="bg-bg-dark desktop:sticky desktop:top-0 p-4 border-b border-gray-700 desktop:border-b-0 desktop:h-auto z-10">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SelectorControl
          label="Book"
          value={bookId}
          onChange={handleBookChange}
          options={Object.entries(bibleMeta).map(([id, data]) => ({ value: id, label: data.name }))}
        />

        <SelectorControl
          label="Chapter"
          value={chapterNum}
          onChange={handleChapterChange}
          options={Array.from({ length: chapterCount }, (_, i) => ({ value: i + 1, label: i + 1 }))}
        />

        <SelectorControl
          label="Verse"
          value={verseNum}
          onChange={handleVerseChange}
          options={[
            { value: '', label: 'All verses' },
            ...Array.from({ length: verseCount }, (_, i) => ({ value: i + 1, label: i + 1 }))
          ]}
        />
      </div>

      <button
        id="load"
        className="w-full py-3 bg-primary hover:bg-secondary text-white font-bold rounded-xl transition duration-200 shadow-md hover:shadow-lg"
        onClick={onSelectPassage}
      >
        Search & Load Passage
      </button>
    </div>
  );
};