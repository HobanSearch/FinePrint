import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors, typography, spacing } from '@/constants/theme'
import type { AppSearchResult, AppMetadata } from '@/services/appApi'
import { searchApps, getAppMetadata, analyzeApp } from '@/services/appApi'

interface AppSearchScreenProps {
  navigation: any
}

export default function AppSearchScreen({ navigation }: AppSearchScreenProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AppSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<'both' | 'ios' | 'android'>('both')
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery.trim())
      } else {
        setSearchResults([])
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, selectedPlatform])

  const performSearch = async (query: string) => {
    setIsSearching(true)
    try {
      const platform = selectedPlatform === 'both' ? undefined : selectedPlatform
      const response = await searchApps(query, platform, 20)
      
      if (response.success) {
        setSearchResults(response.data)
        
        // Add to recent searches
        setRecentSearches(prev => {
          const updated = [query, ...prev.filter(item => item !== query)].slice(0, 5)
          return updated
        })
      }
    } catch (error) {
      console.error('Search failed:', error)
      Alert.alert('Search Error', 'Failed to search for apps. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleAppSelect = async (app: AppSearchResult) => {
    try {
      // Get detailed app metadata
      const response = await getAppMetadata(app.id, app.platform)
      
      if (response.success) {
        navigation.navigate('AppDetail', { 
          app: response.data,
          fromSearch: true 
        })
      } else {
        Alert.alert('Error', 'Failed to load app details')
      }
    } catch (error) {
      console.error('Failed to get app details:', error)
      Alert.alert('Error', 'Failed to load app details')
    }
  }

  const handleQuickAnalyze = async (app: AppSearchResult) => {
    Alert.alert(
      'Analyze App',
      `Analyze ${app.name} for privacy and terms risks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Analyze',
          onPress: async () => {
            try {
              const response = await analyzeApp(app.id, app.platform)
              
              if (response.success) {
                navigation.navigate('AnalysisProgress', {
                  analysisId: response.data.analysisId,
                  appInfo: {
                    name: app.name,
                    developer: app.developer,
                    platform: app.platform,
                    icon_url: app.icon_url
                  }
                })
              } else {
                Alert.alert('Error', 'Failed to start analysis')
              }
            } catch (error) {
              console.error('Analysis failed:', error)
              Alert.alert('Error', 'Failed to start analysis')
            }
          }
        }
      ]
    )
  }

  const renderPlatformSelector = () => (
    <View style={styles.platformSelector}>
      <TouchableOpacity
        style={[
          styles.platformButton,
          selectedPlatform === 'both' && styles.platformButtonActive
        ]}
        onPress={() => setSelectedPlatform('both')}
      >
        <Text style={[
          styles.platformButtonText,
          selectedPlatform === 'both' && styles.platformButtonTextActive
        ]}>
          Both
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.platformButton,
          selectedPlatform === 'ios' && styles.platformButtonActive
        ]}
        onPress={() => setSelectedPlatform('ios')}
      >
        <Ionicons 
          name="logo-apple" 
          size={16} 
          color={selectedPlatform === 'ios' ? colors.white : colors.gray[600]} 
          style={{ marginRight: 4 }}
        />
        <Text style={[
          styles.platformButtonText,
          selectedPlatform === 'ios' && styles.platformButtonTextActive
        ]}>
          iOS
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.platformButton,
          selectedPlatform === 'android' && styles.platformButtonActive
        ]}
        onPress={() => setSelectedPlatform('android')}
      >
        <Ionicons 
          name="logo-google-playstore" 
          size={16} 
          color={selectedPlatform === 'android' ? colors.white : colors.gray[600]} 
          style={{ marginRight: 4 }}
        />
        <Text style={[
          styles.platformButtonText,
          selectedPlatform === 'android' && styles.platformButtonTextActive
        ]}>
          Android
        </Text>
      </TouchableOpacity>
    </View>
  )

  const renderAppItem = ({ item }: { item: AppSearchResult }) => (
    <TouchableOpacity
      style={styles.appItem}
      onPress={() => handleAppSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.appItemContent}>
        <Image 
          source={{ uri: item.icon_url || 'https://via.placeholder.com/60' }}
          style={styles.appIcon}
          defaultSource={require('@/assets/images/app-placeholder.png')}
        />
        
        <View style={styles.appInfo}>
          <Text style={styles.appName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.appDeveloper} numberOfLines={1}>
            {item.developer}
          </Text>
          <View style={styles.appMeta}>
            <View style={styles.platformBadge}>
              <Ionicons 
                name={item.platform === 'ios' ? 'logo-apple' : 'logo-google-playstore'}
                size={12}
                color={colors.gray[600]}
              />
              <Text style={styles.platformText}>
                {item.platform === 'ios' ? 'iOS' : 'Android'}
              </Text>
            </View>
            
            {item.rating > 0 && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={12} color={colors.yellow[500]} />
                <Text style={styles.ratingText}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            )}
            
            {item.price > 0 && (
              <Text style={styles.priceText}>
                ${item.price.toFixed(2)}
              </Text>
            )}
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.analyzeButton}
          onPress={() => handleQuickAnalyze(item)}
        >
          <Ionicons name="shield-checkmark" size={20} color={colors.blue[600]} />
          <Text style={styles.analyzeButtonText}>Analyze</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  const renderRecentSearches = () => {
    if (recentSearches.length === 0) return null

    return (
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Searches</Text>
        <View style={styles.recentSearches}>
          {recentSearches.map((search, index) => (
            <TouchableOpacity
              key={index}
              style={styles.recentSearchItem}
              onPress={() => setSearchQuery(search)}
            >
              <Ionicons name="time-outline" size={16} color={colors.gray[500]} />
              <Text style={styles.recentSearchText}>{search}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={64} color={colors.gray[400]} />
      <Text style={styles.emptyStateTitle}>
        {searchQuery.trim().length < 2 
          ? 'Search for Apps' 
          : 'No apps found'
        }
      </Text>
      <Text style={styles.emptyStateSubtitle}>
        {searchQuery.trim().length < 2
          ? 'Enter an app name to get started with privacy analysis'
          : 'Try a different search term or check your spelling'
        }
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.gray[700]} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>App Analysis</Text>
        
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="help-circle-outline" size={24} color={colors.gray[700]} />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={colors.gray[500]} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for an app..."
            placeholderTextColor={colors.gray[500]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery('')}
            >
              <Ionicons name="close-circle" size={20} color={colors.gray[500]} />
            </TouchableOpacity>
          )}
        </View>
        
        {renderPlatformSelector()}
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        {isSearching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.blue[600]} />
            <Text style={styles.loadingText}>Searching apps...</Text>
          </View>
        )}

        {!isSearching && searchResults.length > 0 && (
          <FlatList
            data={searchResults}
            renderItem={renderAppItem}
            keyExtractor={(item) => `${item.platform}-${item.id}`}
            showsVerticalScrollIndicator={false}
            style={styles.resultsList}
          />
        )}

        {!isSearching && searchResults.length === 0 && searchQuery.trim().length === 0 && renderRecentSearches()}

        {!isSearching && searchResults.length === 0 && searchQuery.trim().length >= 2 && renderEmptyState()}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
  },
  headerAction: {
    padding: spacing.xs,
  },
  searchContainer: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: typography.fontSize.base,
    color: colors.gray[900],
  },
  clearButton: {
    padding: spacing.xs,
  },
  platformSelector: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 2,
  },
  platformButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  platformButtonActive: {
    backgroundColor: colors.blue[600],
  },
  platformButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    color: colors.gray[600],
  },
  platformButtonTextActive: {
    color: colors.white,
  },
  resultsContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
  },
  resultsList: {
    flex: 1,
  },
  appItem: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  appItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  appIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: spacing.md,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: 2,
  },
  appDeveloper: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    marginBottom: spacing.xs,
  },
  appMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  platformText: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[600],
    marginLeft: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  ratingText: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[600],
    marginLeft: 2,
  },
  priceText: {
    fontSize: typography.fontSize.xs,
    color: colors.green[600],
    fontWeight: '500',
  },
  analyzeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.blue[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue[200],
  },
  analyzeButtonText: {
    fontSize: typography.fontSize.xs,
    color: colors.blue[600],
    fontWeight: '500',
    marginTop: 2,
  },
  recentSection: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: spacing.sm,
  },
  recentSearches: {
    gap: spacing.xs,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  recentSearchText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
    marginLeft: spacing.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyStateTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyStateSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
  },
})