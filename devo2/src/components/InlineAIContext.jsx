import React, { useState, useEffect, useCallback } from 'react';
import { fetchGemini, createQuickContextPrompt, createDigDeeperPrompt } from '../utils/api';
import { useAppContext } from '../context/AppContext';

// Component for the "Dig Deeper" analysis
const DigDeeperSection = ({ verse, bookName }) => {
    const { openStrongModal } = useAppContext();
    const [htmlContent, setHtmlContent] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchDigDeeper = useCallback(async () => {
        setIsLoading(true);
        setHtmlContent(null);
        try {
            const prompt = createDigDeeperPrompt(bookName, verse.chapter, verse.verse);
            const data = await fetchGemini(prompt, "summary");
            
            const html = data.candidates?.[0]?.content?.parts?.[0]?.text || "<div>Failed to generate structured data.</div>";
            setHtmlContent(html);
        } catch (err) {
            console.error("Dig Deeper failed:", err);
            setHtmlContent("<div>Failed to load Dig Deeper analysis.</div>");
        } finally {
            setIsLoading(false);
        }
    }, [verse, bookName]);
    
    // Mount effect to trigger the fetch
    useEffect(() => {
        fetchDigDeeper();
    }, [fetchDigDeeper]);
    
    // Effect to attach Strong's number click handlers after HTML is set
    useEffect(() => {
        if (!htmlContent) return;

        // --- DOM Parsing and Click Handler Logic (from original JS) ---
        const temp = document.createElement("div");
        temp.innerHTML = htmlContent;
        const root = temp.querySelector("div");
        
        if (!root) return;
        
        // This is where we inject the structured HTML into the DOM and attach listeners
        const mountEl = document.getElementById(`deep-${verse.book_id}-${verse.chapter}-${verse.verse}`);
        if (!mountEl) return;
        
        mountEl.innerHTML = '';
        mountEl.classList.add("inline-ai-deep");

        const lexCol = document.createElement("div");
        lexCol.className = "deep-col deep-col-lexical";
        lexCol.innerHTML = `<div class="deep-col-title">Original Words</div>`;

        const flowCol = document.createElement("div");
        flowCol.className = "deep-col deep-col-flow";
        flowCol.innerHTML = `<div class="deep-col-title">Message Flow</div>`;

        const metaCol = document.createElement("div");
        metaCol.className = "deep-col deep-col-meta";
        metaCol.innerHTML = `<div class="deep-col-title">Overview</div>`;

        root.querySelectorAll("section").forEach((section) => {
            const col = section.dataset.col;

            if (col === "lexical") {
                section.querySelectorAll("div").forEach((el) => {
                    let html = el.innerHTML;
                    const hasGreek = /[\u0370-\u03FF]/.test(html);
                    const hasHebrew = /[\u0590-\u05FF]/.test(html);

                    if (!hasGreek && !hasHebrew) return; 

                    // Identify Strong's number [G1234] or [H1234]
                    html = html.replace(
                        /\[([GH]\d+)\]/g,
                        '<a class="strong-num" data-strong="$1">[$1]</a>'
                    );

                    const newEl = document.createElement("div");
                    newEl.className = "lex-item";
                    newEl.innerHTML = html;

                    newEl.querySelectorAll(".strong-num").forEach((sn) => {
                        sn.onclick = (e) => {
                            e.stopPropagation();
                            // The handler uses the global openStrongModal function
                            openStrongModal(sn.dataset.strong, newEl.textContent); 
                        };
                    });

                    lexCol.appendChild(newEl);
                });
            }

            if (col === "flow") {
                section.querySelectorAll("div").forEach((el, i, arr) => {
                    el.classList.add("flow-step");
                    flowCol.appendChild(el);
                    if (i < arr.length - 1) {
                        const arrow = document.createElement("div");
                        arrow.className = "flow-arrow";
                        arrow.textContent = "↓";
                        flowCol.appendChild(arrow);
                    }
                });
            }

            if (col === "meta") {
                section.querySelectorAll("div").forEach((el) => {
                    const block = document.createElement("div");
                    block.className = "meta-block";

                    if (el.hasAttribute("data-type")) {
                        block.innerHTML = `<div class="meta-label">Type</div>${el.textContent}`;
                    } else if (el.hasAttribute("data-focus")) {
                        block.innerHTML = `<div class="meta-label">Focus</div>${el.textContent}`;
                    } else if (el.hasAttribute("data-time")) {
                        block.innerHTML = `<div class="meta-label">Time</div>${el.textContent}`;
                    }

                    metaCol.appendChild(block);
                });
            }
        });

        mountEl.appendChild(lexCol);
        mountEl.appendChild(flowCol);
        mountEl.appendChild(metaCol);

        // Highlight shared keyword
        metaCol.querySelectorAll("[data-keyword]").forEach((kw) => {
            lexCol.querySelectorAll(".lex-item").forEach((item) => {
                if (item.textContent.includes(kw.dataset.keyword)) {
                    item.classList.add("lexeme-highlight");
                }
            });
        });

        // Cleanup function for useEffect
        return () => {
             if(mountEl) mountEl.innerHTML = '';
        }
        
    }, [htmlContent, verse, bookName, openStrongModal]);

    if (isLoading) {
        return (
            <div className="inline-ai-loading">
                <div className="inline-ai-spinner"></div>
                <span>Digging deeper…</span>
            </div>
        );
    }
    
    // We render an empty div with an ID, and let the useEffect hook populate it
    return (
        <div id={`deep-${verse.book_id}-${verse.chapter}-${verse.verse}`}>
            {/* Content populated by useEffect / DOM manipulation */}
        </div>
    );
};

// Main component for the inline AI mount
export const InlineAIContext = ({ verse, bookName, onClose }) => {
    const [quickContextHTML, setQuickContextHTML] = useState('');
    const [isQuickContextLoading, setIsQuickContextLoading] = useState(false);
    const [isDigDeeperVisible, setIsDigDeeperVisible] = useState(false);

    // Fetch Quick Context
    const fetchQuickContext = useCallback(async () => {
        setIsQuickContextLoading(true);
        setQuickContextHTML('');
        try {
            const prompt = createQuickContextPrompt(bookName, verse.chapter, verse.verse, verse.text);
            const data = await fetchGemini(prompt, "summary");
            
            const html = data.candidates?.[0]?.content?.parts?.[0]?.text || "<p>Failed to get quick context.</p>";
            setQuickContextHTML(html);

        } catch (err) {
            console.error("Quick Context failed:", err);
            setQuickContextHTML("<p>Failed to load quick context.</p>");
        } finally {
            setIsQuickContextLoading(false);
        }
    }, [verse, bookName]);
    
    useEffect(() => {
        fetchQuickContext();
    }, [fetchQuickContext]);

    const handleDigDeeper = () => {
        setIsDigDeeperVisible(prev => !prev);
    };

    if (isQuickContextLoading) {
        return (
            <div className="p-3">
                <div className="inline-ai-loading">
                    <div className="inline-ai-spinner"></div>
                    <span>Quick context…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3">
            <div className="inline-ai-result bg-bg-card p-4 rounded-lg border border-primary/50">
                <button 
                    className="inline-ai-close float-right text-gray-400 hover:text-white"
                    onClick={onClose}
                    title="Close"
                >
                    ✕
                </button>
                <div 
                    className='text-sm text-gray-200'
                    dangerouslySetInnerHTML={{ __html: quickContextHTML }} 
                />
                <div className="inline-ai-actions mt-3 flex justify-end">
                    <button 
                        className="inline-ai-dig text-sm text-primary hover:text-secondary font-semibold"
                        onClick={handleDigDeeper}
                    >
                        🔎 Dig Deeper ({isDigDeeperVisible ? 'Hide' : 'Show'})
                    </button>
                </div>
                
                <div className="inline-ai-deep mt-4" hidden={!isDigDeeperVisible}>
                    {isDigDeeperVisible && <DigDeeperSection verse={verse} bookName={bookName} />}
                </div>
            </div>
        </div>
    );
};