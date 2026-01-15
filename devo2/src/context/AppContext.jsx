import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { dbPut } from '../utils/indexedDB';

const AppContext = createContext();
export const useAppContext = () => useContext(AppContext);

// Key constants for localStorage
const NOTES_KEY = 'bibleComments';
const REFLECTION_VISIBILITY_KEY = 'reflectionVisible';

const getInitialNotes = (key, defaultValue) => {
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            
            if (key === NOTES_KEY) {
                // Migrate old notes (from original JS)
                Object.keys(data).forEach((k) => {
                    data[k] = data[k].map((n) =>
                        typeof n === "string" ? { text: n, time: Date.now() } : n
                    );
                });
            }
            return data;
        } catch {
            return defaultValue;
        }
    }
    return defaultValue;
};

export const AppProvider = ({ children }) => {
    /* ----------------- LOCAL STORAGE STATE ----------------- */
    const [comments, setComments] = useState(() => getInitialNotes(NOTES_KEY, {}));
    const [reflectionVisible, setReflectionVisible] = useState(() => JSON.parse(localStorage.getItem(REFLECTION_VISIBILITY_KEY)) ?? false);
    
    // We will let the AICard handle loading reflection answers from IDB/localStorage after generation

    // Persist reflection visibility
    useEffect(() => {
        localStorage.setItem(REFLECTION_VISIBILITY_KEY, JSON.stringify(reflectionVisible));
    }, [reflectionVisible]);
    
    const toggleReflectionVisibility = useCallback(() => {
        setReflectionVisible(prev => !prev);
    }, []);

    const saveComment = useCallback((key, newNoteText) => {
        if (!newNoteText.trim()) return;
        
        const updatedComments = { ...comments };
        const list = updatedComments[key] || [];
        list.push({ text: newNoteText.trim(), time: Date.now() });
        updatedComments[key] = list;

        setComments(updatedComments);
        localStorage.setItem(NOTES_KEY, JSON.stringify(updatedComments));
    }, [comments]);

    const deleteComment = useCallback((key, index) => {
        const updatedComments = { ...comments };
        updatedComments[key].splice(index, 1);
        
        if (updatedComments[key].length === 0) {
            delete updatedComments[key];
        }

        setComments(updatedComments);
        localStorage.setItem(NOTES_KEY, JSON.stringify(updatedComments));
    }, [comments]);
    
    // Save reflection answer: id is the textarea id, Q and A are text.
    const saveReflectionAnswer = useCallback((id, questionText, answerText) => {
        const formattedEntry = `Q: ${questionText}\nA: ${answerText}`;
        localStorage.setItem(id, formattedEntry);
    }, []);


    /* ----------------- STRONG MODAL STATE ----------------- */
    const [modalState, setModalState] = useState({
        isOpen: false,
        strongNum: null,
        contextText: null,
    });

    const openStrongModal = useCallback((strongNum, contextText) => {
        setModalState({ isOpen: true, strongNum, contextText });
    }, []);

    const closeStrongModal = useCallback(() => {
        setModalState(prev => ({ ...prev, isOpen: false }));
    }, []);
    
    /* ----------------- AI LOADING STATE ----------------- */
    const [showAILoading, setShowAILoading] = useState(false);
    
    /* ----------------- LEGACY MIGRATION (from original JS) ----------------- */
    useEffect(() => {
        const runMigration = async () => {
            const legacy = localStorage.getItem("ai-legacy-migrated");
            if (legacy) return;

            Object.keys(localStorage)
                .filter((k) => k.startsWith("ai-"))
                .forEach(async (k) => {
                    try {
                        const data = JSON.parse(localStorage.getItem(k));
                        if (!data) return;
                        await dbPut({
                            id: k.replace("ai-", ""),
                            ...data,
                            migratedAt: Date.now(),
                        });
                        localStorage.removeItem(k); // Clean up legacy
                    } catch (e) {
                        console.error("Migration error:", e);
                    }
                });

            localStorage.setItem("ai-legacy-migrated", "1");
        };
        runMigration();
    }, []);


    const value = {
        // Strong Modal
        modalState,
        openStrongModal,
        closeStrongModal,
        
        // AI Loading
        showAILoading,
        setShowAILoading,
        
        // Comments / Notes
        comments,
        saveComment,
        deleteComment,
        
        // Reflections
        reflectionVisible,
        toggleReflectionVisibility,
        saveReflectionAnswer,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};