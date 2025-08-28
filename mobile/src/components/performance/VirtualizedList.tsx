/**
 * Virtualized List Component
 * High-performance list with virtualization for large datasets
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  FlatList,
  VirtualizedList,
  View,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Text,
  Dimensions,
  ViewToken,
  ListRenderItem,
  ViewStyle,
} from 'react-native';
import { logger } from '../../utils/logger';
import { performanceMonitor } from '../../utils/performance';
import { theme } from '../../constants/theme';

const { height: screenHeight } = Dimensions.get('window');

export interface VirtualizedListItem {
  id: string;
  data: any;
  height?: number;
}

export interface VirtualizedListProps<T extends VirtualizedListItem> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor?: (item: T, index: number) => string;
  estimatedItemSize?: number;
  windowSize?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  initialNumToRender?: number;
  removeClippedSubviews?: boolean;
  getItemLayout?: (data: T[] | null | undefined, index: number) => { length: number; offset: number; index: number };
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  emptyComponent?: React.ReactNode;
  headerComponent?: React.ReactNode;
  footerComponent?: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  showsVerticalScrollIndicator?: boolean;
  enablePullToRefresh?: boolean;
  enableInfiniteScroll?: boolean;
  enableViewabilityTracking?: boolean;
  viewabilityConfig?: {
    itemVisiblePercentThreshold?: number;
    minimumViewTime?: number;
  };
  onViewableItemsChanged?: (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => void;
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
  };
  testID?: string;
}

export function VirtualizedList<T extends VirtualizedListItem>({
  data,
  renderItem,
  keyExtractor = (item) => item.id,
  estimatedItemSize = 100,
  windowSize = 10,
  maxToRenderPerBatch = 10,
  updateCellsBatchingPeriod = 50,
  initialNumToRender = 10,
  removeClippedSubviews = true,
  getItemLayout,
  onEndReached,
  onEndReachedThreshold = 0.5,
  onRefresh,
  refreshing = false,
  loading = false,
  loadingMore = false,
  error = null,
  emptyComponent,
  headerComponent,
  footerComponent,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = true,
  enablePullToRefresh = true,
  enableInfiniteScroll = true,
  enableViewabilityTracking = true,
  viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 250,
  },
  onViewableItemsChanged,
  maintainVisibleContentPosition,
  testID,
}: VirtualizedListProps<T>) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollMetrics, setScrollMetrics] = useState({
    offset: 0,
    contentHeight: 0,
    visibleLength: 0,
  });

  const flatListRef = useRef<FlatList<T>>(null);
  const scrollTimer = useRef<NodeJS.Timeout | null>(null);
  const performanceTimer = useRef<string | null>(null);

  // Performance monitoring
  useEffect(() => {
    if (data.length > 0 && !performanceTimer.current) {
      performanceTimer.current = `list_render_${data.length}_items`;
      performanceMonitor.startTimer(performanceTimer.current);
    }

    return () => {
      if (performanceTimer.current) {
        performanceMonitor.endTimer(performanceTimer.current);
        performanceTimer.current = null;
      }
    };
  }, [data.length]);

  // Optimized item layout calculation
  const optimizedGetItemLayout = useMemo(() => {
    if (getItemLayout) {
      return getItemLayout;
    }

    // Dynamic item layout based on actual heights if available
    return (data: T[] | null | undefined, index: number) => {
      const item = data?.[index];
      const height = item?.height || estimatedItemSize;
      const offset = index * estimatedItemSize; // Simplified - could be more accurate
      
      return {
        length: height,
        offset,
        index,
      };
    };
  }, [getItemLayout, estimatedItemSize]);

  // Handle scroll events with throttling
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    
    setScrollMetrics({
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      visibleLength: layoutMeasurement.height,
    });

    if (!isScrolling) {
      setIsScrolling(true);
    }

    // Clear existing timer
    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
    }

    // Set new timer to detect scroll end
    scrollTimer.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, [isScrolling]);

  // Enhanced viewability tracking
  const handleViewableItemsChanged = useCallback((info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
    if (enableViewabilityTracking) {
      // Track viewable items for analytics
      const viewableIds = info.viewableItems.map(item => item.key);
      logger.debug('Viewable items changed:', viewableIds);
      
      // Record viewability metrics
      performanceMonitor.recordMetric('list_viewable_items', info.viewableItems.length);
    }

    onViewableItemsChanged?.(info);
  }, [enableViewabilityTracking, onViewableItemsChanged]);

  // Enhanced end reached handler
  const handleEndReached = useCallback(() => {
    if (!loadingMore && enableInfiniteScroll) {
      logger.debug('List end reached, loading more items');
      performanceMonitor.recordMetric('list_end_reached', 1);
      onEndReached?.();
    }
  }, [loadingMore, enableInfiniteScroll, onEndReached]);

  // Optimized refresh handler
  const handleRefresh = useCallback(() => {
    if (enablePullToRefresh && !refreshing) {
      logger.debug('List refresh triggered');
      performanceMonitor.recordMetric('list_refresh', 1);
      onRefresh?.();
    }
  }, [enablePullToRefresh, refreshing, onRefresh]);

  // Memory management - enhanced render item
  const enhancedRenderItem = useCallback<ListRenderItem<T>>(({ item, index }) => {
    const isVisible = !isScrolling || (
      index * estimatedItemSize >= scrollMetrics.offset - screenHeight &&
      index * estimatedItemSize <= scrollMetrics.offset + screenHeight * 2
    );

    // Skip rendering for items far from viewport during scrolling
    if (!isVisible && isScrolling) {
      return (
        <View style={{ height: item.height || estimatedItemSize }}>
          <View style={styles.skippedItem}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        </View>
      );
    }

    return renderItem({ item, index, separators: {} as any });
  }, [renderItem, isScrolling, scrollMetrics, estimatedItemSize]);

  // Render loading footer
  const renderLoadingFooter = () => {
    if (!loadingMore) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading more...</Text>
      </View>
    );
  };

  // Render empty state
  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      );
    }

    if (emptyComponent) {
      return emptyComponent;
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No items found</Text>
      </View>
    );
  };

  // Render refresh control
  const refreshControl = enablePullToRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      colors={[theme.colors.primary]}
      tintColor={theme.colors.primary}
      title="Pull to refresh"
      titleColor={theme.colors.textSecondary}
    />
  ) : undefined;

  // Calculate content container style
  const getContentContainerStyle = () => {
    if (data.length === 0) {
      return [styles.emptyContentContainer, contentContainerStyle];
    }
    return contentContainerStyle;
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      <FlatList
        ref={flatListRef}
        data={data}
        renderItem={enhancedRenderItem}
        keyExtractor={keyExtractor}
        getItemLayout={optimizedGetItemLayout}
        estimatedItemSize={estimatedItemSize}
        windowSize={windowSize}
        maxToRenderPerBatch={maxToRenderPerBatch}
        updateCellsBatchingPeriod={updateCellsBatchingPeriod}
        initialNumToRender={initialNumToRender}
        removeClippedSubviews={removeClippedSubviews}
        onEndReached={handleEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        refreshControl={refreshControl}
        ListHeaderComponent={headerComponent}
        ListFooterComponent={
          <>
            {footerComponent}
            {renderLoadingFooter()}
          </>
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={getContentContainerStyle()}
        testID={`${testID}-flatlist`}
        // Performance optimizations
        legacyImplementation={false}
        disableVirtualization={false}
        maxMemoryUsage={100 * 1024 * 1024} // 100MB
      />
    </View>
  );
}

// Specialized document list component
export interface DocumentListItem extends VirtualizedListItem {
  title: string;
  thumbnail?: string;
  createdAt: string;
  size: number;
  type: string;
}

export interface DocumentVirtualizedListProps extends Omit<VirtualizedListProps<DocumentListItem>, 'renderItem'> {
  renderDocumentItem: ListRenderItem<DocumentListItem>;
  groupByDate?: boolean;
  enableThumbnails?: boolean;
  thumbnailSize?: number;
}

export const DocumentVirtualizedList: React.FC<DocumentVirtualizedListProps> = ({
  renderDocumentItem,
  groupByDate = false,
  enableThumbnails = true,
  thumbnailSize = 60,
  ...props
}) => {
  // Process data for grouping if needed
  const processedData = useMemo(() => {
    if (!groupByDate) {
      return props.data;
    }

    // Group documents by date
    const grouped: Record<string, DocumentListItem[]> = {};
    props.data.forEach(item => {
      const date = new Date(item.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(item);
    });

    // Flatten with date headers
    const flattened: DocumentListItem[] = [];
    Object.entries(grouped).forEach(([date, items]) => {
      // Add date header
      flattened.push({
        id: `header-${date}`,
        data: { isHeader: true, title: date },
        height: 40,
        title: date,
        createdAt: date,
        size: 0,
        type: 'header',
      });
      // Add items
      flattened.push(...items);
    });

    return flattened;
  }, [props.data, groupByDate]);

  const enhancedRenderItem: ListRenderItem<DocumentListItem> = useCallback(({ item, index }) => {
    if (item.data?.isHeader) {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{item.title}</Text>
        </View>
      );
    }

    return renderDocumentItem({ item, index, separators: {} as any });
  }, [renderDocumentItem]);

  return (
    <VirtualizedList
      {...props}
      data={processedData}
      renderItem={enhancedRenderItem}
      estimatedItemSize={enableThumbnails ? thumbnailSize + 20 : 80}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  emptyContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.error,
    textAlign: 'center',
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  skippedItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  dateHeader: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dateHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});