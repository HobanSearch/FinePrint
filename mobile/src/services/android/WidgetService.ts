import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DocumentSummary {
  id: string;
  name: string;
  riskScore: number;
  lastUpdated: string;
}

interface WidgetData {
  riskScore: number;
  recentDocuments: DocumentSummary[];
  hasNewAlerts: boolean;
  lastUpdated: string;
}

class AndroidWidgetService {
  private static instance: AndroidWidgetService;

  static getInstance(): AndroidWidgetService {
    if (!AndroidWidgetService.instance) {
      AndroidWidgetService.instance = new AndroidWidgetService();
    }
    return AndroidWidgetService.instance;
  }

  /**
   * Update Android widget data
   */
  async updateWidgetData(data: WidgetData): Promise<void> {
    if (Platform.OS !== 'android') {
      console.log('Android widget updates only supported on Android');
      return;
    }

    try {
      // Store data in SharedPreferences for widget consumption
      await this.setWidgetPreference('latest_risk_score', data.riskScore);
      await this.setWidgetPreference('has_new_alerts', data.hasNewAlerts);
      await this.setWidgetPreference('last_updated', data.lastUpdated);
      await this.setWidgetPreference('recent_documents', JSON.stringify(data.recentDocuments));

      // Request widget update
      await this.updateWidgets();

      console.log('Android widget data updated successfully');
    } catch (error) {
      console.error('Failed to update Android widget data:', error);
    }
  }

  /**
   * Get current widget data
   */
  async getWidgetData(): Promise<WidgetData | null> {
    if (Platform.OS !== 'android') {
      return null;
    }

    try {
      const riskScore = await this.getWidgetPreference('latest_risk_score', 0.0);
      const hasNewAlerts = await this.getWidgetPreference('has_new_alerts', false);
      const lastUpdated = await this.getWidgetPreference('last_updated', new Date().toISOString());
      const documentsString = await this.getWidgetPreference('recent_documents', '[]');
      
      const recentDocuments: DocumentSummary[] = JSON.parse(documentsString);

      return {
        riskScore,
        hasNewAlerts,
        lastUpdated,
        recentDocuments,
      };
    } catch (error) {
      console.error('Failed to get Android widget data:', error);
      return null;
    }
  }

  /**
   * Update widget when new document analysis is completed
   */
  async onDocumentAnalysisCompleted(
    documentId: string,
    documentName: string,
    riskScore: number,
    overallRiskScore: number
  ): Promise<void> {
    try {
      // Get current recent documents
      const currentData = await this.getWidgetData();
      let recentDocuments = currentData?.recentDocuments || [];

      // Add/update document in recent list
      const existingIndex = recentDocuments.findIndex(doc => doc.id === documentId);
      const newDocument: DocumentSummary = {
        id: documentId,
        name: documentName,
        riskScore,
        lastUpdated: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        recentDocuments[existingIndex] = newDocument;
      } else {
        recentDocuments.unshift(newDocument);
      }

      // Keep only the 5 most recent documents
      recentDocuments = recentDocuments.slice(0, 5);

      // Check if this creates a new alert (high risk score)
      const hasNewAlerts = riskScore > 0.7 || (currentData?.hasNewAlerts ?? false);

      // Update widget data
      await this.updateWidgetData({
        riskScore: overallRiskScore,
        recentDocuments,
        hasNewAlerts,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to update Android widget after document analysis:', error);
    }
  }

  /**
   * Clear new alerts flag
   */
  async clearNewAlerts(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const currentData = await this.getWidgetData();
      if (currentData && currentData.hasNewAlerts) {
        await this.updateWidgetData({
          ...currentData,
          hasNewAlerts: false,
        });
      }
    } catch (error) {
      console.error('Failed to clear new alerts:', error);
    }
  }

  /**
   * Initialize widget with default data
   */
  async initializeWidget(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const existingData = await this.getWidgetData();
      if (!existingData) {
        // Initialize with empty state
        await this.updateWidgetData({
          riskScore: 0.0,
          recentDocuments: [],
          hasNewAlerts: false,
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to initialize Android widget:', error);
    }
  }

  /**
   * Handle widget click actions
   */
  handleWidgetAction(action: string, data?: any): { screen: string; params?: any } {
    switch (action) {
      case 'dashboard':
        return { screen: 'Dashboard' };
      case 'scan':
        return { screen: 'DocumentScanner' };
      case 'document':
        return { 
          screen: 'DocumentDetail', 
          params: { documentId: data?.documentId } 
        };
      case 'refresh':
        // Trigger data refresh
        this.refreshWidgetData();
        return { screen: 'Dashboard' };
      default:
        return { screen: 'Dashboard' };
    }
  }

  /**
   * Refresh widget data from server
   */
  async refreshWidgetData(): Promise<void> {
    try {
      // This would typically fetch fresh data from your API
      const freshData = await this.fetchFreshWidgetData();
      if (freshData) {
        await this.updateWidgetData(freshData);
      }
    } catch (error) {
      console.error('Failed to refresh widget data:', error);
    }
  }

  /**
   * Configure widget update frequency
   */
  async configureWidgetUpdates(intervalMinutes: number = 30): Promise<void> {
    if (Platform.OS !== 'android' || !NativeModules.AndroidWidgetManager) {
      return;
    }

    try {
      await NativeModules.AndroidWidgetManager.configureUpdates(intervalMinutes);
    } catch (error) {
      console.error('Failed to configure widget updates:', error);
    }
  }

  /**
   * Get widget configuration
   */
  async getWidgetConfiguration(): Promise<any> {
    if (Platform.OS !== 'android' || !NativeModules.AndroidWidgetManager) {
      return null;
    }

    try {
      return await NativeModules.AndroidWidgetManager.getConfiguration();
    } catch (error) {
      console.error('Failed to get widget configuration:', error);
      return null;
    }
  }

  // Private helper methods

  private async setWidgetPreference(key: string, value: any): Promise<void> {
    if (Platform.OS === 'android' && NativeModules.AndroidWidgetManager) {
      await NativeModules.AndroidWidgetManager.setPreference(key, value);
    } else {
      // Fallback to AsyncStorage for development
      await AsyncStorage.setItem(`android_widget_${key}`, JSON.stringify(value));
    }
  }

  private async getWidgetPreference(key: string, defaultValue: any): Promise<any> {
    try {
      if (Platform.OS === 'android' && NativeModules.AndroidWidgetManager) {
        const value = await NativeModules.AndroidWidgetManager.getPreference(key);
        return value !== null ? value : defaultValue;
      } else {
        // Fallback to AsyncStorage for development
        const value = await AsyncStorage.getItem(`android_widget_${key}`);
        return value ? JSON.parse(value) : defaultValue;
      }
    } catch (error) {
      console.error(`Failed to get widget preference for key ${key}:`, error);
      return defaultValue;
    }
  }

  private async updateWidgets(): Promise<void> {
    if (Platform.OS === 'android' && NativeModules.AndroidWidgetManager) {
      await NativeModules.AndroidWidgetManager.updateWidgets();
    }
  }

  private async fetchFreshWidgetData(): Promise<WidgetData | null> {
    // This would fetch from your app's API or data store
    // For now, return mock data
    return {
      riskScore: Math.random() * 0.5 + 0.25, // Random score between 0.25-0.75
      recentDocuments: [
        {
          id: '1',
          name: 'Privacy Policy',
          riskScore: Math.random() * 0.4 + 0.3,
          lastUpdated: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Terms of Service',
          riskScore: Math.random() * 0.4 + 0.3,
          lastUpdated: new Date().toISOString(),
        },
      ],
      hasNewAlerts: Math.random() > 0.7,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export default AndroidWidgetService;