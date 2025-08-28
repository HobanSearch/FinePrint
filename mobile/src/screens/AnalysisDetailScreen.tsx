import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

// Design system and components
import designSystem from '@/design-system'
import Button from '@/components/ui/Button'
import Card, { PrivacyScoreBadge } from '@/components/ui/Card'

// Services and stores
import { appApi } from '@/services/appApi'
import { useAnalysis } from '@/stores'

// Types
import type { RouteProp } from '@react-navigation/core'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList, Pattern, Recommendation } from '@/types'

const { width: screenWidth } = Dimensions.get('window')

type RouteProps = RouteProp<RootStackParamList, 'AnalysisDetail'>
type NavigationProp = NativeStackNavigationProp<RootStackParamList>

interface TabOption {
  id: 'overview' | 'patterns' | 'recommendations'
  label: string
  icon: string
}

const tabs: TabOption[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'patterns', label: 'Issues', icon: '⚠️' },
  { id: 'recommendations', label: 'Actions', icon: '✅' },
]

export default function AnalysisDetailScreen() {
  const route = useRoute<RouteProps>()
  const navigation = useNavigation<NavigationProp>()
  const { analysisId } = route.params
  const { setCurrentAnalysis } = useAnalysis()
  const [activeTab, setActiveTab] = useState<TabOption['id']>('overview')

  // Fetch analysis details
  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => appApi.getAnalysis(analysisId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  useEffect(() => {
    if (analysis) {
      setCurrentAnalysis(analysis)
    }
  }, [analysis, setCurrentAnalysis])

  const handleShare = async () => {
    if (!analysis) return

    try {
      const message = `Fine Print AI Analysis Results

Document: ${analysis.documentName}
Privacy Score: ${analysis.overallScore}/100
Risk Level: ${analysis.riskLevel.toUpperCase()}

Key Findings:
${analysis.patterns.slice(0, 3).map(p => `• ${p.title}`).join('\n')}

View full analysis in the Fine Print AI app.`

      await Share.share({
        message,
        title: 'Analysis Results',
      })
    } catch (error) {
      console.error('Share failed:', error)
    }
  }

  const handleExport = () => {
    Alert.alert(
      'Export Analysis',
      'Choose export format',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'PDF Report', onPress: () => exportAsPDF() },
        { text: 'Text Summary', onPress: () => exportAsText() },
      ]
    )
  }

  const exportAsPDF = async () => {
    try {
      // TODO: Implement PDF export
      Alert.alert('Coming Soon', 'PDF export will be available in the next update')
    } catch (error) {
      Alert.alert('Export Failed', 'Failed to export as PDF')
    }
  }

  const exportAsText = async () => {
    if (!analysis) return

    const text = `Fine Print AI Analysis Report
Generated: ${new Date().toLocaleDateString()}

Document: ${analysis.documentName}
Analysis Date: ${new Date(analysis.completedAt).toLocaleDateString()}

Overall Privacy Score: ${analysis.overallScore}/100
Risk Level: ${analysis.riskLevel.toUpperCase()}

Summary:
${analysis.summary}

Problematic Patterns Found (${analysis.patterns.length}):
${analysis.patterns.map((p, i) => `
${i + 1}. ${p.title}
   Severity: ${p.severity.toUpperCase()}
   ${p.description}
   ${p.quote ? `Quote: "${p.quote}"` : ''}
`).join('\n')}

Recommendations (${analysis.recommendations.length}):
${analysis.recommendations.map((r, i) => `
${i + 1}. ${r.title}
   Priority: ${r.priority.toUpperCase()}
   ${r.description}
   Action: ${r.action}
`).join('\n')}

---
Analysis powered by Fine Print AI
`

    try {
      await Share.share({
        message: text,
        title: `${analysis.documentName} - Analysis Report`,
      })
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return designSystem.colors.semantic.danger
      case 'high':
        return designSystem.colors.semantic.warning
      case 'medium':
        return designSystem.colors.brand.secondary
      case 'low':
        return designSystem.colors.semantic.info
      default:
        return designSystem.colors.gray[600]
    }
  }

  const renderOverview = () => {
    if (!analysis) return null

    return (
      <Animated.View entering={FadeInUp.springify()}>
        {/* Score Card */}
        <Card variant="elevated" style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Privacy Score</Text>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreValue}>{analysis.overallScore}</Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <PrivacyScoreBadge score={analysis.overallScore} size="large" />
        </Card>

        {/* Summary */}
        <Card variant="default" style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{analysis.summary}</Text>
        </Card>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <Card variant="outlined" style={styles.statCard}>
            <Text style={styles.statValue}>{analysis.patterns.length}</Text>
            <Text style={styles.statLabel}>Issues Found</Text>
          </Card>
          <Card variant="outlined" style={styles.statCard}>
            <Text style={[styles.statValue, { color: getSeverityColor(analysis.riskLevel) }]}>
              {analysis.riskLevel.toUpperCase()}
            </Text>
            <Text style={styles.statLabel}>Risk Level</Text>
          </Card>
        </View>

        {/* Metadata */}
        <Card variant="outlined" style={styles.metadataCard}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Document Type</Text>
            <Text style={styles.metadataValue}>{analysis.metadata.documentType}</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Processing Time</Text>
            <Text style={styles.metadataValue}>{analysis.metadata.processingTime}ms</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>AI Model</Text>
            <Text style={styles.metadataValue}>{analysis.metadata.modelUsed}</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Confidence</Text>
            <Text style={styles.metadataValue}>{Math.round(analysis.metadata.confidence * 100)}%</Text>
          </View>
        </Card>
      </Animated.View>
    )
  }

  const renderPatterns = () => {
    if (!analysis) return null

    const groupedPatterns = analysis.patterns.reduce((acc, pattern) => {
      if (!acc[pattern.severity]) {
        acc[pattern.severity] = []
      }
      acc[pattern.severity].push(pattern)
      return acc
    }, {} as Record<string, Pattern[]>)

    const severityOrder = ['critical', 'high', 'medium', 'low']

    return (
      <Animated.View entering={FadeInUp.springify()}>
        {severityOrder.map((severity) => {
          const patterns = groupedPatterns[severity]
          if (!patterns || patterns.length === 0) return null

          return (
            <View key={severity} style={styles.patternGroup}>
              <View style={styles.patternGroupHeader}>
                <View style={[styles.severityIndicator, { backgroundColor: getSeverityColor(severity) }]} />
                <Text style={styles.patternGroupTitle}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)} ({patterns.length})
                </Text>
              </View>

              {patterns.map((pattern, index) => (
                <Card
                  key={pattern.id}
                  variant="interactive"
                  style={[styles.patternCard, index === patterns.length - 1 && { marginBottom: 0 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    Alert.alert(
                      pattern.title,
                      `${pattern.explanation}\n\n${pattern.quote ? `"${pattern.quote}"` : ''}`,
                      [{ text: 'OK' }]
                    )
                  }}
                >
                  <Text style={styles.patternTitle}>{pattern.title}</Text>
                  <Text style={styles.patternDescription} numberOfLines={2}>
                    {pattern.description}
                  </Text>
                  {pattern.location && (
                    <Text style={styles.patternLocation}>
                      {pattern.location.section} • Paragraph {pattern.location.paragraph}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          )
        })}
      </Animated.View>
    )
  }

  const renderRecommendations = () => {
    if (!analysis) return null

    const groupedRecs = analysis.recommendations.reduce((acc, rec) => {
      if (!acc[rec.priority]) {
        acc[rec.priority] = []
      }
      acc[rec.priority].push(rec)
      return acc
    }, {} as Record<string, Recommendation[]>)

    const priorityOrder = ['high', 'medium', 'low']

    return (
      <Animated.View entering={FadeInUp.springify()}>
        {priorityOrder.map((priority) => {
          const recs = groupedRecs[priority]
          if (!recs || recs.length === 0) return null

          return (
            <View key={priority} style={styles.recommendationGroup}>
              <Text style={styles.recommendationGroupTitle}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
              </Text>

              {recs.map((rec, index) => (
                <Card
                  key={rec.id}
                  variant="outlined"
                  style={[styles.recommendationCard, index === recs.length - 1 && { marginBottom: 0 }]}
                >
                  <Text style={styles.recommendationTitle}>✓ {rec.title}</Text>
                  <Text style={styles.recommendationDescription}>{rec.description}</Text>
                  <View style={styles.recommendationAction}>
                    <Text style={styles.recommendationActionLabel}>Action:</Text>
                    <Text style={styles.recommendationActionText}>{rec.action}</Text>
                  </View>
                </Card>
              ))}
            </View>
          )
        })}
      </Animated.View>
    )
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Analyzing document...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || !analysis) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={styles.errorText}>
            {error?.message || 'Failed to load analysis results'}
          </Text>
          <Button
            variant="primary"
            onPress={() => navigation.goBack()}
            style={{ marginTop: designSystem.spacing.lg }}
          >
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.documentName} numberOfLines={1}>
          {analysis.documentName}
        </Text>
        <Text style={styles.analysisDate}>
          Analyzed {new Date(analysis.completedAt).toLocaleDateString()}
        </Text>
        
        <View style={styles.headerActions}>
          <Button variant="ghost" size="small" onPress={handleShare}>
            Share
          </Button>
          <Button variant="ghost" size="small" onPress={handleExport}>
            Export
          </Button>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab.id)
              Haptics.selectionAsync()
            }}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'patterns' && renderPatterns()}
        {activeTab === 'recommendations' && renderRecommendations()}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: designSystem.colors.gray[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...designSystem.typography.body.large,
    color: designSystem.colors.gray[600],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: designSystem.spacing.xl,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: designSystem.spacing.lg,
  },
  errorTitle: {
    ...designSystem.typography.heading.h2,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.sm,
  },
  errorText: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
    marginBottom: designSystem.spacing.xl,
  },
  header: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    paddingTop: designSystem.spacing.md,
    paddingBottom: designSystem.spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: designSystem.colors.gray[200],
  },
  documentName: {
    ...designSystem.typography.heading.h2,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xxs,
  },
  analysisDate: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[600],
    marginBottom: designSystem.spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: designSystem.spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: designSystem.spacing.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: designSystem.colors.gray[200],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: designSystem.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: designSystem.colors.brand.primary,
  },
  tabIcon: {
    fontSize: 16,
    marginRight: designSystem.spacing.xxs,
  },
  tabLabel: {
    ...designSystem.typography.label.medium,
    color: designSystem.colors.gray[600],
  },
  activeTabLabel: {
    color: designSystem.colors.brand.primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: designSystem.spacing.screenPadding,
    paddingBottom: designSystem.spacing.xl,
  },
  
  // Overview styles
  scoreCard: {
    alignItems: 'center',
    paddingVertical: designSystem.spacing.xl,
    marginBottom: designSystem.spacing.lg,
  },
  scoreLabel: {
    ...designSystem.typography.label.large,
    color: designSystem.colors.gray[600],
    marginBottom: designSystem.spacing.sm,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: designSystem.spacing.md,
  },
  scoreValue: {
    ...designSystem.typography.display.large,
    color: designSystem.colors.brand.primary,
    fontWeight: '700',
  },
  scoreMax: {
    ...designSystem.typography.heading.h2,
    color: designSystem.colors.gray[500],
    marginLeft: designSystem.spacing.xxs,
  },
  summaryCard: {
    marginBottom: designSystem.spacing.lg,
  },
  sectionTitle: {
    ...designSystem.typography.heading.h3,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.sm,
  },
  summaryText: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[700],
    lineHeight: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: designSystem.spacing.sm,
    marginBottom: designSystem.spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: designSystem.spacing.lg,
  },
  statValue: {
    ...designSystem.typography.heading.h1,
    color: designSystem.colors.brand.primary,
    marginBottom: designSystem.spacing.xxs,
  },
  statLabel: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
  },
  metadataCard: {
    padding: designSystem.spacing.md,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: designSystem.spacing.xs,
  },
  metadataLabel: {
    ...designSystem.typography.label.medium,
    color: designSystem.colors.gray[600],
  },
  metadataValue: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[900],
  },
  
  // Patterns styles
  patternGroup: {
    marginBottom: designSystem.spacing.xl,
  },
  patternGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: designSystem.spacing.sm,
  },
  severityIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: designSystem.spacing.sm,
  },
  patternGroupTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
  },
  patternCard: {
    marginBottom: designSystem.spacing.sm,
  },
  patternTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xxs,
  },
  patternDescription: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[700],
    marginBottom: designSystem.spacing.xs,
  },
  patternLocation: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[500],
  },
  
  // Recommendations styles
  recommendationGroup: {
    marginBottom: designSystem.spacing.xl,
  },
  recommendationGroupTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.sm,
  },
  recommendationCard: {
    marginBottom: designSystem.spacing.sm,
  },
  recommendationTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.semantic.success,
    marginBottom: designSystem.spacing.xs,
  },
  recommendationDescription: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[700],
    marginBottom: designSystem.spacing.sm,
  },
  recommendationAction: {
    backgroundColor: designSystem.colors.gray[50],
    padding: designSystem.spacing.sm,
    borderRadius: designSystem.borderRadius.base,
  },
  recommendationActionLabel: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
    marginBottom: designSystem.spacing.xxs,
  },
  recommendationActionText: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[900],
    fontWeight: '500',
  },
})