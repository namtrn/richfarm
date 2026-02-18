import { Tabs } from 'expo-router';
import { Sprout, Calendar, Bell, BookOpen, Fence } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopColor: '#f3f4f6',
          backgroundColor: '#ffffff',
        },
      }}
    >
      <Tabs.Screen
        name="garden"
        options={{
          title: t('tabs.garden'),
          tabBarIcon: ({ color }) => <Fence size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: t('tabs.planning'),
          tabBarIcon: ({ color }) => <Calendar size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="growing"
        options={{
          title: t('tabs.growing'),
          tabBarIcon: ({ color }) => <Sprout size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="reminder"
        options={{
          title: t('tabs.reminder'),
          tabBarIcon: ({ color }) => <Bell size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color }) => <BookOpen size={24} stroke={color} />,
        }}
      />
    </Tabs>
  );
}
