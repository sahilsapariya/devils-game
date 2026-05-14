/**
 * AnimatedValue — renders a numeric value that fades briefly when changed.
 * Subtle by design: no springs, no bouncy animation.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, TextStyle } from 'react-native';

interface Props {
  value: string | number;
  style?: StyleProp<TextStyle>;
}

export function AnimatedValue({ value, style }: Props): React.ReactElement {
  const opacity = useRef(new Animated.Value(1)).current;
  const previous = useRef<string | number>(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.25,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value, opacity]);

  return (
    <Animated.Text style={[style, { opacity }]}>{String(value)}</Animated.Text>
  );
}
