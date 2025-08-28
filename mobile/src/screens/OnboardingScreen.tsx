import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolate,
  FadeIn,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

// Design system and components
import designSystem from '@/design-system'
import Button from '@/components/ui/Button'

// Types
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

interface OnboardingSlide {
  id: string
  icon: string
  title: string
  subtitle: string
  description: string
  backgroundColor: string
}

const slides: OnboardingSlide[] = [
  {
    id: '1',
    icon: '🔍',
    title: 'Analyze Legal Documents',
    subtitle: 'AI-Powered Intelligence',
    description: 'Upload any Terms of Service, Privacy Policy, or EULA and get instant AI analysis of problematic clauses.',
    backgroundColor: designSystem.colors.brand.primary,
  },
  {
    id: '2',
    icon: '🛡️',
    title: 'Privacy-First Design',
    subtitle: 'Your Data Stays Private',
    description: 'All document analysis happens locally on your device. We never store or transmit your sensitive documents.',
    backgroundColor: designSystem.colors.brand.secondary,
  },
  {
    id: '3',
    icon: '⚡',
    title: 'Instant Insights',
    subtitle: 'Understand in Seconds',
    description: 'Get clear, actionable recommendations about hidden fees, data sharing, and legal rights waivers.',
    backgroundColor: designSystem.colors.semantic.success,
  },
  {
    id: '4',
    icon: '📊',
    title: 'Privacy Scores',
    subtitle: 'Top 50 Sites Analyzed',
    description: 'Access pre-analyzed privacy scores for the most popular websites and services.',
    backgroundColor: designSystem.colors.semantic.info,
  },
]

export default function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp>()
  const scrollViewRef = useRef<ScrollView>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollX = useSharedValue(0)

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x
    scrollX.value = offsetX
    const index = Math.round(offsetX / screenWidth)
    if (index !== currentIndex) {
      setCurrentIndex(index)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1
      scrollViewRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: true,
      })
      setCurrentIndex(nextIndex)
    }
  }

  const handleSkip = () => {
    navigation.replace('Auth')
  }

  const handleGetStarted = () => {
    navigation.replace('Auth')
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      >
        {slides.map((slide, index) => (
          <View
            key={slide.id}
            style={[
              styles.slide,
              { backgroundColor: slide.backgroundColor + '15' },
            ]}
          >
            <SafeAreaView style={styles.slideContent}>
              <Animated.View
                entering={FadeIn.delay(index * 100).springify()}
                style={styles.slideHeader}
              >
                <Text style={styles.icon}>{slide.icon}</Text>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.subtitle}>{slide.subtitle}</Text>
              </Animated.View>
              
              <Animated.Text
                entering={FadeIn.delay(index * 100 + 200).springify()}
                style={styles.description}
              >
                {slide.description}
              </Animated.Text>
            </SafeAreaView>
          </View>
        ))}
      </ScrollView>

      <SafeAreaView style={styles.footer} edges={['bottom']}>
        <View style={styles.pagination}>
          {slides.map((_, index) => {
            const animatedDotStyle = useAnimatedStyle(() => {
              const inputRange = [
                (index - 1) * screenWidth,
                index * screenWidth,
                (index + 1) * screenWidth,
              ]

              const width = interpolate(
                scrollX.value,
                inputRange,
                [8, 24, 8],
                Extrapolate.CLAMP
              )

              const opacity = interpolate(
                scrollX.value,
                inputRange,
                [0.3, 1, 0.3],
                Extrapolate.CLAMP
              )

              return {
                width,
                opacity,
              }
            })

            return (
              <Animated.View
                key={index}
                style={[
                  styles.paginationDot,
                  animatedDotStyle,
                  {
                    backgroundColor: slides[currentIndex].backgroundColor,
                  },
                ]}
              />
            )
          })}
        </View>

        <View style={styles.buttons}>
          {currentIndex < slides.length - 1 ? (
            <>
              <Button
                variant="ghost"
                onPress={handleSkip}
                style={styles.skipButton}
              >
                Skip
              </Button>
              <Button
                variant="primary"
                onPress={handleNext}
                style={[
                  styles.nextButton,
                  { backgroundColor: slides[currentIndex].backgroundColor },
                ]}
              >
                Next
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onPress={handleGetStarted}
              fullWidth
              style={[
                styles.getStartedButton,
                { backgroundColor: slides[currentIndex].backgroundColor },
              ]}
            >
              Get Started
            </Button>
          )}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  slide: {
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
  },
  slideContent: {
    flex: 1,
    paddingHorizontal: designSystem.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideHeader: {
    alignItems: 'center',
    marginBottom: designSystem.spacing.xl,
  },
  icon: {
    fontSize: 80,
    marginBottom: designSystem.spacing.xl,
  },
  title: {
    ...designSystem.typography.display.medium,
    color: designSystem.colors.gray[900],
    textAlign: 'center',
    marginBottom: designSystem.spacing.sm,
  },
  subtitle: {
    ...designSystem.typography.heading.h3,
    color: designSystem.colors.gray[700],
    textAlign: 'center',
  },
  description: {
    ...designSystem.typography.body.large,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: designSystem.spacing.lg,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: designSystem.spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 0 : designSystem.spacing.lg,
    backgroundColor: 'transparent',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: designSystem.spacing.xl,
    gap: designSystem.spacing.xs,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: designSystem.colors.gray[400],
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
    marginLeft: designSystem.spacing.md,
  },
  getStartedButton: {
    flex: 1,
  },
})