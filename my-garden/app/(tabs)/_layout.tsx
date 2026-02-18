import { Tabs } from 'expo-router';
import { Sprout, Calendar, Bell } from '@tamagui/lucide-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#22c55e',
      }}
    >
      <Tabs.Screen
        name="planning"
        options={{
          title: 'Planning',
          tabBarIcon: ({ color }) => <Calendar size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="growing"
        options={{
          title: 'Growing',
          tabBarIcon: ({ color }) => <Sprout size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reminder"
        options={{
          title: 'Reminder',
          tabBarIcon: ({ color }) => <Bell size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
