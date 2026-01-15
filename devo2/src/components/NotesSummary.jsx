import React, { useMemo, useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export const NotesSummary = ({ passage }) => {
    const { comments } = useAppContext();
    const [copyStatus, setCopyStatus] = useState('');
    
    // 1. Filter and sort notes (window.__currentSummaryItems logic)
    const summaryItems = useMemo(() => {
        const items = [];
        Object.entries(comments).forEach(([key, list]) => {
            const [b, c, v] = key.split("-");
            
            if (b === passage.bookId && c === passage.chapterNum.toString()) {
                if (!passage.verseNum || Number(v) === Number(passage.verseNum)) {
                    if (list.length) {
                        items.push({ verseNum: Number(v), list });
                    }
                }
            }
        });
        
        // Sort by verse number
        items.sort((a, b) => a.verseNum - b.verseNum);
        return items;
    }, [comments, passage]);
    
    // 2. Copy Notes Logic (from original JS)
    const copyNotes = useCallback(async () => {
        if (!summaryItems.length) {
            alert("No notes to copy.");
            return;
        }

        const lines = [passage.title, ""];

        summaryItems.forEach((item) => {
            const joined = item.list.map((n) => n.text).join("; ");
            lines.push(`v${item.verseNum}: ${joined}`);
        });

        const reflectionLines = [];
        let hasReflections = false;
        
        // Iterate through all reflection answers saved in localStorage
        for (let i = 0; i < 3; i++) {
            const id = `reflection-${passage.devotionId}-${i}`;
            const entry = localStorage.getItem(id); // Saved in Q: \n A: format
            if (entry) {
                // Check if the answer part is not empty
                const answerOnly = entry.split("A: ")[1]?.trim();
                if (answerOnly) {
                    reflectionLines.push(entry);
                    reflectionLines.push(""); 
                    hasReflections = true;
                }
            }
        }

        if (hasReflections) {
            lines.push("\nGuided Reflection 🙏🏼\n");
            lines.push(...reflectionLines);
        }

        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopyStatus("✅ Notes copied to clipboard");
            setTimeout(() => setCopyStatus(""), 2000);
        } catch (err) {
            setCopyStatus("❌ Failed to copy notes.");
            console.error("Clipboard write failed:", err);
        }
    }, [summaryItems, passage]);

    const hasNotes = summaryItems.length > 0;

    return (
        <div className="mt-8 border-t border-gray-700 pt-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Your Notes</h3>
                {hasNotes && (
                    <button 
                        id="copyNotesBtn" 
                        className="text-sm bg-primary/20 hover:bg-primary/40 text-primary py-1 px-3 rounded-lg transition-colors" 
                        onClick={copyNotes}
                    >
                        Copy Notes
                    </button>
                )}
            </div>
            <p id="notesCopyStatus" className="text-xs text-green-400 mb-2">{copyStatus}</p>
            
            <div id="summaryContent" className="space-y-4">
                {!hasNotes ? (
                    <p className="text-gray-500">No notes yet for this passage.</p>
                ) : (
                    summaryItems.map((item) => (
                        <div key={item.verseNum} className="summary-item bg-gray-700/30 p-3 rounded-lg">
                            <div className="summary-verse font-bold text-primary mb-2">Verse {item.verseNum}</div>
                            {item.list.map((n, index) => (
                                <div key={index} className="summary-note text-sm mb-1 text-gray-300">
                                    {n.text}
                                    <time className="block text-xs text-gray-500 mt-0.5">
                                        {new Date(n.time).toLocaleString()}
                                    </time>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};