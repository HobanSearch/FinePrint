import type { PageDetectionResult } from '@/types';

export class PageDetector {
  private static readonly URL_PATTERNS = {
    terms: [
      /\/terms(?:-of-(?:service|use))?(?:\.html?)?$/i,
      /\/tos(?:\.html?)?$/i,
      /\/legal\/terms/i,
      /\/user-agreement/i,
      /\/terms-and-conditions/i,
      /\/service-agreement/i,
      /\/agreement/i,
      /\/eula/i,
    ],
    privacy: [
      /\/privacy(?:-policy)?(?:\.html?)?$/i,
      /\/privacy-notice/i,
      /\/data-protection/i,
      /\/privacy-statement/i,
      /\/legal\/privacy/i,
      /\/cookie-policy/i,
    ],
    cookies: [
      /\/cookie(?:s)?(?:-policy)?(?:\.html?)?$/i,
      /\/cookie-notice/i,
      /\/cookie-statement/i,
    ]
  };

  private static readonly TITLE_PATTERNS = {
    terms: [
      /terms\s+of\s+(?:service|use)/i,
      /user\s+agreement/i,
      /terms\s+(?:and|&)\s+conditions/i,
      /service\s+agreement/i,
      /end\s+user\s+license\s+agreement/i,
      /software\s+license/i,
      /eula/i,
    ],
    privacy: [
      /privacy\s+policy/i,
      /privacy\s+notice/i,
      /privacy\s+statement/i,
      /data\s+protection/i,
      /information\s+we\s+collect/i,
    ],
    cookies: [
      /cookie\s+policy/i,
      /cookie\s+notice/i,
      /cookie\s+statement/i,
      /use\s+of\s+cookies/i,
    ]
  };

  private static readonly CONTENT_PATTERNS = {
    terms: [
      /by\s+(?:using|accessing)\s+(?:this\s+)?(?:service|website|application)/i,
      /these\s+terms\s+(?:of\s+(?:service|use))?/i,
      /user\s+(?:agreement|terms)/i,
      /prohibited\s+(?:uses?|activities)/i,
      /termination\s+of\s+(?:service|account)/i,
      /limitation\s+of\s+liability/i,
      /intellectual\s+property\s+rights/i,
      /disclaimer\s+of\s+warranties/i,
    ],
    privacy: [
      /(?:we|this\s+policy)\s+(?:collect|use|share|process)\s+(?:your\s+)?(?:personal\s+)?(?:information|data)/i,
      /personal\s+(?:information|data)\s+(?:we\s+collect|collection)/i,
      /how\s+we\s+(?:use|collect|share|protect)\s+(?:your\s+)?(?:information|data)/i,
      /data\s+(?:controller|processor|protection)/i,
      /third[.\s-]*party\s+(?:services?|sharing)/i,
      /cookies?\s+and\s+(?:similar\s+)?technologies/i,
      /gdpr|general\s+data\s+protection\s+regulation/i,
      /ccpa|california\s+consumer\s+privacy\s+act/i,
    ],
    cookies: [
      /this\s+(?:site|website)\s+uses\s+cookies/i,
      /(?:essential|necessary|functional|analytics|advertising)\s+cookies/i,
      /cookie\s+(?:consent|preferences|settings)/i,
      /(?:first|third)[.\s-]*party\s+cookies/i,
      /tracking\s+technologies/i,
    ]
  };

  private static readonly HEADING_PATTERNS = {
    terms: [
      /^(?:\d+\.?\s*)?terms\s+of\s+(?:service|use)$/i,
      /^(?:\d+\.?\s*)?user\s+agreement$/i,
      /^(?:\d+\.?\s*)?acceptable\s+use$/i,
      /^(?:\d+\.?\s*)?prohibited\s+(?:conduct|activities)$/i,
      /^(?:\d+\.?\s*)?termination$/i,
      /^(?:\d+\.?\s*)?limitation\s+of\s+liability$/i,
    ],
    privacy: [
      /^(?:\d+\.?\s*)?(?:information|data)\s+(?:we\s+)?collect$/i,
      /^(?:\d+\.?\s*)?how\s+we\s+use\s+(?:your\s+)?(?:information|data)$/i,
      /^(?:\d+\.?\s*)?(?:information|data)\s+sharing$/i,
      /^(?:\d+\.?\s*)?your\s+(?:privacy\s+)?(?:rights|choices)$/i,
      /^(?:\d+\.?\s*)?data\s+retention$/i,
      /^(?:\d+\.?\s*)?security\s+measures$/i,
    ],
    cookies: [
      /^(?:\d+\.?\s*)?(?:what\s+are\s+)?cookies?$/i,
      /^(?:\d+\.?\s*)?types\s+of\s+cookies$/i,
      /^(?:\d+\.?\s*)?managing\s+cookies$/i,
      /^(?:\d+\.?\s*)?cookie\s+consent$/i,
    ]
  };

  static detect(url: string, title: string = '', content: string = ''): PageDetectionResult {
    const results = {
      terms: this.detectType('terms', url, title, content),
      privacy: this.detectType('privacy', url, title, content),
      cookies: this.detectType('cookies', url, title, content),
    };

    // Determine the most likely document type
    const scores = Object.entries(results).map(([type, result]) => ({
      type,
      confidence: result.confidence
    }));

    scores.sort((a, b) => b.confidence - a.confidence);
    const topResult = scores[0];

    const isTermsPage = results.terms.confidence > 0.5;
    const isPrivacyPage = results.privacy.confidence > 0.5 || results.cookies.confidence > 0.5;

    return {
      isTermsPage,
      isPrivacyPage,
      documentType: topResult.confidence > 0.3 ? topResult.type : null,
      confidence: topResult.confidence,
      indicators: this.getAllIndicators(url, title, content),
      title: title || this.extractTitleFromContent(content),
      content: content.slice(0, 1000) // First 1000 chars for preview
    };
  }

  private static detectType(type: keyof typeof this.URL_PATTERNS, url: string, title: string, content: string) {
    let confidence = 0;
    const indicators: string[] = [];

    // URL pattern matching (highest weight)
    const urlPatterns = this.URL_PATTERNS[type];
    for (const pattern of urlPatterns) {
      if (pattern.test(url)) {
        confidence += 0.4;
        indicators.push(`URL matches ${type} pattern: ${pattern.source}`);
        break;
      }
    }

    // Title pattern matching
    const titlePatterns = this.TITLE_PATTERNS[type];
    for (const pattern of titlePatterns) {
      if (pattern.test(title)) {
        confidence += 0.3;
        indicators.push(`Title matches ${type} pattern`);
        break;
      }
    }

    // Content pattern matching
    const contentPatterns = this.CONTENT_PATTERNS[type];
    let contentMatches = 0;
    for (const pattern of contentPatterns) {
      if (pattern.test(content)) {
        contentMatches++;
        indicators.push(`Content contains ${type} keywords`);
      }
    }

    // Weight content matches
    if (contentMatches > 0) {
      confidence += Math.min(0.3, contentMatches * 0.1);
    }

    // Heading pattern matching
    const headings = this.extractHeadings(content);
    const headingPatterns = this.HEADING_PATTERNS[type];
    for (const heading of headings) {
      for (const pattern of headingPatterns) {
        if (pattern.test(heading)) {
          confidence += 0.15;
          indicators.push(`Heading matches ${type} pattern`);
          break;
        }
      }
    }

    return {
      confidence: Math.min(1, confidence),
      indicators
    };
  }

  private static getAllIndicators(url: string, title: string, content: string): string[] {
    const indicators: string[] = [];

    // Add URL-based indicators
    if (/\/terms|\/tos|\/legal/i.test(url)) {
      indicators.push('URL suggests legal document');
    }
    if (/\/privacy|\/data-protection/i.test(url)) {
      indicators.push('URL suggests privacy document');
    }

    // Add content-based indicators
    const contentLower = content.toLowerCase();
    if (contentLower.includes('personal information') || contentLower.includes('personal data')) {
      indicators.push('Contains personal data references');
    }
    if (contentLower.includes('cookies') && contentLower.includes('tracking')) {
      indicators.push('Contains cookie/tracking references');
    }
    if (contentLower.includes('liability') || contentLower.includes('disclaimer')) {
      indicators.push('Contains legal disclaimers');
    }
    if (contentLower.includes('effective date') || contentLower.includes('last updated')) {
      indicators.push('Contains legal document dating');
    }

    return indicators;
  }

  private static extractHeadings(content: string): string[] {
    const headings: string[] = [];
    
    // Extract HTML headings
    const htmlHeadingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    while ((match = htmlHeadingRegex.exec(content)) !== null) {
      const heading = match[1].replace(/<[^>]*>/g, '').trim();
      if (heading) {
        headings.push(heading);
      }
    }

    // Extract markdown-style headings
    const markdownHeadingRegex = /^#{1,6}\s+(.+)$/gm;
    while ((match = markdownHeadingRegex.exec(content)) !== null) {
      headings.push(match[1].trim());
    }

    // Extract numbered section headings
    const numberedHeadingRegex = /^\d+\.?\s+([A-Z][^.!?]*[.!?]?)/gm;
    while ((match = numberedHeadingRegex.exec(content)) !== null) {
      const heading = match[1].trim();
      if (heading.length > 10 && heading.length < 100) {
        headings.push(heading);
      }
    }

    return headings;
  }

  private static extractTitleFromContent(content: string): string | undefined {
    // Try to extract title from HTML title tag
    const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Try to extract from first h1
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) {
      return h1Match[1].replace(/<[^>]*>/g, '').trim();
    }

    // Try to extract from first line if it looks like a title
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 10 && firstLine.length < 100 && 
          /^[A-Z]/.test(firstLine) && 
          (firstLine.includes('Terms') || firstLine.includes('Privacy') || firstLine.includes('Policy'))) {
        return firstLine;
      }
    }

    return undefined;
  }

  // Enhanced detection for SPAs (Single Page Applications)
  static detectSPA(url: string, title: string, content: string): PageDetectionResult {
    // For SPAs, we need to be more aggressive about content detection
    // since URLs might not be as indicative
    
    const result = this.detect(url, title, content);
    
    // If URL doesn't match but content strongly suggests legal document
    if (result.confidence < 0.3) {
      const strongContentIndicators = [
        /by\s+(?:using|accessing)\s+(?:this\s+)?(?:service|website|application)/i,
        /personal\s+(?:information|data)\s+(?:we\s+collect|collection)/i,
        /these\s+terms\s+(?:of\s+(?:service|use))?/i,
        /privacy\s+policy/i,
      ];

      let contentConfidence = 0;
      for (const pattern of strongContentIndicators) {
        if (pattern.test(content)) {
          contentConfidence += 0.2;
        }
      }

      if (contentConfidence > 0.3) {
        result.confidence = Math.max(result.confidence, contentConfidence);
        result.indicators.push('Strong content indicators for SPA');
        
        // Determine document type based on content
        if (/privacy\s+policy|personal\s+(?:information|data)|data\s+protection/i.test(content)) {
          result.documentType = 'privacy';
          result.isPrivacyPage = true;
        } else if (/terms\s+of\s+(?:service|use)|user\s+agreement|acceptable\s+use/i.test(content)) {
          result.documentType = 'terms';
          result.isTermsPage = true;
        }
      }
    }

    return result;
  }

  // Check if page content has changed significantly
  static hasContentChanged(oldContent: string, newContent: string): boolean {
    // Simple hash comparison
    const oldHash = this.simpleHash(oldContent);
    const newHash = this.simpleHash(newContent);
    return oldHash !== newHash;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // Get page readiness score (how much content is loaded)
  static getPageReadiness(content: string): number {
    const indicators = [
      content.length > 1000, // Substantial content
      /<\/body>/i.test(content), // Complete HTML
      /last\s+updated|effective\s+date/i.test(content), // Legal doc markers
      content.split('\n').length > 50, // Multiple paragraphs/sections
    ];

    return indicators.filter(Boolean).length / indicators.length;
  }
}