import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import * as H from '../../src/utils/haptics';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 0.5,
          height: 82,
          paddingTop: 10,
          paddingBottom: 22,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Read',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name={focused ? 'bookmark' : 'bookmark-border'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: H.tick }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name="edit"
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: H.tick }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name={focused ? 'settings' : 'settings'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: H.tick }}
      />
    </Tabs>
  );
}
