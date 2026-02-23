import { Tabs } from 'expo-router';
import { Bell, BookOpen, UserRound, Home, Fence } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a4731',
        tabBarInactiveTintColor: '#a8a29e',
        tabBarStyle: {
          borderTopColor: '#e7e0d6',
          backgroundColor: '#ffffff',
        },
      }}
    >
      {/* Hidden routes */}
      <Tabs.Screen name="garden/[gardenId]" options={{ href: null }} />
      <Tabs.Screen name="bed/[bedId]" options={{ href: null }} />
      <Tabs.Screen name="plant" options={{ href: null }} />
      <Tabs.Screen name="planning" options={{ href: null }} />
      <Tabs.Screen name="growing" options={{ href: null }} />
      <Tabs.Screen name="health" options={{ href: null }} />
      <Tabs.Screen name="explorer" options={{ href: null }} />

      {/* Visible tabs — order: Home | Garden | Library | Reminder | More */}
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home', { defaultValue: 'Home' }),
          tabBarButtonTestID: 'e2e-tab-home',
          tabBarIcon: ({ color }) => <Home size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="garden/index"
        options={{
          title: t('tabs.garden'),
          tabBarButtonTestID: 'e2e-tab-garden',
          tabBarIcon: ({ color }) => <Fence size={24} stroke={color} />,
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
        name="reminder"
        options={{
          title: t('tabs.reminder'),
          tabBarButtonTestID: 'e2e-tab-reminder',
          tabBarIcon: ({ color }) => <Bell size={24} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.more', { defaultValue: 'More' }),
          tabBarButtonTestID: 'e2e-tab-more',
          tabBarIcon: ({ color }) => <UserRound size={24} stroke={color} />,
        }}
      />
    </Tabs>
  );
}
