import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

export const CommentSection = ({ verseKey, verseNum }) => {
    const { comments, saveComment, deleteComment } = useAppContext();
    const [inputValue, setInputValue] = useState('');
    const textAreaRef = useRef(null);
    
    const notes = comments[verseKey] || [];

    const handleAddComment = useCallback(() => {
        saveComment(verseKey, inputValue);
        setInputValue('');
        if (textAreaRef.current) textAreaRef.current.focus();
    }, [saveComment, verseKey, inputValue]);

    const handleKeyDown = (e) => {
        // Implements original JS logic: Enter (not Shift+Enter) submits
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        }
    };

    return (
        <div className="comments ai-fade-in p-3 bg-bg-card rounded-lg mt-3 border border-gray-700">
            {notes.map((note, index) => (
                <div key={index} className="comment flex justify-between items-start text-sm border-b border-gray-700/50 last:border-b-0 py-2">
                    <span className='mr-4'>{note.text}</span>
                    <button 
                        className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                        onClick={() => deleteComment(verseKey, index)}
                    >
                        ✕
                    </button>
                </div>
            ))}

            <div className="comment-input flex gap-2 pt-3">
                <textarea 
                    ref={textAreaRef}
                    rows="1" 
                    placeholder="Add a note..."
                    className="flex-grow p-2 bg-gray-700/50 rounded-lg text-white resize-none focus:ring-1 focus:ring-primary focus:outline-none"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button 
                    className="py-2 px-4 bg-primary hover:bg-secondary text-white font-semibold rounded-lg transition-colors"
                    onClick={handleAddComment}
                >
                    Add
                </button>
            </div>
        </div>
    );
};