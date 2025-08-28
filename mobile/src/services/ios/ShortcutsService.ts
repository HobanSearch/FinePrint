import { NativeModules, Platform } from 'react-native';

interface ShortcutIntentResponse {
  success: boolean;
  result?: any;
  error?: string;
}

interface DocumentAnalysisIntent {
  documentId?: string;
  documentUrl?: string;
  analysisType?: 'quick' | 'detailed' | 'comparison';
}

interface VoiceCommandIntent {
  command: string;
  parameters?: Record<string, any>;
}

class ShortcutsService {
  private static instance: ShortcutsService;

  static getInstance(): ShortcutsService {
    if (!ShortcutsService.instance) {
      ShortcutsService.instance = new ShortcutsService();
    }
    return ShortcutsService.instance;
  }

  /**
   * Initialize Shortcuts app intents and donations
   */
  async initializeShortcuts(): Promise<void> {
    if (Platform.OS !== 'ios') {
      console.log('Shortcuts only supported on iOS');
      return;
    }

    try {
      await this.donateShortcuts();
      console.log('Shortcuts initialized successfully');
    } catch (error) {
      console.error('Failed to initialize shortcuts:', error);
    }
  }

  /**
   * Donate frequently used actions to Shortcuts app
   */
  async donateShortcuts(): Promise<void> {
    if (Platform.OS !== 'ios' || !NativeModules.ShortcutsManager) {
      return;
    }

    const shortcuts = [
      {
        identifier: 'scan_document',
        title: 'Scan Document',
        suggestedInvocationPhrase: 'Scan a legal document',
        shortcutType: 'activity',
        userInfo: {
          action: 'scan',
          type: 'document'
        }
      },
      {
        identifier: 'quick_analysis',
        title: 'Quick Risk Analysis',
        suggestedInvocationPhrase: 'Check document risk',
        shortcutType: 'activity',
        userInfo: {
          action: 'analyze',
          type: 'quick'
        }
      },
      {
        identifier: 'view_dashboard',
        title: 'View Risk Dashboard',
        suggestedInvocationPhrase: 'Show my risk dashboard',
        shortcutType: 'activity',
        userInfo: {
          action: 'dashboard',
          type: 'overview'
        }
      },
      {
        identifier: 'recent_documents',
        title: 'Recent Documents',
        suggestedInvocationPhrase: 'Show recent documents',
        shortcutType: 'activity',
        userInfo: {
          action: 'documents',
          type: 'recent'
        }
      },
      {
        identifier: 'high_risk_alerts',
        title: 'High Risk Alerts',
        suggestedInvocationPhrase: 'Show high risk documents',
        shortcutType: 'activity',
        userInfo: {
          action: 'alerts',
          type: 'high-risk'
        }
      }
    ];

    try {
      for (const shortcut of shortcuts) {
        await NativeModules.ShortcutsManager.donateShortcut(shortcut);
      }
      console.log('Shortcuts donated successfully');
    } catch (error) {
      console.error('Failed to donate shortcuts:', error);
    }
  }

  /**
   * Handle document analysis intent from Shortcuts app
   */
  async handleDocumentAnalysisIntent(intent: DocumentAnalysisIntent): Promise<ShortcutIntentResponse> {
    try {
      if (intent.documentUrl) {
        // Handle document URL from Files app or other sources
        return await this.analyzeDocumentFromUrl(intent.documentUrl, intent.analysisType || 'quick');
      } else if (intent.documentId) {
        // Handle existing document by ID
        return await this.analyzeExistingDocument(intent.documentId, intent.analysisType || 'quick');
      } else {
        // Start document scanner
        return {
          success: true,
          result: {
            action: 'scan',
            screen: 'DocumentScanner',
            params: { analysisType: intent.analysisType }
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Handle voice command intents
   */
  async handleVoiceCommandIntent(intent: VoiceCommandIntent): Promise<ShortcutIntentResponse> {
    try {
      const command = intent.command.toLowerCase();
      
      if (command.includes('scan') || command.includes('analyze')) {
        return {
          success: true,
          result: {
            action: 'scan',
            screen: 'DocumentScanner'
          }
        };
      } else if (command.includes('dashboard') || command.includes('overview')) {
        return {
          success: true,
          result: {
            action: 'dashboard',
            screen: 'Dashboard'
          }
        };
      } else if (command.includes('recent') || command.includes('documents')) {
        return {
          success: true,
          result: {
            action: 'documents',
            screen: 'Documents',
            params: { filter: 'recent' }
          }
        };
      } else if (command.includes('high risk') || command.includes('alert')) {
        return {
          success: true,
          result: {
            action: 'alerts',
            screen: 'Documents',
            params: { filter: 'high-risk' }
          }
        };
      } else if (command.includes('settings') || command.includes('preferences')) {
        return {
          success: true,
          result: {
            action: 'settings',
            screen: 'Settings'
          }
        };
      } else {
        return {
          success: false,
          error: `Unknown voice command: ${command}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process voice command'
      };
    }
  }

  /**
   * Get risk summary for Shortcuts app
   */
  async getRiskSummaryForShortcuts(): Promise<ShortcutIntentResponse> {
    try {
      // This would typically fetch from your app's data store
      const summary = await this.fetchRiskSummary();
      
      return {
        success: true,
        result: {
          overallRiskScore: summary.overallRiskScore,
          totalDocuments: summary.totalDocuments,
          highRiskDocuments: summary.highRiskDocuments,
          recentAnalyses: summary.recentAnalyses,
          summary: this.generateVoiceSummary(summary)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get risk summary'
      };
    }
  }

  /**
   * Donate interaction after user performs actions
   */
  async donateInteraction(action: string, parameters?: Record<string, any>): Promise<void> {
    if (Platform.OS !== 'ios' || !NativeModules.ShortcutsManager) {
      return;
    }

    try {
      const interaction = {
        identifier: `${action}_${Date.now()}`,
        title: this.getActionTitle(action),
        suggestedInvocationPhrase: this.getSuggestedPhrase(action),
        userInfo: {
          action,
          timestamp: new Date().toISOString(),
          ...parameters
        }
      };

      await NativeModules.ShortcutsManager.donateInteraction(interaction);
    } catch (error) {
      console.error('Failed to donate interaction:', error);
    }
  }

  /**
   * Handle Shortcuts app intent
   */
  handleShortcutIntent(userActivity: any): { screen: string; params?: any } {
    try {
      const userInfo = userActivity.userInfo || {};
      const action = userInfo.action;

      switch (action) {
        case 'scan':
          return { screen: 'DocumentScanner' };
        case 'analyze':
          return { 
            screen: 'DocumentScanner', 
            params: { mode: 'quick' } 
          };
        case 'dashboard':
          return { screen: 'Dashboard' };
        case 'documents':
          return { 
            screen: 'Documents', 
            params: { filter: userInfo.type } 
          };
        case 'alerts':
          return { 
            screen: 'Documents', 
            params: { filter: 'high-risk' } 
          };
        case 'settings':
          return { screen: 'Settings' };
        default:
          return { screen: 'Dashboard' };
      }
    } catch (error) {
      console.error('Failed to handle shortcut intent:', error);
      return { screen: 'Dashboard' };
    }
  }

  // Private helper methods

  private async analyzeDocumentFromUrl(url: string, analysisType: string): Promise<ShortcutIntentResponse> {
    // Implementation would depend on your document processing service
    return {
      success: true,
      result: {
        action: 'analyze',
        screen: 'AnalysisScreen',
        params: { documentUrl: url, analysisType }
      }
    };
  }

  private async analyzeExistingDocument(documentId: string, analysisType: string): Promise<ShortcutIntentResponse> {
    return {
      success: true,
      result: {
        action: 'analyze',
        screen: 'DocumentDetail',
        params: { documentId, analysisType }
      }
    };
  }

  private async fetchRiskSummary(): Promise<any> {
    // This would fetch from your app's data store or API
    return {
      overallRiskScore: 0.68,
      totalDocuments: 15,
      highRiskDocuments: 3,
      recentAnalyses: 5
    };
  }

  private generateVoiceSummary(summary: any): string {
    const riskLevel = summary.overallRiskScore > 0.7 ? 'high' : 
                     summary.overallRiskScore > 0.4 ? 'medium' : 'low';
    
    return `You have ${summary.totalDocuments} documents with an overall ${riskLevel} risk score of ${Math.round(summary.overallRiskScore * 100)}%. ${summary.highRiskDocuments} documents have high risk scores that need attention.`;
  }

  private getActionTitle(action: string): string {
    switch (action) {
      case 'scan': return 'Scan Document';
      case 'analyze': return 'Analyze Document';
      case 'dashboard': return 'View Dashboard';
      case 'documents': return 'View Documents';
      case 'alerts': return 'View Alerts';
      default: return 'Fine Print AI Action';
    }
  }

  private getSuggestedPhrase(action: string): string {
    switch (action) {
      case 'scan': return 'Scan a legal document';
      case 'analyze': return 'Analyze document risk';
      case 'dashboard': return 'Show risk dashboard';
      case 'documents': return 'Show my documents';
      case 'alerts': return 'Show risk alerts';
      default: return 'Use Fine Print AI';
    }
  }
}

export default ShortcutsService;