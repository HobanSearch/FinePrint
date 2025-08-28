import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'

// Design system and components
import designSystem from '@/design-system'
import Button from '@/components/ui/Button'
import Card, { DocumentCard, PrivacyScoreBadge } from '@/components/ui/Card'
import { VirtualizedList } from '@/components/performance/VirtualizedList'

// Store hooks
import { useAuth, useAnalysis, useDocuments } from '@/stores'

// API
import { appApi } from '@/services/appApi'

// Types
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

const { width: screenWidth } = Dimensions.get('window')

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { user } = useAuth()
  const { recentAnalyses } = useAnalysis()
  const { recentDocuments } = useDocuments()

  // Fetch dashboard stats
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: appApi.getDashboardStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch top privacy scores
  const { data: topScores } = useQuery({
    queryKey: ['top-privacy-scores'],
    queryFn: () => appApi.getTopPrivacyScores({ limit: 5 }),
    staleTime: 30 * 60 * 1000, // 30 minutes
  })

  const handleUploadPress = () => {
    navigation.navigate('Main', { screen: 'Upload' })
  }

  const handleViewAnalysisPress = () => {
    navigation.navigate('Main', { screen: 'Analysis' })
  }

  const handleDocumentPress = (documentId: string) => {
    navigation.navigate('DocumentDetail', { documentId })
  }

  const handleAnalysisPress = (analysisId: string) => {
    navigation.navigate('AnalysisDetail', { analysisId })
  }

  const userName = user?.displayName || user?.email?.split('@')[0] || 'there'

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={designSystem.colors.brand.primary}
          />
        }
      >
        {/* Header */}
        <Animated.View 
          entering={FadeInDown.delay(100).springify()}
          style={styles.header}
        >
          <Text style={styles.greeting}>Hi {userName} 👋</Text>
          <Text style={styles.title}>Welcome to Fine Print AI</Text>
          <Text style={styles.subtitle}>
            Your AI-powered legal document analyzer
          </Text>
        </Animated.View>
        
        {/* Stats Cards */}
        <Animated.View 
          entering={FadeInDown.delay(200).springify()}
          style={styles.statsContainer}
        >
          <Card variant="elevated" style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.totalDocuments || 0}
            </Text>
            <Text style={styles.statLabel}>Documents Analyzed</Text>
          </Card>
          
          <Card variant="elevated" style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.criticalIssues || 0}
            </Text>
            <Text style={styles.statLabel}>Critical Issues</Text>
          </Card>
        </Animated.View>
        
        {/* Quick Actions */}
        <Animated.View 
          entering={FadeInDown.delay(300).springify()}
          style={styles.actionsContainer}
        >
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              onPress={handleUploadPress}
              icon={<Text style={styles.buttonIcon}>📄</Text>}
              fullWidth
              style={styles.actionButton}
            >
              Upload Document
            </Button>
            
            <Button
              variant="secondary"
              onPress={handleViewAnalysisPress}
              icon={<Text style={styles.buttonIcon}>📊</Text>}
              fullWidth
              style={styles.actionButton}
            >
              View All Analyses
            </Button>
          </View>
        </Animated.View>

        {/* Recent Documents */}
        {recentDocuments.length > 0 && (
          <Animated.View 
            entering={FadeInDown.delay(400).springify()}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Documents</Text>
              <Button
                variant="ghost"
                size="small"
                onPress={() => navigation.navigate('Main', { screen: 'Documents' })}
              >
                See All
              </Button>
            </View>
            
            {recentDocuments.slice(0, 3).map((doc, index) => (
              <DocumentCard
                key={doc.id}
                title={doc.name}
                subtitle={`Analyzed ${new Date(doc.analyzedAt || doc.uploadedAt).toLocaleDateString()}`}
                status={doc.status}
                privacyScore={doc.analysis?.overallScore}
                onPress={() => handleDocumentPress(doc.id)}
                style={{ marginBottom: index < 2 ? designSystem.spacing.sm : 0 }}
              />
            ))}
          </Animated.View>
        )}

        {/* Top Privacy Scores */}
        {topScores && topScores.length > 0 && (
          <Animated.View 
            entering={FadeInDown.delay(500).springify()}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Privacy Scores</Text>
              <Button
                variant="ghost"
                size="small"
                onPress={() => navigation.navigate('Main', { screen: 'PrivacyScores' })}
              >
                View All
              </Button>
            </View>
            
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scoresContainer}
            >
              {topScores.map((score, index) => (
                <Card
                  key={score.id}
                  variant="interactive"
                  style={[
                    styles.scoreCard,
                    index === topScores.length - 1 && { marginRight: 0 }
                  ]}
                  onPress={() => {
                    // Navigate to privacy score detail or open URL
                  }}
                >
                  <Text style={styles.scoreCompany} numberOfLines={1}>
                    {score.companyName}
                  </Text>
                  <PrivacyScoreBadge score={score.score} size="large" />
                  <Text style={styles.scoreCategory}>{score.category}</Text>
                </Card>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Empty State */}
        {!recentDocuments.length && !stats?.totalDocuments && (
          <Animated.View 
            entering={FadeInUp.delay(400).springify()}
            style={styles.emptyState}
          >
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload your first document to start analyzing
            </Text>
            <Button
              variant="primary"
              onPress={handleUploadPress}
              style={{ marginTop: designSystem.spacing.lg }}
            >
              Upload First Document
            </Button>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: designSystem.colors.gray[50],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: designSystem.spacing.xl,
  },
  
  // Header
  header: {
    padding: designSystem.spacing.screenPadding,
    paddingTop: designSystem.spacing.lg,
    paddingBottom: designSystem.spacing.md,
  },
  greeting: {
    ...designSystem.typography.body.large,
    color: designSystem.colors.gray[600],
    marginBottom: designSystem.spacing.xs,
  },
  title: {
    ...designSystem.typography.display.small,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xs,
  },
  subtitle: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[600],
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.lg,
    gap: designSystem.spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: designSystem.spacing.lg,
  },
  statNumber: {
    ...designSystem.typography.display.medium,
    color: designSystem.colors.brand.primary,
    marginBottom: designSystem.spacing.xxs,
  },
  statLabel: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
  },
  
  // Actions
  actionsContainer: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.xl,
  },
  actionButtons: {
    gap: designSystem.spacing.sm,
  },
  actionButton: {
    marginBottom: 0,
  },
  buttonIcon: {
    fontSize: 20,
  },
  
  // Sections
  section: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: designSystem.spacing.md,
  },
  sectionTitle: {
    ...designSystem.typography.heading.h2,
    color: designSystem.colors.gray[900],
  },
  
  // Privacy Scores
  scoresContainer: {
    paddingRight: designSystem.spacing.screenPadding,
  },
  scoreCard: {
    width: screenWidth * 0.4,
    marginRight: designSystem.spacing.sm,
  },
  scoreCompany: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.sm,
  },
  scoreCategory: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
    marginTop: designSystem.spacing.xs,
  },
  
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: designSystem.spacing.xl,
    paddingVertical: designSystem.spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: designSystem.spacing.lg,
  },
  emptyTitle: {
    ...designSystem.typography.heading.h2,
    color: designSystem.colors.gray[900],
    textAlign: 'center',
    marginBottom: designSystem.spacing.sm,
  },
  emptySubtitle: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
    marginBottom: designSystem.spacing.xl,
  },
})