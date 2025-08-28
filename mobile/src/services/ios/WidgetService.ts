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

class WidgetService {
  private static instance: WidgetService;
  private readonly APP_GROUP_ID = 'group.com.fineprintai.mobile';

  static getInstance(): WidgetService {
    if (!WidgetService.instance) {
      WidgetService.instance = new WidgetService();
    }
    return WidgetService.instance;
  }

  /**
   * Update widget data with latest risk scores and document analyses
   */
  async updateWidgetData(data: WidgetData): Promise<void> {
    if (Platform.OS !== 'ios') {
      console.log('Widget updates only supported on iOS');
      return;
    }

    try {
      // Store data in shared UserDefaults for widget consumption
      await this.setSharedUserDefault('latest_risk_score', data.riskScore);
      await this.setSharedUserDefault('has_new_alerts', data.hasNewAlerts);
      await this.setSharedUserDefault('last_updated', data.lastUpdated);
      await this.setSharedUserDefault('recent_documents', JSON.stringify(data.recentDocuments));

      // Request widget timeline reload
      await this.reloadWidgetTimelines();

      console.log('Widget data updated successfully');
    } catch (error) {
      console.error('Failed to update widget data:', error);
    }
  }

  /**
   * Get current widget data
   */
  async getWidgetData(): Promise<WidgetData | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }

    try {
      const riskScore = await this.getSharedUserDefault('latest_risk_score', 0.0);
      const hasNewAlerts = await this.getSharedUserDefault('has_new_alerts', false);
      const lastUpdated = await this.getSharedUserDefault('last_updated', new Date().toISOString());
      const documentsString = await this.getSharedUserDefault('recent_documents', '[]');
      
      const recentDocuments: DocumentSummary[] = JSON.parse(documentsString);

      return {
        riskScore,
        hasNewAlerts,
        lastUpdated,
        recentDocuments,
      };
    } catch (error) {
      console.error('Failed to get widget data:', error);
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
      console.error('Failed to update widget after document analysis:', error);
    }
  }

  /**
   * Clear new alerts flag
   */
  async clearNewAlerts(): Promise<void> {
    if (Platform.OS !== 'ios') {
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
    if (Platform.OS !== 'ios') {
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
      console.error('Failed to initialize widget:', error);
    }
  }

  /**
   * Set value in shared UserDefaults (iOS App Group)
   */
  private async setSharedUserDefault(key: string, value: any): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.SharedUserDefaults) {
      await NativeModules.SharedUserDefaults.setItem(this.APP_GROUP_ID, key, value);
    } else {
      // Fallback to AsyncStorage for development
      await AsyncStorage.setItem(`widget_${key}`, JSON.stringify(value));
    }
  }

  /**
   * Get value from shared UserDefaults (iOS App Group)
   */
  private async getSharedUserDefault(key: string, defaultValue: any): Promise<any> {
    try {
      if (Platform.OS === 'ios' && NativeModules.SharedUserDefaults) {
        return await NativeModules.SharedUserDefaults.getItem(this.APP_GROUP_ID, key) ?? defaultValue;
      } else {
        // Fallback to AsyncStorage for development
        const value = await AsyncStorage.getItem(`widget_${key}`);
        return value ? JSON.parse(value) : defaultValue;
      }
    } catch (error) {
      console.error(`Failed to get shared user default for key ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Request widget timeline reload
   */
  private async reloadWidgetTimelines(): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.WidgetCenter) {
      await NativeModules.WidgetCenter.reloadAllTimelines();
    }
  }

  /**
   * Handle widget tap/interaction
   */
  handleWidgetTap(url: string): { screen: string; params?: any } {
    try {
      const urlObject = new URL(url);
      const path = urlObject.pathname;

      switch (path) {
        case '/dashboard':
          return { screen: 'Dashboard' };
        case '/document':
          const documentId = urlObject.searchParams.get('id');
          return { 
            screen: 'DocumentDetail', 
            params: { documentId } 
          };
        case '/analysis':
          const analysisId = urlObject.searchParams.get('id');
          return { 
            screen: 'AnalysisDetail', 
            params: { analysisId } 
          };
        default:
          return { screen: 'Dashboard' };
      }
    } catch (error) {
      console.error('Failed to parse widget URL:', error);
      return { screen: 'Dashboard' };
    }
  }
}

export default WidgetService;