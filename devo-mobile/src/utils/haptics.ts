import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isDevice = Platform.OS !== 'web';

// ── Tap feedback ───────────────────────────────────────────────
// Light: subtle confirmation — nav arrows, chips, toggles
export const tap = () => {
  if (isDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

// Medium: intentional action — buttons, sending messages, saving
export const press = () => {
  if (isDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

// Heavy: destructive or important — delete, long-press, paywall CTA
export const thud = () => {
  if (isDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

// ── Selection tick ─────────────────────────────────────────────
// Tiny tick for picker scrolls, tab switches, version toggle
export const tick = () => {
  if (isDevice) Haptics.selectionAsync();
};

// ── Notification patterns ──────────────────────────────────────
// Content loaded successfully — "ding!"
export const success = () => {
  if (isDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// Something went wrong
export const error = () => {
  if (isDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
};

// Limit reached, heads up
export const warning = () => {
  if (isDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
};

// ── Rhythmic patterns ──────────────────────────────────────────
// "tug tug tug" — 3 staggered pulses synced with sparkle loading animation
// Returns a stop function. Loops every 1.8s until stopped.
let _sparkleTimer: ReturnType<typeof setInterval> | null = null;
const _fireSparkle = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 300);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 600);
};
export const sparkleRhythm = () => {
  if (!isDevice) return;
  stopSparkle(); // clear any previous
  _fireSparkle();
  _sparkleTimer = setInterval(_fireSparkle, 1800);
};
export const stopSparkle = () => {
  if (_sparkleTimer) { clearInterval(_sparkleTimer); _sparkleTimer = null; }
};

// Heartbeat — two quick taps, like a pulse. Good for "something is happening"
export const heartbeat = () => {
  if (!isDevice) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
};

// Gentle ramp up — escalating taps for building anticipation (paywall shimmer, purchase)
export const rampUp = () => {
  if (!isDevice) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 120);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 260);
};
