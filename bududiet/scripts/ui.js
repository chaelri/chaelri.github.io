export function haptic(type = "light") {
  if (!navigator.vibrate) return;

  if (type === "success") navigator.vibrate([20, 30, 20]);
  else if (type === "warning") navigator.vibrate([60]);
  else navigator.vibrate(10);
}
