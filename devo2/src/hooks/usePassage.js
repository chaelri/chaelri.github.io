import { useState, useMemo, useCallback } from 'react';
import { useBibleData } from './useBibleData';

const initialBookId = "JHN";

export const usePassage = () => {
  const { bibleMeta, bibleContent, isLoading: isDataLoading, error: dataError } = useBibleData();
  const [bookId, setBookId] = useState(initialBookId);
  const [chapterNum, setChapterNum] = useState(1);
  const [verseNum, setVerseNum] = useState('');

  const currentPassage = useMemo(() => {
    if (!bibleContent || isDataLoading) return null;

    const bookName = bibleMeta[bookId]?.name.toUpperCase();
    const effectiveBookName = bookName === "PSALMS" ? "PSALM" : bookName;
    
    if (!effectiveBookName || !bibleContent[effectiveBookName]) return null;

    const chapterContent = bibleContent[effectiveBookName][chapterNum.toString()];
    if (!chapterContent) return null;

    let verses = Object.entries(chapterContent).map(([vNum, text]) => ({
      book_id: bookId,
      chapter: Number(chapterNum),
      verse: Number(vNum),
      text: text.trim().replace(/\s+/g, " "),
    }));

    if (verseNum) {
      verses = verses.filter((v) => v.verse === Number(verseNum));
    }

    const title = `${bibleMeta[bookId].name} ${chapterNum}${verseNum ? `:${verseNum}` : ''}`;
    const devotionId = `${bookId}-${chapterNum}-${verseNum}`;

    return {
      bookId,
      bookName: bibleMeta[bookId].name,
      chapterNum,
      verseNum,
      verses,
      title,
      devotionId,
      fullVersesText: verses.map((v) => `${v.verse}. ${v.text}`).join("\n"),
    };
  }, [bookId, chapterNum, verseNum, bibleContent, isDataLoading, bibleMeta]);

  const handleBookChange = useCallback((newBookId) => {
    setBookId(newBookId);
    setChapterNum(1);
    setVerseNum('');
  }, []);

  const handleChapterChange = useCallback((newChapterNum) => {
    setChapterNum(Number(newChapterNum));
    setVerseNum('');
  }, []);

  const handleVerseChange = useCallback((newVerseNum) => {
    setVerseNum(newVerseNum);
  }, []);

  return {
    bookId,
    chapterNum,
    verseNum,
    currentPassage,
    isDataLoading,
    dataError,
    bibleMeta,
    handleBookChange,
    handleChapterChange,
    handleVerseChange,
  };
};