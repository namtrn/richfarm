import { YStack, Text, Button, Card } from 'tamagui';
import { Leaf, ArrowRight } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <YStack flex={1} justifyContent="center" alignItems="center" padding="$4" space="$6">
      {/* Logo */}
      <YStack alignItems="center" space="$4">
        <YStack
          width={120}
          height={120}
          backgroundColor="accent5"
          borderRadius={60}
          justifyContent="center"
          alignItems="center"
        >
          <Leaf size={60} color="white" />
        </YStack>
        
        <Text fontSize="$8" fontWeight="bold" color="accent10">
          My Garden
        </Text>
        
        <Text fontSize="$4" color="gray11" textAlign="center">
          Chăm sóc vườn cây của bạn{'\n'}một cách thông minh
        </Text>
      </YStack>

      {/* Features */}
      <YStack space="$3" width="100%" maxWidth={300}>
        <Card elevate bordered padding="$3">
          <Text fontSize="$3">🌱 Theo dõi cây trồng</Text>
        </Card>
        <Card elevate bordered padding="$3">
          <Text fontSize="$3">💧 Nhắc nhở tưới cây</Text>
        </Card>
        <Card elevate bordered padding="$3">
          <Text fontSize="$3">📅 Lịch trồng cây thông minh</Text>
        </Card>
      </YStack>

      {/* CTA Button */}
      <Button
        theme="accent"
        size="$5"
        iconAfter={ArrowRight}
        onPress={() => router.push('/(tabs)')}
        width="100%"
        maxWidth={300}
      >
        Bắt đầu
      </Button>
    </YStack>
  );
}
