import { NativeModules, Platform } from 'react-native';

interface SpotlightItem {
  identifier: string;
  title: string;
  contentDescription: string;
  keywords: string[];
  thumbnailData?: string; // base64 encoded image
  url?: string; // deep link URL
  documentType?: string;
  riskScore?: number;
  lastModified?: Date;
  fileSize?: number;
  additionalAttributes?: Record<string, any>;
}

interface DocumentSpotlightItem extends SpotlightItem {
  documentId: string;
  documentName: string;
  riskScore: number;
  analysisDate: Date;
  riskCategories: string[];
  fileType: string;
  pageCount?: number;
}

class SpotlightService {
  private static instance: SpotlightService;

  static getInstance(): SpotlightService {
    if (!SpotlightService.instance) {
      SpotlightService.instance = new SpotlightService();
    }
    return SpotlightService.instance;
  }

  /**
   * Index a document for Spotlight search
   */
  async indexDocument(document: DocumentSpotlightItem): Promise<void> {
    if (Platform.OS !== 'ios') {
      console.log('Spotlight indexing only supported on iOS');
      return;
    }

    try {
      const spotlightItem: SpotlightItem = {
        identifier: `document_${document.documentId}`,
        title: document.documentName,
        contentDescription: this.generateDocumentDescription(document),
        keywords: this.generateDocumentKeywords(document),
        url: `fineprintai://document?id=${document.documentId}`,
        documentType: document.fileType,
        riskScore: document.riskScore,
        lastModified: document.analysisDate,
        additionalAttributes: {
          'com.fineprintai.documentId': document.documentId,
          'com.fineprintai.riskScore': document.riskScore,
          'com.fineprintai.riskCategories': document.riskCategories.join(','),
          'com.fineprintai.analysisDate': document.analysisDate.toISOString(),
          'com.fineprintai.fileType': document.fileType,
          'com.fineprintai.pageCount': document.pageCount || 0,
        },
      };

      await this.indexSpotlightItem(spotlightItem);
      console.log(`Document ${document.documentName} indexed for Spotlight search`);
    } catch (error) {
      console.error('Failed to index document for Spotlight:', error);
    }
  }

  /**
   * Index multiple documents at once
   */
  async indexDocuments(documents: DocumentSpotlightItem[]): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      const promises = documents.map(doc => this.indexDocument(doc));
      await Promise.all(promises);
      console.log(`${documents.length} documents indexed for Spotlight search`);
    } catch (error) {
      console.error('Failed to index documents for Spotlight:', error);
    }
  }

  /**
   * Remove a document from Spotlight index
   */
  async removeDocument(documentId: string): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      await this.removeSpotlightItem(`document_${documentId}`);
      console.log(`Document ${documentId} removed from Spotlight index`);
    } catch (error) {
      console.error('Failed to remove document from Spotlight:', error);
    }
  }

  /**
   * Update document in Spotlight index
   */
  async updateDocument(document: DocumentSpotlightItem): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      // Remove old entry and add new one
      await this.removeDocument(document.documentId);
      await this.indexDocument(document);
      console.log(`Document ${document.documentName} updated in Spotlight index`);
    } catch (error) {
      console.error('Failed to update document in Spotlight:', error);
    }
  }

  /**
   * Clear all documents from Spotlight index
   */
  async clearAllDocuments(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      await this.clearSpotlightIndex();
      console.log('All documents cleared from Spotlight index');
    } catch (error) {
      console.error('Failed to clear Spotlight index:', error);
    }
  }

  /**
   * Index app shortcuts and actions
   */
  async indexAppShortcuts(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    const shortcuts: SpotlightItem[] = [
      {
        identifier: 'scan_document',
        title: 'Scan Document',
        contentDescription: 'Quickly scan a new legal document for analysis',
        keywords: ['scan', 'camera', 'document', 'analyze', 'legal'],
        url: 'fineprintai://scan',
        additionalAttributes: {
          'com.fineprintai.action': 'scan',
        },
      },
      {
        identifier: 'view_dashboard',
        title: 'View Dashboard',
        contentDescription: 'Open your Fine Print AI dashboard',
        keywords: ['dashboard', 'overview', 'risk', 'summary'],
        url: 'fineprintai://dashboard',
        additionalAttributes: {
          'com.fineprintai.action': 'dashboard',
        },
      },
      {
        identifier: 'recent_analyses',
        title: 'Recent Analyses',
        contentDescription: 'View your recent document analyses',
        keywords: ['recent', 'analyses', 'history', 'documents'],
        url: 'fineprintai://analyses',
        additionalAttributes: {
          'com.fineprintai.action': 'analyses',
        },
      },
      {
        identifier: 'high_risk_documents',
        title: 'High Risk Documents',
        contentDescription: 'View documents with high risk scores',
        keywords: ['high', 'risk', 'danger', 'warning', 'alert'],
        url: 'fineprintai://high-risk',
        additionalAttributes: {
          'com.fineprintai.action': 'high-risk',
        },
      },
    ];

    try {
      const promises = shortcuts.map(shortcut => this.indexSpotlightItem(shortcut));
      await Promise.all(promises);
      console.log('App shortcuts indexed for Spotlight search');
    } catch (error) {
      console.error('Failed to index app shortcuts:', error);
    }
  }

  /**
   * Handle Spotlight search result selection
   */
  handleSpotlightSelection(userActivity: any): { screen: string; params?: any } {
    try {
      const url = userActivity.webpageURL || userActivity.userInfo?.url;
      if (!url) {
        return { screen: 'Dashboard' };
      }

      const urlObject = new URL(url);
      const path = urlObject.pathname;
      const params = Object.fromEntries(urlObject.searchParams);

      switch (path) {
        case '/document':
          return {
            screen: 'DocumentDetail',
            params: { documentId: params.id },
          };
        case '/scan':
          return { screen: 'DocumentScanner' };
        case '/dashboard':
          return { screen: 'Dashboard' };
        case '/analyses':
          return { screen: 'AnalysisHistory' };
        case '/high-risk':
          return { 
            screen: 'Documents', 
            params: { filter: 'high-risk' } 
          };
        default:
          return { screen: 'Dashboard' };
      }
    } catch (error) {
      console.error('Failed to handle Spotlight selection:', error);
      return { screen: 'Dashboard' };
    }
  }

  // Private helper methods

  private generateDocumentDescription(document: DocumentSpotlightItem): string {
    const riskLevel = this.getRiskLevel(document.riskScore);
    const categories = document.riskCategories.slice(0, 3).join(', ');
    
    return `${document.fileType} document with ${riskLevel} risk score (${Math.round(document.riskScore * 100)}%). Key concerns: ${categories}. Analyzed on ${document.analysisDate.toLocaleDateString()}.`;
  }

  private generateDocumentKeywords(document: DocumentSpotlightItem): string[] {
    const baseKeywords = [
      document.documentName.toLowerCase(),
      document.fileType.toLowerCase(),
      'legal document',
      'terms',
      'privacy',
      'policy',
      'agreement',
    ];

    const riskKeywords = [
      this.getRiskLevel(document.riskScore).toLowerCase(),
      'risk',
      'analysis',
    ];

    const categoryKeywords = document.riskCategories.map(cat => cat.toLowerCase());

    return [...baseKeywords, ...riskKeywords, ...categoryKeywords];
  }

  private getRiskLevel(score: number): string {
    if (score < 0.3) return 'Low';
    if (score < 0.7) return 'Medium';
    return 'High';
  }

  private async indexSpotlightItem(item: SpotlightItem): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.SpotlightSearch) {
      await NativeModules.SpotlightSearch.indexItem(item);
    }
  }

  private async removeSpotlightItem(identifier: string): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.SpotlightSearch) {
      await NativeModules.SpotlightSearch.removeItem(identifier);
    }
  }

  private async clearSpotlightIndex(): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.SpotlightSearch) {
      await NativeModules.SpotlightSearch.clearIndex();
    }
  }
}

export default SpotlightService;