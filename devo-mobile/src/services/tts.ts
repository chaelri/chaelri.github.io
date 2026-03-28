// TTS service — Google Cloud TTS with en-US-Journey-D voice
// Same approach as the PWA: synthesize via API, play MP3 audio
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { getItem, setItem } from './storage';

const TTS_API = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const TTS_VOICE = { languageCode: 'en-US', name: 'en-US-Journey-D' };

// Max 2 concurrent synthesis requests (same as PWA)
let _synthCount = 0;
const _synthQueue: (() => void)[] = [];
const MAX_CONCURRENT = 2;

function synthAcquire(): Promise<void> {
  if (_synthCount < MAX_CONCURRENT) {
    _synthCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    _synthQueue.push(() => { _synthCount++; resolve(); });
  });
}

function synthRelease() {
  _synthCount--;
  if (_synthQueue.length > 0) {
    const next = _synthQueue.shift();
    next?.();
  }
}

// ── API Key management ──────────────────────────────────────────────────────
let _cachedKey: string | null = null;

export async function getTTSKey(): Promise<string | null> {
  if (_cachedKey) return _cachedKey;
  const key = await getItem('googleTtsKey');
  _cachedKey = key;
  return key;
}

export async function setTTSKey(key: string): Promise<void> {
  _cachedKey = key;
  await setItem('googleTtsKey', key);
}

export async function hasTTSKey(): Promise<boolean> {
  return !!(await getTTSKey());
}

// ── Synthesis ───────────────────────────────────────────────────────────────
export async function synthesize(text: string, retries = 5): Promise<string> {
  const key = await getTTSKey();
  if (!key) throw new Error('no-key');

  await synthAcquire();
  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(`${TTS_API}?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: TTS_VOICE,
            audioConfig: { audioEncoding: 'MP3' },
          }),
        });

        if (resp.status === 401 || resp.status === 403) throw new Error('auth');
        if (resp.status === 429) throw new Error('rate-limit');
        if (!resp.ok) throw new Error(`api-${resp.status}`);

        const { audioContent } = await resp.json();
        // Return base64 data URI
        return `data:audio/mp3;base64,${audioContent}`;
      } catch (err: any) {
        if (err.message === 'auth' || err.message === 'no-key') throw err;
        if (attempt < retries - 1) {
          const base = err.message === 'rate-limit' ? 3000 : 800;
          const delay = Math.min(base * Math.pow(1.8, attempt), 30000) + Math.random() * 1500;
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }
    throw new Error('max-retries');
  } finally {
    synthRelease();
  }
}

// ── Device Speech Fallback ───────────────────────────────────────────────────
function playWithDeviceSpeech(text: string): Promise<void> {
  // On web, use Web Speech API
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  // On native, try expo-speech
  try {
    const Speech = require('expo-speech');
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: 'en-US',
        rate: 0.9,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  } catch {
    // No speech available — just wait a bit to simulate reading time
    return new Promise((r) => setTimeout(r, Math.max(1000, text.length * 50)));
  }
}

// ── Chapter Player ──────────────────────────────────────────────────────────
export interface TTSChapterState {
  verses: { num: string; text: string }[];
  currentIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
}

interface SynthesizedVerse {
  num: string;
  text: string;
  audioUri: string | null;
  ready: Promise<void>;
}

export function createChapterPlayer(
  verses: { num: string; text: string }[],
  onStateChange: (state: TTSChapterState) => void
) {
  let currentIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let cancelled = false;
  let currentSound: Audio.Sound | null = null;

  // Pre-synthesize all verses in parallel (like PWA)
  const items: SynthesizedVerse[] = verses.map((v) => {
    const item: SynthesizedVerse = { ...v, audioUri: null, ready: Promise.resolve() };
    item.ready = synthesize(v.text)
      .then((uri) => { item.audioUri = uri; })
      .catch(() => { item.audioUri = null; });
    return item;
  });

  const emitState = () => {
    onStateChange({
      verses,
      currentIndex,
      isPlaying,
      isPaused,
    });
  };

  const playVerse = async (index: number) => {
    if (cancelled || index >= verses.length) {
      isPlaying = false;
      isPaused = false;
      emitState();
      return;
    }

    currentIndex = index;
    emitState();

    const item = items[index];
    await item.ready;

    if (cancelled || isPaused) return;

    if (!item.audioUri) {
      // Fallback: use device speech (Web Speech API or expo-speech)
      try {
        await playWithDeviceSpeech(item.text);
      } catch {}
      if (!cancelled && !isPaused) {
        currentIndex++;
        emitState();
        playVerse(currentIndex);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audioUri },
        { shouldPlay: true }
      );
      currentSound = sound;

      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            resolve();
          }
        });
      });

      await sound.unloadAsync();
      currentSound = null;

      if (!cancelled && !isPaused) {
        currentIndex++;
        emitState();
        playVerse(currentIndex);
      }
    } catch (err) {
      console.error('Playback error:', err);
      // Fallback to device speech
      try {
        await playWithDeviceSpeech(item.text);
      } catch {}
      if (!cancelled && !isPaused) {
        currentIndex++;
        emitState();
        playVerse(currentIndex);
      }
    }
  };

  return {
    play: async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
      cancelled = false;
      isPlaying = true;
      isPaused = false;
      emitState();
      playVerse(currentIndex);
    },
    pause: async () => {
      isPaused = true;
      isPlaying = false;
      if (currentSound) {
        await currentSound.pauseAsync();
      }
      emitState();
    },
    resume: async () => {
      isPaused = false;
      isPlaying = true;
      emitState();
      if (currentSound) {
        await currentSound.playAsync();
        // Re-listen for finish
        currentSound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            currentSound?.unloadAsync();
            currentSound = null;
            if (!cancelled && !isPaused) {
              currentIndex++;
              emitState();
              playVerse(currentIndex);
            }
          }
        });
      } else {
        playVerse(currentIndex);
      }
    },
    skipNext: async () => {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        currentSound = null;
      }
      if (currentIndex < verses.length - 1) {
        currentIndex++;
        emitState();
        if (isPlaying) playVerse(currentIndex);
      }
    },
    skipPrev: async () => {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        currentSound = null;
      }
      if (currentIndex > 0) {
        currentIndex--;
        emitState();
        if (isPlaying) playVerse(currentIndex);
      }
    },
    seekTo: async (index: number) => {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        currentSound = null;
      }
      currentIndex = Math.max(0, Math.min(index, verses.length - 1));
      emitState();
      if (isPlaying) playVerse(currentIndex);
    },
    stop: async () => {
      cancelled = true;
      isPlaying = false;
      isPaused = false;
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        currentSound = null;
      }
      currentIndex = 0;
      emitState();
    },
    destroy: async () => {
      cancelled = true;
      if (currentSound) {
        try {
          await currentSound.stopAsync();
          await currentSound.unloadAsync();
        } catch {}
        currentSound = null;
      }
    },
  };
}
