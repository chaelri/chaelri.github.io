import { useState, useEffect } from 'react';
import { BIBLE_META } from '../data/BIBLE_META';
import nasb2020Data from '../data/nasb2020.json';

export const useBibleData = () => {
  const [bibleContent, setBibleContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      setBibleContent(nasb2020Data);
      setIsLoading(false);
    } catch (err) {
      setError("Failed to load local Bible data.");
      setIsLoading(false);
    }
  }, []);

  return {
    bibleMeta: BIBLE_META,
    bibleContent,
    isLoading,
    error
  };
};