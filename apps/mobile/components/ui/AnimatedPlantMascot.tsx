import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Easing,
  ImageStyle,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';

const botanicalMascot = require('../../assets/plant-mascot.png');

type AnimatedPlantMascotProps = {
  size?: number;
  onPress?: () => void;
  draggable?: boolean;
  dragBounds?: Partial<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export function AnimatedPlantMascot({
  size = 180,
  onPress,
  draggable = false,
  dragBounds,
  style,
  imageStyle,
  accessibilityLabel = 'Plant mascot',
}: AnimatedPlantMascotProps) {
  const breathing = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const drag = useRef(new Animated.ValueXY()).current;
  const dragPosition = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);

  useEffect(() => {
    const breathingLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    breathingLoop.start();
    return () => breathingLoop.stop();
  }, [breathing]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(pressScale, {
        toValue: 0.96,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(pressScale, {
        toValue: 1.04,
        friction: 5,
        tension: 110,
        useNativeDriver: true,
      }),
      Animated.spring(pressScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
    onPress?.();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => draggable,
        onStartShouldSetPanResponderCapture: () => draggable,
        onMoveShouldSetPanResponder: () => draggable,
        onMoveShouldSetPanResponderCapture: () => draggable,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStart.current = { ...dragPosition.current };
          dragMoved.current = false;
        },
        onPanResponderMove: (_, gesture) => {
          dragMoved.current = Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
          const nextPosition = {
            x: Math.min(
              dragBounds?.maxX ?? Number.POSITIVE_INFINITY,
              Math.max(dragBounds?.minX ?? Number.NEGATIVE_INFINITY, dragStart.current.x + gesture.dx)
            ),
            y: Math.min(
              dragBounds?.maxY ?? Number.POSITIVE_INFINITY,
              Math.max(dragBounds?.minY ?? Number.NEGATIVE_INFINITY, dragStart.current.y + gesture.dy)
            ),
          };
          dragPosition.current = nextPosition;
          drag.setValue(nextPosition);
        },
        onPanResponderRelease: () => {
          drag.setValue(dragPosition.current);
          if (!dragMoved.current) handlePress();
        },
        onPanResponderTerminate: () => {
          drag.setValue(dragPosition.current);
        },
      }),
    [drag, dragBounds?.maxX, dragBounds?.maxY, dragBounds?.minX, dragBounds?.minY, draggable]
  );

  const animatedStyle = {
    opacity: breathing.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }),
    transform: [
      {
        translateY: breathing.interpolate({ inputRange: [0, 1], outputRange: [1, -2] }),
      },
      {
        scale: Animated.multiply(
          breathing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] }),
          pressScale
        ),
      },
    ],
  };

  const mascotImage = (
    <Animated.Image
      source={botanicalMascot}
      resizeMode="contain"
      style={[{ width: size, height: size }, animatedStyle, imageStyle]}
    />
  );

  if (draggable) {
    return (
      <Animated.View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[{ width: size, height: size }, style, { transform: drag.getTranslateTransform() }]}
      >
        {mascotImage}
      </Animated.View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      style={[{ width: size, height: size }, style]}
    >
      {mascotImage}
    </Pressable>
  );
}
