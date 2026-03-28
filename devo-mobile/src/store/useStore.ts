import { create } from 'zustand';
import { getJSON, setJSON, removeItem } from '../services/storage';

type ColorScheme = 'dark' | 'light';

export interface Note {
  id: string;
  title: string;
  body: string;
  verseKey?: string; // e.g. "JHN-3-16"
  bookName?: string;
  chapter?: number;
  verseNum?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Comment {
  verseKey: string;
  text: string;
  updatedAt: number;
}

export interface Highlight {
  verseKey: string;
  color: string; // hex color
  createdAt: number;
}

interface BibleState {
  _hydrated: boolean;

  // Theme
  colorScheme: ColorScheme;
  toggleTheme: () => void;

  // Bible navigation
  currentBook: string;
  currentChapter: number;
  currentVerse: number | null;
  currentVersion: 'NASB' | 'EASY';
  setBook: (book: string) => void;
  setChapter: (chapter: number) => void;
  setVerse: (verse: number | null) => void;
  setVersion: (version: 'NASB' | 'EASY') => void;

  // Onboarding
  hasSeenOnboarding: boolean;
  completeOnboarding: () => void;

  // Premium
  isPremium: boolean;
  setPremium: (val: boolean) => void;

  // Daily limits
  dailyLimits: {
    date: string;
    crossRef: number;
    verseChat: number;
    verseChatKeys: string[];
    digDeeper: number;
    immersiveTts: number;
  };
  incrementLimit: (feature: 'crossRef' | 'verseChat' | 'digDeeper' | 'immersiveTts') => void;
  canUseFeature: (feature: 'crossRef' | 'verseChat' | 'digDeeper' | 'immersiveTts') => boolean;
  resetLimitsIfNewDay: () => void;

  // Favorites
  favorites: Record<string, number>;
  toggleFavorite: (key: string) => void;
  isFavorite: (key: string) => boolean;

  // Notes
  notes: Note[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'body'>>) => void;
  deleteNote: (id: string) => void;

  // Comments (per-verse)
  comments: Record<string, Comment>;
  setComment: (verseKey: string, text: string) => void;
  deleteComment: (verseKey: string) => void;

  // Highlights
  highlights: Record<string, Highlight>;
  toggleHighlight: (verseKey: string, color?: string) => void;
  isHighlighted: (verseKey: string) => boolean;

  // User
  userName: string;
  setUserName: (name: string) => void;

  // Persistence
  hydrate: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const FREE_LIMITS = {
  crossRef: 3,
  verseChat: 3,
  digDeeper: 1,
  immersiveTts: 1,
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Debounced persist
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPersist(state: BibleState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistState(state);
  }, 500);
}

async function persistState(state: BibleState) {
  const data = {
    colorScheme: state.colorScheme,
    currentBook: state.currentBook,
    currentChapter: state.currentChapter,
    currentVersion: state.currentVersion,
    hasSeenOnboarding: state.hasSeenOnboarding,
    isPremium: state.isPremium,
    dailyLimits: state.dailyLimits,
    favorites: state.favorites,
    notes: state.notes,
    comments: state.comments,
    highlights: state.highlights,
    userName: state.userName,
  };
  await setJSON('app_state', data);
}

export const useStore = create<BibleState>((set, get) => ({
  _hydrated: false,

  // Theme
  colorScheme: 'dark',
  toggleTheme: () => {
    set((s) => ({ colorScheme: s.colorScheme === 'dark' ? 'light' : 'dark' }));
    debouncedPersist(get());
  },

  // Bible navigation
  currentBook: 'JHN',
  currentChapter: 1,
  currentVerse: null,
  currentVersion: 'NASB',
  setBook: (book) => {
    set({ currentBook: book, currentChapter: 1, currentVerse: null });
    debouncedPersist(get());
  },
  setChapter: (chapter) => {
    set({ currentChapter: chapter, currentVerse: null });
    debouncedPersist(get());
  },
  setVerse: (verse) => set({ currentVerse: verse }),
  setVersion: (version) => {
    set({ currentVersion: version });
    debouncedPersist(get());
  },

  // Onboarding
  hasSeenOnboarding: false,
  completeOnboarding: () => {
    set({ hasSeenOnboarding: true });
    debouncedPersist(get());
  },

  // Premium
  isPremium: false,
  setPremium: (val) => {
    set({ isPremium: val });
    debouncedPersist(get());
  },

  // Daily limits
  dailyLimits: {
    date: getTodayKey(),
    crossRef: 0,
    verseChat: 0,
    verseChatKeys: [],
    digDeeper: 0,
    immersiveTts: 0,
  },
  incrementLimit: (feature) => {
    set((s) => ({
      dailyLimits: {
        ...s.dailyLimits,
        [feature]: (s.dailyLimits[feature as keyof typeof s.dailyLimits] as number) + 1,
      },
    }));
    debouncedPersist(get());
  },
  canUseFeature: (feature) => {
    const state = get();
    if (state.isPremium) return true;
    state.resetLimitsIfNewDay();
    const used = state.dailyLimits[feature] as number;
    const max = FREE_LIMITS[feature];
    return used < max;
  },
  resetLimitsIfNewDay: () => {
    const today = getTodayKey();
    const state = get();
    if (state.dailyLimits.date !== today) {
      set({
        dailyLimits: {
          date: today,
          crossRef: 0,
          verseChat: 0,
          verseChatKeys: [],
          digDeeper: 0,
          immersiveTts: 0,
        },
      });
    }
  },

  // Favorites
  favorites: {},
  toggleFavorite: (key) => {
    set((s) => {
      const newFavs = { ...s.favorites };
      if (newFavs[key]) {
        delete newFavs[key];
      } else {
        newFavs[key] = Date.now();
      }
      return { favorites: newFavs };
    });
    debouncedPersist(get());
  },
  isFavorite: (key) => !!get().favorites[key],

  // Notes
  notes: [],
  addNote: (note) => {
    const now = Date.now();
    const newNote: Note = {
      ...note,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ notes: [newNote, ...s.notes] }));
    debouncedPersist(get());
  },
  updateNote: (id, updates) => {
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
      ),
    }));
    debouncedPersist(get());
  },
  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    debouncedPersist(get());
  },

  // Comments
  comments: {},
  setComment: (verseKey, text) => {
    set((s) => ({
      comments: {
        ...s.comments,
        [verseKey]: { verseKey, text, updatedAt: Date.now() },
      },
    }));
    debouncedPersist(get());
  },
  deleteComment: (verseKey) => {
    set((s) => {
      const newComments = { ...s.comments };
      delete newComments[verseKey];
      return { comments: newComments };
    });
    debouncedPersist(get());
  },

  // Highlights
  highlights: {},
  toggleHighlight: (verseKey, color = '#486bec') => {
    set((s) => {
      const newHighlights = { ...s.highlights };
      if (newHighlights[verseKey]) {
        delete newHighlights[verseKey];
      } else {
        newHighlights[verseKey] = { verseKey, color, createdAt: Date.now() };
      }
      return { highlights: newHighlights };
    });
    debouncedPersist(get());
  },
  isHighlighted: (verseKey) => !!get().highlights[verseKey],

  // User
  userName: '',
  setUserName: (name) => {
    set({ userName: name });
    debouncedPersist(get());
  },

  // Persistence
  hydrate: async () => {
    try {
      const data = await getJSON<any>('app_state');
      if (data) {
        set({
          colorScheme: data.colorScheme || 'dark',
          currentBook: data.currentBook || 'JHN',
          currentChapter: data.currentChapter || 1,
          currentVersion: data.currentVersion || 'NASB',
          hasSeenOnboarding: data.hasSeenOnboarding || false,
          isPremium: data.isPremium || false,
          dailyLimits: data.dailyLimits || {
            date: getTodayKey(),
            crossRef: 0,
            verseChat: 0,
            verseChatKeys: [],
            digDeeper: 0,
            immersiveTts: 0,
          },
          favorites: data.favorites || {},
          notes: data.notes || [],
          comments: data.comments || {},
          highlights: data.highlights || {},
          userName: data.userName || '',
          _hydrated: true,
        });
      } else {
        set({ _hydrated: true });
      }
    } catch (err) {
      console.error('Failed to hydrate store:', err);
      set({ _hydrated: true });
    }
  },

  clearAllData: async () => {
    await removeItem('app_state');
    set({
      colorScheme: 'dark',
      currentBook: 'JHN',
      currentChapter: 1,
      currentVerse: null,
      currentVersion: 'NASB',
      hasSeenOnboarding: true, // keep onboarding done
      isPremium: false,
      dailyLimits: {
        date: getTodayKey(),
        crossRef: 0,
        verseChat: 0,
        verseChatKeys: [],
        digDeeper: 0,
        immersiveTts: 0,
      },
      favorites: {},
      notes: [],
      comments: {},
      highlights: {},
      userName: '',
    });
  },
}));

export { FREE_LIMITS };
