export function haptic(type = "light") {
  if (!navigator.vibrate) return;

  if (type === "success") navigator.vibrate([12, 20, 12]);
  else if (type === "warning") navigator.vibrate([40, 30, 40]);
  else navigator.vibrate(8);
}
