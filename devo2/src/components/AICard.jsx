import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchGemini, createAIContextSummaryPrompt, createAIReflectionQuestionsPrompt } from '../utils/api';
import { dbGet, dbPut } from '../utils/indexedDB';

// Component for a single reflection question and textarea
const ReflectionQuestion = ({ qId, questionText, initialAnswer }) => {
    const { saveReflectionAnswer } = useAppContext();
    const [answer, setAnswer] = useState(initialAnswer || '');
    
    // Save on every input (debounced in a real app, but immediate here as per JS original)
    const handleChange = (e) => {
        const newAnswer = e.target.value;
        setAnswer(newAnswer);
        saveReflectionAnswer(qId, questionText, newAnswer);
    };

    return (
        <div className="mb-4">
            <p className="font-medium text-gray-100 mb-2">{questionText}</p>
            <textarea
                id={qId}
                rows="3"
                className="w-full p-2 bg-gray-700/50 rounded-lg text-white resize-none focus:ring-1 focus:ring-primary focus:outline-none"
                value={answer}
                onChange={handleChange}
                placeholder="Write your reflection here..."
            />
        </div>
    );
};

// Component to handle the AI output and cache management
export const AICard = ({ devotionId, passage }) => {
    const { setShowAILoading, reflectionVisible } = useAppContext();
    const [contextHTML, setContextHTML] = useState(null);
    const [reflectionHTML, setReflectionHTML] = useState(null);
    const [isContextLoading, setIsContextLoading] = useState(true);
    const [isReflectionLoading, setIsReflectionLoading] = useState(true);
    const [aiError, setAIError] = useState(null);
    
    const reflectionMountRef = useRef(null);

    // --- AI GENERATION AND CACHING LOGIC (from original JS runAIForCurrentPassage) ---
    
    const runAIForCurrentPassage = useCallback(async () => {
        setIsContextLoading(true);
        setIsReflectionLoading(true);
        setAIError(null);
        setShowAILoading(true);
        
        try {
            // 1. Check Cache
            const cached = await dbGet(devotionId);
            if (cached && cached.contextHTML && cached.reflectionHTML) {
                setContextHTML(cached.contextHTML);
                setReflectionHTML(cached.reflectionHTML);
                setIsContextLoading(false);
                setIsReflectionLoading(false);
                return cached;
            }

            // 2. Fetch Context Summary
            const contextPrompt = createAIContextSummaryPrompt(passage.title);
            const [contextRes, reflectionRes] = await Promise.all([
                fetchGemini(contextPrompt, "summary"),
                // 3. Fetch Reflection Questions
                fetchGemini(createAIReflectionQuestionsPrompt(passage), "summary")
            ]);
            
            const newContextHTML = contextRes.candidates?.[0]?.content?.parts?.[0]?.text || "No AI context found.";
            const newReflectionHTML = reflectionRes.candidates?.[0]?.content?.parts?.[0]?.text || "No AI reflection questions found.";
            
            setContextHTML(newContextHTML);
            setReflectionHTML(newReflectionHTML);

            // 4. Save to Cache
            await dbPut({
                id: devotionId,
                contextHTML: newContextHTML,
                reflectionHTML: newReflectionHTML,
                answers: {}, // Answers are saved separately in localStorage by the ReflectionQuestion component
                updatedAt: Date.now(),
            });

        } catch (err) {
            console.error("AI Generation failed:", err);
            setAIError("Failed to generate AI content. Please retry.");
            setContextHTML(null);
            setReflectionHTML(null);
        } finally {
            setIsContextLoading(false);
            setIsReflectionLoading(false);
            setShowAILoading(false);
        }
    }, [devotionId, passage, setShowAILoading]);
    
    // Trigger AI generation on devotionId change (after passage is loaded)
    useEffect(() => {
        if (devotionId && passage.verses.length > 0) {
            runAIForCurrentPassage();
        }
    }, [devotionId, passage.verses.length, runAIForCurrentPassage]);


    // --- Reflection HTML to Component conversion (replaces innerHTML + JS loop) ---
    const renderReflection = () => {
        if (!reflectionHTML) return null;

        // Use a DOM parser to safely read the HTML string and extract questions
        const parser = new DOMParser();
        const doc = parser.parseFromString(reflectionHTML, 'text/html');
        const listItems = Array.from(doc.querySelectorAll('li'));
        
        return (
            <div id="aiReflection" className="space-y-4">
                {listItems.map((li, index) => {
                    const questionText = li.querySelector('p')?.textContent || `Question ${index + 1}`;
                    const qId = `reflection-${devotionId}-${index}`;
                    
                    // Retrieve saved answer from localStorage (ID used for persistence)
                    const savedEntry = localStorage.getItem(qId);
                    const initialAnswer = savedEntry ? (savedEntry.split("A: ")[1] || "") : "";
                    
                    return (
                        <ReflectionQuestion 
                            key={index} 
                            qId={qId}
                            questionText={questionText} 
                            initialAnswer={initialAnswer}
                        />
                    );
                })}
            </div>
        );
    };

    if (aiError) {
        return <div className="p-4 text-red-400 bg-red-900/30 rounded-lg">{aiError}</div>;
    }

    return (
        <div className="ai-container space-y-4">
            {/* AI Context Summary */}
            <div id="aiContextSummary" className="min-h-[100px]">
                {isContextLoading ? (
                    <div className="ai-shimmer" style={{maxWidth: '360px'}}>
                        <div className="ai-shimmer-block"></div>
                        <div className="ai-shimmer-block"></div>
                        <div className="ai-shimmer-block short"></div>
                    </div>
                ) : (
                    <div 
                        className="ai-fade-in"
                        dangerouslySetInnerHTML={{ __html: contextHTML }} 
                    />
                )}
            </div>
            
            {/* AI Reflection Questions */}
            <div 
                ref={reflectionMountRef}
                className="ai-reflection-mount"
                style={{display: reflectionVisible ? 'block' : 'none'}}
            >
                {isReflectionLoading ? (
                    <div className="ai-shimmer">
                        <div className="ai-shimmer-block"></div>
                        <div className="ai-shimmer-block"></div>
                        <div className="ai-shimmer-block short"></div>
                    </div>
                ) : (
                    <div className="ai-fade-in">
                        <h3 className="text-xl font-bold mb-4">Guided Reflection 🙏🏼</h3>
                        {renderReflection()}
                    </div>
                )}
            </div>
        </div>
    );
};