import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';

export function useTheme() {
  const colorScheme = useStore((s) => s.colorScheme);
  return Colors[colorScheme];
}

export function useColorScheme() {
  return useStore((s) => s.colorScheme);
}
