// Lightweight persistence using expo-secure-store
// SecureStore has a ~2KB limit per key, so we chunk large data
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'devo_';

// Web fallback uses localStorage
const isWeb = Platform.OS === 'web';

export async function setItem(key: string, value: string): Promise<void> {
  const k = PREFIX + key;
  if (isWeb) {
    try { localStorage.setItem(k, value); } catch {}
    return;
  }
  // SecureStore has a 2048-byte limit — chunk if needed
  if (value.length <= 2000) {
    await SecureStore.setItemAsync(k, value);
    await SecureStore.deleteItemAsync(k + '_chunks');
  } else {
    const chunks = Math.ceil(value.length / 2000);
    await SecureStore.setItemAsync(k + '_chunks', String(chunks));
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(k + '_' + i, value.slice(i * 2000, (i + 1) * 2000));
    }
  }
}

export async function getItem(key: string): Promise<string | null> {
  const k = PREFIX + key;
  if (isWeb) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  const chunksStr = await SecureStore.getItemAsync(k + '_chunks');
  if (chunksStr) {
    const chunks = parseInt(chunksStr, 10);
    let result = '';
    for (let i = 0; i < chunks; i++) {
      const part = await SecureStore.getItemAsync(k + '_' + i);
      if (part) result += part;
    }
    return result || null;
  }
  return SecureStore.getItemAsync(k);
}

export async function removeItem(key: string): Promise<void> {
  const k = PREFIX + key;
  if (isWeb) {
    try { localStorage.removeItem(k); } catch {}
    return;
  }
  const chunksStr = await SecureStore.getItemAsync(k + '_chunks');
  if (chunksStr) {
    const chunks = parseInt(chunksStr, 10);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.deleteItemAsync(k + '_' + i);
    }
    await SecureStore.deleteItemAsync(k + '_chunks');
  }
  await SecureStore.deleteItemAsync(k);
}

// JSON helpers
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setJSON(key: string, value: any): Promise<void> {
  await setItem(key, JSON.stringify(value));
}
