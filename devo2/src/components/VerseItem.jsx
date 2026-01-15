import React, { useState, useCallback, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { CommentSection } from "./CommentSection";
import { InlineAIContext } from "./InlineAIContext";

export const VerseItem = ({ verse, bookName }) => {
  const { comments, bibleMeta } = useAppContext();
  const verseKey = useMemo(
    () => `${verse.book_id}-${verse.chapter}-${verse.verse}`,
    [verse]
  );
  const commentCount = comments[verseKey]?.length || 0;

  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [isInlineAIOpen, setIsInlineAIOpen] = useState(false);

  const toggleComments = useCallback(() => {
    setIsCommentsVisible((prev) => !prev);
    // Ensure inline AI is closed when comments are opened
    if (isInlineAIOpen) setIsInlineAIOpen(false);
  }, [isInlineAIOpen]);

  const toggleInlineAI = useCallback(() => {
    setIsInlineAIOpen((prev) => !prev);
    // Ensure comments are closed when inline AI is opened
    if (isCommentsVisible) setIsCommentsVisible(false);
  }, [isCommentsVisible]);

  return (
    <div
      className="verse border-l-4 border-primary/50 pl-3 py-1 mb-4"
      id={`verse-wrap-${verse.verse}`}
    >
      <div
        id={verse.verse}
        className="verse-header flex justify-between items-start cursor-pointer hover:bg-gray-700/20 p-1 -ml-1 rounded transition-colors"
        onClick={toggleComments}
      >
        <div className="text-lg flex-1">
          <span className="font-bold mr-2 text-primary text-base min-w-8 inline-block">
            {verse.verse}
          </span>
          <span className="text-gray-200">{verse.text}</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {commentCount > 0 && (
            <div className="comment-indicator text-sm text-gray-400">
              💬 {commentCount}
            </div>
          )}
          <button
            className={`inline-ai-btn text-xl transition-transform ${
              isInlineAIOpen
                ? "text-red-400 rotate-45"
                : "text-yellow-400 hover:text-yellow-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleInlineAI();
            }}
            title="Quick verse context"
          >
            ✨
          </button>
        </div>
      </div>

      {isInlineAIOpen && (
        <div className="inline-ai-mount">
          <InlineAIContext
            verse={verse}
            bookName={bookName}
            onClose={toggleInlineAI}
          />
        </div>
      )}

      {isCommentsVisible && (
        <CommentSection verseKey={verseKey} verseNum={verse.verse} />
      )}
    </div>
  );
};
