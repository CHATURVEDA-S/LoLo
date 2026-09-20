import React from 'react';
import { StyleSheet, View, Image, ImageStyle, StyleProp, ViewStyle } from 'react-native';

interface AppLogoProps {
  size?: number; // base height in dp
  width?: number;
  height?: number;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ImageStyle>;
}

export default function AppLogo({ size = 56, width, height, containerStyle, style }: AppLogoProps) {
  // The cropped transparent logo image has aspect ratio 925 : 429 ≈ 2.156 : 1
  const logoHeight = height ?? size;
  const logoWidth = width ?? Math.round(logoHeight * 2.156);

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={require('@/assets/images/logo.png')}
        style={[{ width: logoWidth, height: logoHeight, resizeMode: 'contain' }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
