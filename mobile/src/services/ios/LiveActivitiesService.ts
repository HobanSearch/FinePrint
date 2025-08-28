/**
 * Fine Print AI - iOS Live Activities Service
 * 
 * Provides real-time document analysis updates in Dynamic Island and Lock Screen
 * using iOS 16+ Live Activities API
 */

import { NativeModules, Platform } from 'react-native';
import { logger } from '../../utils/logger';

export interface LiveActivityData {
  analysisId: string;
  documentName: string;
  progress: number; // 0-1
  currentStep: string;
  timeRemaining?: number; // seconds
  riskIndicators?: {
    privacy: number;
    legal: number;
    financial: number;
  };
  isComplete: boolean;
  finalRiskScore?: number;
}

export interface LiveActivityState {
  activityId: string;
  data: LiveActivityData;
  startTime: Date;
  isActive: boolean;
}

class LiveActivitiesService {
  private static instance: LiveActivitiesService;
  private activeActivities: Map<string, LiveActivityState> = new Map();

  static getInstance(): LiveActivitiesService {
    if (!LiveActivitiesService.instance) {
      LiveActivitiesService.instance = new LiveActivitiesService();
    }
    return LiveActivitiesService.instance;
  }

  /**
   * Start a Live Activity for document analysis
   */
  async startDocumentAnalysis(
    analysisId: string,
    documentName: string
  ): Promise<string | null> {
    if (Platform.OS !== 'ios') {
      logger.warn('Live Activities only supported on iOS 16+');
      return null;
    }

    try {
      const initialData: LiveActivityData = {
        analysisId,
        documentName: this.truncateDocumentName(documentName),
        progress: 0,
        currentStep: 'Preparing analysis...',
        isComplete: false,
      };

      const activityId = await this.createLiveActivity(initialData);
      
      if (activityId) {
        const activityState: LiveActivityState = {
          activityId,
          data: initialData,
          startTime: new Date(),
          isActive: true,
        };

        this.activeActivities.set(analysisId, activityState);
        logger.info(`Started Live Activity for analysis: ${analysisId}`);
      }

      return activityId;
    } catch (error) {
      logger.error('Failed to start Live Activity:', error);
      return null;
    }
  }

  /**
   * Update Live Activity progress
   */
  async updateAnalysisProgress(
    analysisId: string,
    progress: number,
    currentStep: string,
    timeRemaining?: number,
    riskIndicators?: LiveActivityData['riskIndicators']
  ): Promise<void> {
    const activityState = this.activeActivities.get(analysisId);
    if (!activityState || !activityState.isActive) {
      return;
    }

    try {
      const updatedData: LiveActivityData = {
        ...activityState.data,
        progress: Math.min(Math.max(progress, 0), 1),
        currentStep,
        timeRemaining,
        riskIndicators,
      };

      await this.updateLiveActivity(activityState.activityId, updatedData);

      // Update local state
      activityState.data = updatedData;
      this.activeActivities.set(analysisId, activityState);

      logger.info(`Updated Live Activity progress: ${analysisId} - ${Math.round(progress * 100)}%`);
    } catch (error) {
      logger.error('Failed to update Live Activity:', error);
    }
  }

  /**
   * Complete Live Activity with final results
   */
  async completeAnalysis(
    analysisId: string,
    finalRiskScore: number,
    showSuccessState: boolean = true
  ): Promise<void> {
    const activityState = this.activeActivities.get(analysisId);
    if (!activityState || !activityState.isActive) {
      return;
    }

    try {
      const completedData: LiveActivityData = {
        ...activityState.data,
        progress: 1,
        currentStep: 'Analysis complete',
        isComplete: true,
        finalRiskScore,
      };

      if (showSuccessState) {
        // Show completion state for a few seconds before ending
        await this.updateLiveActivity(activityState.activityId, completedData);
        
        // Wait 3 seconds then end the activity
        setTimeout(async () => {
          await this.endLiveActivity(activityState.activityId, completedData);
          this.markActivityInactive(analysisId);
        }, 3000);
      } else {
        // End immediately
        await this.endLiveActivity(activityState.activityId, completedData);
        this.markActivityInactive(analysisId);
      }

      logger.info(`Completed Live Activity: ${analysisId} - Risk: ${Math.round(finalRiskScore * 100)}%`);
    } catch (error) {
      logger.error('Failed to complete Live Activity:', error);
    }
  }

  /**
   * Cancel active Live Activity
   */
  async cancelAnalysis(analysisId: string): Promise<void> {
    const activityState = this.activeActivities.get(analysisId);
    if (!activityState || !activityState.isActive) {
      return;
    }

    try {
      const cancelledData: LiveActivityData = {
        ...activityState.data,
        currentStep: 'Analysis cancelled',
        isComplete: true,
      };

      await this.endLiveActivity(activityState.activityId, cancelledData);
      this.markActivityInactive(analysisId);

      logger.info(`Cancelled Live Activity: ${analysisId}`);
    } catch (error) {
      logger.error('Failed to cancel Live Activity:', error);
    }
  }

  /**
   * Get all active Live Activities
   */
  getActiveActivities(): LiveActivityState[] {
    return Array.from(this.activeActivities.values()).filter(state => state.isActive);
  }

  /**
   * Check if Live Activities are supported
   */
  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      if (NativeModules.LiveActivitiesManager) {
        return await NativeModules.LiveActivitiesManager.isSupported();
      }
      return false;
    } catch (error) {
      logger.error('Failed to check Live Activities support:', error);
      return false;
    }
  }

  /**
   * Request Live Activities permission
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      if (NativeModules.LiveActivitiesManager) {
        return await NativeModules.LiveActivitiesManager.requestPermission();
      }
      return false;
    } catch (error) {
      logger.error('Failed to request Live Activities permission:', error);
      return false;
    }
  }

  /**
   * Handle Live Activity tap events
   */
  handleActivityTap(activityId: string, action: string): { screen: string; params?: any } {
    // Find the activity by ID
    const activity = Array.from(this.activeActivities.values())
      .find(state => state.activityId === activityId);

    if (!activity) {
      return { screen: 'Dashboard' };
    }

    switch (action) {
      case 'open_analysis':
        return {
          screen: 'AnalysisDetail',
          params: { analysisId: activity.data.analysisId }
        };
      case 'cancel_analysis':
        this.cancelAnalysis(activity.data.analysisId);
        return { screen: 'Dashboard' };
      case 'view_document':
        return {
          screen: 'DocumentDetail',
          params: { analysisId: activity.data.analysisId }
        };
      default:
        return { screen: 'Dashboard' };
    }
  }

  // Private methods

  private async createLiveActivity(data: LiveActivityData): Promise<string | null> {
    if (NativeModules.LiveActivitiesManager) {
      try {
        return await NativeModules.LiveActivitiesManager.start({
          attributes: {
            documentName: data.documentName,
            analysisId: data.analysisId,
          },
          contentState: {
            progress: data.progress,
            currentStep: data.currentStep,
            timeRemaining: data.timeRemaining,
            riskIndicators: data.riskIndicators,
            isComplete: data.isComplete,
            finalRiskScore: data.finalRiskScore,
          },
        });
      } catch (error) {
        logger.error('Native Live Activity creation failed:', error);
        return null;
      }
    }
    return null;
  }

  private async updateLiveActivity(activityId: string, data: LiveActivityData): Promise<void> {
    if (NativeModules.LiveActivitiesManager) {
      try {
        await NativeModules.LiveActivitiesManager.update(activityId, {
          progress: data.progress,
          currentStep: data.currentStep,
          timeRemaining: data.timeRemaining,
          riskIndicators: data.riskIndicators,
          isComplete: data.isComplete,
          finalRiskScore: data.finalRiskScore,
        });
      } catch (error) {
        logger.error('Native Live Activity update failed:', error);
      }
    }
  }

  private async endLiveActivity(activityId: string, finalData: LiveActivityData): Promise<void> {
    if (NativeModules.LiveActivitiesManager) {
      try {
        await NativeModules.LiveActivitiesManager.end(activityId, {
          progress: finalData.progress,
          currentStep: finalData.currentStep,
          isComplete: finalData.isComplete,
          finalRiskScore: finalData.finalRiskScore,
        });
      } catch (error) {
        logger.error('Native Live Activity end failed:', error);
      }
    }
  }

  private markActivityInactive(analysisId: string): void {
    const activityState = this.activeActivities.get(analysisId);
    if (activityState) {
      activityState.isActive = false;
      this.activeActivities.set(analysisId, activityState);
    }
  }

  private truncateDocumentName(name: string, maxLength: number = 25): string {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  }

  /**
   * Clean up inactive activities (called periodically)
   */
  cleanupInactiveActivities(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    for (const [analysisId, state] of this.activeActivities.entries()) {
      if (!state.isActive && state.startTime < oneHourAgo) {
        this.activeActivities.delete(analysisId);
      }
    }
  }

  /**
   * Batch update multiple risk indicators
   */
  async updateRiskIndicators(
    analysisId: string,
    privacy: number,
    legal: number,
    financial: number
  ): Promise<void> {
    const activityState = this.activeActivities.get(analysisId);
    if (!activityState || !activityState.isActive) {
      return;
    }

    const riskIndicators = {
      privacy: Math.min(Math.max(privacy, 0), 1),
      legal: Math.min(Math.max(legal, 0), 1),
      financial: Math.min(Math.max(financial, 0), 1),
    };

    await this.updateAnalysisProgress(
      analysisId,
      activityState.data.progress,
      activityState.data.currentStep,
      activityState.data.timeRemaining,
      riskIndicators
    );
  }
}

export default LiveActivitiesService;