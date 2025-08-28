/**
 * Fine Print AI - Native Integration Service
 * 
 * Orchestrates all native mobile features including camera, widgets, haptics,
 * live activities, quick actions, and deep system integrations
 */

import { Platform, Linking, Alert, Share } from 'react-native';
import { logger } from '../utils/logger';
import WidgetService from './ios/WidgetService';
import AndroidWidgetService from './android/WidgetService';
import LiveActivitiesService from './ios/LiveActivitiesService';
import QuickActionsService from './QuickActionsService';
import HapticFeedbackService from './HapticFeedbackService';

export interface NativeCapabilities {
  hasCamera: boolean;
  hasHaptics: boolean;
  hasWidgets: boolean;
  hasLiveActivities: boolean;
  hasQuickActions: boolean;
  hasBiometrics: boolean;
  hasSpotlightSearch: boolean;
  hasFileSharing: boolean;
  hasIntentHandling: boolean;
}

export interface DocumentAnalysisContext {
  documentId: string;
  documentName: string;
  analysisId: string;
  startTime: Date;
  estimatedDuration?: number;
}

class NativeIntegrationService {
  private static instance: NativeIntegrationService;
  private capabilities: NativeCapabilities | null = null;
  private activeAnalyses: Map<string, DocumentAnalysisContext> = new Map();

  // Service instances
  private widgetService: WidgetService | AndroidWidgetService;
  private liveActivitiesService: LiveActivitiesService;
  private quickActionsService: QuickActionsService;
  private hapticService: HapticFeedbackService;

  static getInstance(): NativeIntegrationService {
    if (!NativeIntegrationService.instance) {
      NativeIntegrationService.instance = new NativeIntegrationService();
    }
    return NativeIntegrationService.instance;
  }

  constructor() {
    this.widgetService = Platform.OS === 'ios' 
      ? WidgetService.getInstance() 
      : AndroidWidgetService.getInstance();
    
    this.liveActivitiesService = LiveActivitiesService.getInstance();
    this.quickActionsService = QuickActionsService.getInstance();
    this.hapticService = HapticFeedbackService.getInstance();
  }

  /**
   * Initialize all native integrations
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing native integrations...');

      // Detect device capabilities
      this.capabilities = await this.detectCapabilities();
      
      // Initialize services based on capabilities
      if (this.capabilities.hasWidgets) {
        await this.widgetService.initializeWidget();
      }

      if (this.capabilities.hasQuickActions) {
        await this.quickActionsService.initialize();
      }

      // Set up event listeners
      this.setupEventListeners();

      logger.info('Native integrations initialized successfully', this.capabilities);
    } catch (error) {
      logger.error('Failed to initialize native integrations:', error);
    }
  }

  /**
   * Start comprehensive document analysis with all native feedback
   */
  async startDocumentAnalysis(
    documentId: string,
    documentName: string,
    estimatedDuration?: number
  ): Promise<string> {
    const analysisId = `analysis_${documentId}_${Date.now()}`;
    
    const context: DocumentAnalysisContext = {
      documentId,
      documentName,
      analysisId,
      startTime: new Date(),
      estimatedDuration,
    };

    this.activeAnalyses.set(analysisId, context);

    try {
      // Start Live Activity (iOS)
      if (this.capabilities?.hasLiveActivities) {
        await this.liveActivitiesService.startDocumentAnalysis(analysisId, documentName);
      }

      // Provide haptic feedback
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.processingStarted();
      }

      // Update widgets with processing state
      if (this.capabilities?.hasWidgets) {
        // Implementation depends on specific widget service
      }

      logger.info(`Started document analysis: ${analysisId}`);
      return analysisId;
    } catch (error) {
      logger.error('Failed to start document analysis:', error);
      this.activeAnalyses.delete(analysisId);
      throw error;
    }
  }

  /**
   * Update analysis progress across all native interfaces
   */
  async updateAnalysisProgress(
    analysisId: string,
    progress: number,
    currentStep: string,
    riskIndicators?: { privacy: number; legal: number; financial: number }
  ): Promise<void> {
    const context = this.activeAnalyses.get(analysisId);
    if (!context) {
      logger.warn(`Analysis context not found: ${analysisId}`);
      return;
    }

    try {
      // Update Live Activity
      if (this.capabilities?.hasLiveActivities) {
        const timeElapsed = Date.now() - context.startTime.getTime();
        const estimatedTotal = context.estimatedDuration || 30000; // 30s default
        const timeRemaining = Math.max(0, Math.round((estimatedTotal - timeElapsed) / 1000));

        await this.liveActivitiesService.updateAnalysisProgress(
          analysisId,
          progress,
          currentStep,
          timeRemaining,
          riskIndicators
        );
      }

      // Periodic haptic feedback for major progress milestones
      if (this.capabilities?.hasHaptics && this.shouldProvideProgressFeedback(progress)) {
        await this.hapticService.progressTick();
      }

      logger.debug(`Updated analysis progress: ${analysisId} - ${Math.round(progress * 100)}%`);
    } catch (error) {
      logger.error('Failed to update analysis progress:', error);
    }
  }

  /**
   * Complete document analysis with comprehensive native feedback
   */
  async completeDocumentAnalysis(
    analysisId: string,
    finalRiskScore: number,
    overallRiskScore?: number,
    results?: any
  ): Promise<void> {
    const context = this.activeAnalyses.get(analysisId);
    if (!context) {
      logger.warn(`Analysis context not found: ${analysisId}`);
      return;
    }

    try {
      // Complete Live Activity
      if (this.capabilities?.hasLiveActivities) {
        await this.liveActivitiesService.completeAnalysis(analysisId, finalRiskScore);
      }

      // Provide contextual haptic feedback
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.analysisCompleted(finalRiskScore);
      }

      // Update widgets with new data
      if (this.capabilities?.hasWidgets) {
        await this.widgetService.onDocumentAnalysisCompleted(
          context.documentId,
          context.documentName,
          finalRiskScore,
          overallRiskScore || finalRiskScore
        );
      }

      // Update Quick Actions with dynamic content
      if (this.capabilities?.hasQuickActions && results) {
        await this.updateQuickActionsWithResults(context, finalRiskScore, results);
      }

      logger.info(`Completed document analysis: ${analysisId} - Risk: ${Math.round(finalRiskScore * 100)}%`);
    } catch (error) {
      logger.error('Failed to complete document analysis:', error);
    } finally {
      this.activeAnalyses.delete(analysisId);
    }
  }

  /**
   * Handle document capture with camera integration
   */
  async handleDocumentCapture(): Promise<void> {
    try {
      // Provide haptic feedback for capture
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.documentCaptured();
      }

      logger.info('Document captured via native integration');
    } catch (error) {
      logger.error('Failed to handle document capture:', error);
    }
  }

  /**
   * Share analysis results using native sharing
   */
  async shareAnalysisResults(
    documentName: string,
    riskScore: number,
    summary?: string
  ): Promise<void> {
    try {
      const shareContent = {
        title: `Fine Print AI Analysis: ${documentName}`,
        message: `Document Risk Score: ${Math.round(riskScore * 100)}%${summary ? `\n\n${summary}` : ''}`,
        url: undefined, // Could include deep link to analysis
      };

      const result = await Share.share(shareContent);
      
      if (result.action === Share.sharedAction) {
        // Provide success feedback
        if (this.capabilities?.hasHaptics) {
          await this.hapticService.buttonPressed('primary');
        }
        logger.info('Analysis results shared successfully');
      }
    } catch (error) {
      logger.error('Failed to share analysis results:', error);
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.errorOccurred('minor');
      }
    }
  }

  /**
   * Handle deep link navigation
   */
  async handleDeepLink(url: string): Promise<{ screen: string; params?: any } | null> {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.host;
      const path = parsedUrl.pathname;
      const params = Object.fromEntries(parsedUrl.searchParams);

      logger.info(`Handling deep link: ${host}${path}`, params);

      // Provide navigation feedback
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.navigationTransition();
      }

      switch (host) {
        case 'dashboard':
          return { screen: 'Dashboard' };
        
        case 'scan':
          return { screen: 'DocumentScanner' };
        
        case 'document':
          return { 
            screen: 'DocumentDetail', 
            params: { documentId: params.id } 
          };
        
        case 'analysis':
          return { 
            screen: 'AnalysisDetail', 
            params: { analysisId: params.id } 
          };
        
        case 'widget':
          // Handle widget interactions
          if (Platform.OS === 'ios') {
            return WidgetService.getInstance().handleWidgetTap(url);
          } else {
            return AndroidWidgetService.getInstance().handleWidgetAction(params.action, params);
          }
        
        default:
          return { screen: 'Dashboard' };
      }
    } catch (error) {
      logger.error('Failed to handle deep link:', error);
      return null;
    }
  }

  /**
   * Get device capabilities
   */
  getCapabilities(): NativeCapabilities | null {
    return this.capabilities;
  }

  /**
   * Check if specific capability is available
   */
  hasCapability(capability: keyof NativeCapabilities): boolean {
    return this.capabilities?.[capability] ?? false;
  }

  /**
   * Update user preferences for native features
   */
  async updateNativePreferences(preferences: {
    enableHaptics?: boolean;
    enableLiveActivities?: boolean;
    enableWidgets?: boolean;
    hapticIntensity?: 'light' | 'medium' | 'strong';
  }): Promise<void> {
    try {
      if (preferences.enableHaptics !== undefined) {
        this.hapticService.setEnabled(preferences.enableHaptics);
      }

      // Apply other preferences as needed
      logger.info('Updated native preferences', preferences);
    } catch (error) {
      logger.error('Failed to update native preferences:', error);
    }
  }

  // Private methods

  private async detectCapabilities(): Promise<NativeCapabilities> {
    const capabilities: NativeCapabilities = {
      hasCamera: true, // Assume camera is available
      hasHaptics: await this.hapticService.isSupported(),
      hasWidgets: true, // Both platforms support widgets
      hasLiveActivities: Platform.OS === 'ios' && await this.liveActivitiesService.isSupported(),
      hasQuickActions: this.quickActionsService.isSupported(),
      hasBiometrics: false, // Would need to check biometric availability
      hasSpotlightSearch: Platform.OS === 'ios',
      hasFileSharing: true,
      hasIntentHandling: Platform.OS === 'android',
    };

    return capabilities;
  }

  private setupEventListeners(): void {
    // Set up Quick Actions listener
    this.quickActionsService.addEventListener('main', (action) => {
      const result = this.quickActionsService.handleQuickAction(action);
      // Navigate to the specified screen
      logger.info(`Quick Action navigation: ${result.screen}`, result.params);
    });

    // Set up URL/deep link listeners
    Linking.addEventListener('url', ({ url }) => {
      this.handleDeepLink(url);
    });
  }

  private shouldProvideProgressFeedback(progress: number): boolean {
    // Provide feedback at 25%, 50%, 75% milestones
    const milestones = [0.25, 0.5, 0.75];
    const threshold = 0.05; // 5% tolerance
    
    return milestones.some(milestone => 
      Math.abs(progress - milestone) < threshold
    );
  }

  private async updateQuickActionsWithResults(
    context: DocumentAnalysisContext,
    riskScore: number,
    results: any
  ): Promise<void> {
    // This would update Quick Actions with recent analysis results
    // Implementation would depend on your app's data structure
    logger.info('Updating Quick Actions with analysis results');
  }

  /**
   * Cancel active analysis
   */
  async cancelAnalysis(analysisId: string): Promise<void> {
    const context = this.activeAnalyses.get(analysisId);
    if (!context) {
      return;
    }

    try {
      // Cancel Live Activity
      if (this.capabilities?.hasLiveActivities) {
        await this.liveActivitiesService.cancelAnalysis(analysisId);
      }

      // Provide cancellation feedback
      if (this.capabilities?.hasHaptics) {
        await this.hapticService.buttonPressed('secondary');
      }

      this.activeAnalyses.delete(analysisId);
      logger.info(`Cancelled analysis: ${analysisId}`);
    } catch (error) {
      logger.error('Failed to cancel analysis:', error);
    }
  }

  /**
   * Get active analyses count
   */
  getActiveAnalysesCount(): number {
    return this.activeAnalyses.size;
  }

  /**
   * Clean up inactive activities and data
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up Live Activities
      if (this.capabilities?.hasLiveActivities) {
        this.liveActivitiesService.cleanupInactiveActivities();
      }

      // Clear old analysis contexts
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      for (const [analysisId, context] of this.activeAnalyses.entries()) {
        if (context.startTime.getTime() < oneHourAgo) {
          this.activeAnalyses.delete(analysisId);
        }
      }

      logger.info('Native integration cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup native integrations:', error);
    }
  }
}

export default NativeIntegrationService;