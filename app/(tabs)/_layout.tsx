import { Tabs } from 'expo-router';
import { Sprout, Calendar, Bell, BookOpen, UserRound } from 'lucide-react-native';
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
        name="garden/index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="garden/[gardenId]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="plant"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: t('tabs.planning'),
          tabBarButtonTestID: 'e2e-tab-planning',
          tabBarIcon: ({ color }) => <Calendar size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="growing"
        options={{
          title: t('tabs.growing'),
          tabBarButtonTestID: 'e2e-tab-growing',
          tabBarIcon: ({ color }) => <Sprout size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="reminder"
        options={{
          title: t('tabs.reminder'),
          tabBarButtonTestID: 'e2e-tab-reminder',
          tabBarIcon: ({ color }) => <Bell size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarButtonTestID: 'e2e-tab-library',
          tabBarIcon: ({ color }) => <BookOpen size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarButtonTestID: 'e2e-tab-profile',
          tabBarIcon: ({ color }) => <UserRound size={24} stroke={color} />,
        }}
      />
    </Tabs>
  );
}
