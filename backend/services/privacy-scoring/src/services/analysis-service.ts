import { HttpClient, AnalysisResult, DocumentAnalysisRequest } from '../types';

export class AnalysisService {
  private readonly ANALYSIS_SERVICE_URL = process.env.ANALYSIS_SERVICE_URL || 'http://localhost:3001';
  
  constructor(private httpClient: HttpClient) {}

  async analyzeDocument(request: DocumentAnalysisRequest): Promise<AnalysisResult> {
    try {
      // Call the document analysis service
      const response = await this.httpClient.post(
        `${this.ANALYSIS_SERVICE_URL}/api/analysis`,
        {
          content: request.content,
          documentType: request.type,
          url: request.url,
          options: {
            extractPatterns: true,
            generateSummary: true,
            scoreRisk: true,
            provideRecommendations: true
          }
        },
        {
          timeout: 30000 // 30 second timeout for analysis
        }
      );

      // Map the response to our expected format
      return {
        patterns: response.data.patterns || [],
        findings: response.data.findings || [],
        riskScore: response.data.riskScore || 50,
        summary: response.data.summary || '',
        recommendations: response.data.recommendations || [],
        metadata: {
          processingTime: response.data.processingTime || 0,
          modelUsed: response.data.modelUsed || 'phi-2',
          confidence: response.data.confidence || 0.8
        }
      };
    } catch (error) {
      console.error('Error calling analysis service:', error);
      
      // Fallback to basic analysis if service is unavailable
      return this.performBasicAnalysis(request);
    }
  }

  private async performBasicAnalysis(request: DocumentAnalysisRequest): Promise<AnalysisResult> {
    // Basic pattern matching as fallback
    const content = request.content.toLowerCase();
    const patterns = [];
    const findings = [];
    let riskScore = 50;

    // Check for common problematic patterns
    const problematicPatterns = [
      {
        regex: /we may share your (personal )?information/i,
        type: 'data_sharing',
        severity: 'high',
        description: 'Broad data sharing permissions'
      },
      {
        regex: /third[- ]party/i,
        type: 'third_party_sharing',
        severity: 'medium',
        description: 'Shares data with third parties'
      },
      {
        regex: /automatic(ally)? renew/i,
        type: 'auto_renewal',
        severity: 'medium',
        description: 'Automatic renewal clause'
      },
      {
        regex: /class action waiver/i,
        type: 'legal_waiver',
        severity: 'high',
        description: 'Waives class action rights'
      },
      {
        regex: /binding arbitration/i,
        type: 'arbitration',
        severity: 'high',
        description: 'Requires binding arbitration'
      },
      {
        regex: /perpetual license/i,
        type: 'perpetual_license',
        severity: 'high',
        description: 'Grants perpetual license to content'
      },
      {
        regex: /no refund/i,
        type: 'no_refunds',
        severity: 'medium',
        description: 'No refund policy'
      },
      {
        regex: /we are not responsible/i,
        type: 'liability_limitation',
        severity: 'medium',
        description: 'Limits company liability'
      }
    ];

    // Check each pattern
    for (const pattern of problematicPatterns) {
      if (pattern.regex.test(content)) {
        patterns.push({
          type: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
          location: this.findPatternLocation(content, pattern.regex)
        });
        
        findings.push({
          title: pattern.description,
          severity: pattern.severity,
          explanation: `The document contains clauses related to ${pattern.type.replace(/_/g, ' ')}.`,
          recommendation: 'Review this section carefully and consider the implications.'
        });

        // Adjust risk score based on severity
        if (pattern.severity === 'high') {
          riskScore += 10;
        } else if (pattern.severity === 'medium') {
          riskScore += 5;
        }
      }
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    return {
      patterns,
      findings,
      riskScore,
      summary: `This document contains ${patterns.length} potentially problematic patterns. ` +
               `The overall risk score is ${riskScore}/100.`,
      recommendations: [
        'Review all highlighted sections carefully',
        'Consider seeking legal advice for high-severity items',
        'Compare with similar services before agreeing'
      ],
      metadata: {
        processingTime: Date.now(),
        modelUsed: 'pattern-matching',
        confidence: 0.7
      }
    };
  }

  private findPatternLocation(content: string, regex: RegExp): string {
    const match = content.match(regex);
    if (!match) return 'Unknown';
    
    const index = match.index || 0;
    const lines = content.substring(0, index).split('\n');
    return `Line ${lines.length}`;
  }
}