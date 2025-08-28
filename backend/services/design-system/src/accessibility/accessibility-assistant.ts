/**
 * Accessibility Assistant - WCAG 2.1 AA compliance automation
 * Provides automated accessibility checking, fixes, and optimization
 */

import { z } from 'zod'
import * as axe from 'axe-core'
import { JSDOM } from 'jsdom'
import Color from 'color'
import { logger } from '../utils/logger.js'
import type {
  AccessibilityReport,
  AccessibilityRule,
  AccessibilityFix,
  ColorContrastResult,
  KeyboardNavigationReport,
  ScreenReaderReport,
  AccessibilityMetrics,
  WCAGLevel,
  AccessibilityGuideline,
} from '../types/accessibility.js'

// Validation schemas
const AccessibilityCheckSchema = z.object({
  html: z.string(),
  css: z.string().optional(),
  options: z.object({
    wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
    includeRules: z.array(z.string()).optional(),
    excludeRules: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
})

const ColorContrastCheckSchema = z.object({
  foreground: z.string(), // Hex color
  background: z.string(), // Hex color
  fontSize: z.number().optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
})

export class AccessibilityAssistant {
  private wcagGuidelines: Map<string, AccessibilityGuideline> = new Map()
  private customRules: Map<string, AccessibilityRule> = new Map()
  private autoFixStrategies: Map<string, (element: any) => AccessibilityFix[]> = new Map()

  constructor() {
    this.initializeWCAGGuidelines()
    this.initializeAutoFixStrategies()
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Accessibility Assistant')
    
    // Configure axe-core with WCAG 2.1 AA rules
    axe.configure({
      branding: {
        brand: 'Fine Print AI Accessibility Assistant',
        application: 'design-system-service',
      },
      rules: this.getWCAGRules(),
    })

    logger.info('Accessibility Assistant initialized with WCAG 2.1 AA compliance')
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test basic functionality
      const testResult = await this.checkColorContrast('#000000', '#ffffff')
      return testResult.passes
    } catch {
      return false
    }
  }

  // ===== COMPREHENSIVE ACCESSIBILITY AUDIT =====

  async auditAccessibility(request: {
    html: string
    css?: string
    options?: {
      wcagLevel?: WCAGLevel
      includeRules?: string[]
      excludeRules?: string[]
      tags?: string[]
    }
  }): Promise<AccessibilityReport> {
    const validated = AccessibilityCheckSchema.parse(request)
    
    logger.info({ wcagLevel: validated.options?.wcagLevel }, 'Starting accessibility audit')

    try {
      // Create DOM environment
      const dom = new JSDOM(validated.html, {
        runScripts: 'dangerously',
        resources: 'usable',
      })
      
      const { window } = dom
      global.window = window as any
      global.document = window.document

      // Inject CSS if provided
      if (validated.css) {
        const style = window.document.createElement('style')
        style.textContent = validated.css
        window.document.head.appendChild(style)
      }

      // Configure axe for this audit
      const axeConfig = this.buildAxeConfig(validated.options)
      
      // Run axe audit
      const axeResults = await axe.run(window.document, axeConfig)
      
      // Generate comprehensive report
      const report = await this.generateAccessibilityReport(axeResults, validated.options)
      
      // Add automated fixes
      report.automatedFixes = await this.generateAutomatedFixes(axeResults.violations)
      
      // Calculate accessibility score
      report.accessibilityScore = this.calculateAccessibilityScore(axeResults)
      
      // Add WCAG compliance status
      report.wcagCompliance = this.assessWCAGCompliance(axeResults, validated.options?.wcagLevel || 'AA')

      logger.info({ 
        score: report.accessibilityScore,
        violations: report.violations.length,
        wcagLevel: validated.options?.wcagLevel 
      }, 'Accessibility audit completed')

      return report
      
    } catch (error) {
      logger.error(error, 'Failed to perform accessibility audit')
      throw new Error(`Accessibility audit failed: ${error.message}`)
    }
  }

  // ===== COLOR CONTRAST ANALYSIS =====

  async checkColorContrast(
    foreground: string,
    background: string,
    fontSize?: number,
    fontWeight?: 'normal' | 'bold',
    wcagLevel: WCAGLevel = 'AA'
  ): Promise<ColorContrastResult> {
    const validated = ColorContrastCheckSchema.parse({
      foreground,
      background,
      fontSize,
      fontWeight,
      wcagLevel,
    })

    try {
      const fgColor = Color(validated.foreground)
      const bgColor = Color(validated.background)
      
      const contrastRatio = fgColor.contrast(bgColor)
      
      // Determine if it's large text (18pt or 14pt bold)
      const isLargeText = (fontSize && fontSize >= 18) || 
                         (fontSize && fontSize >= 14 && fontWeight === 'bold')
      
      // WCAG contrast requirements
      const requirements = this.getContrastRequirements(wcagLevel, isLargeText)
      
      const passes = contrastRatio >= requirements.minimum
      const passesEnhanced = contrastRatio >= requirements.enhanced

      const result: ColorContrastResult = {
        foreground: validated.foreground,
        background: validated.background,
        contrastRatio,
        passes,
        passesEnhanced,
        wcagLevel,
        isLargeText,
        requirements,
        suggestions: passes ? [] : await this.generateContrastSuggestions(
          fgColor, 
          bgColor, 
          requirements.minimum
        ),
        generatedAt: new Date(),
      }

      return result
    } catch (error) {
      logger.error(error, 'Failed to check color contrast')
      throw new Error(`Color contrast check failed: ${error.message}`)
    }
  }

  async analyzeColorPalette(colors: string[]): Promise<{
    combinations: ColorContrastResult[]
    recommendations: string[]
  }> {
    const combinations: ColorContrastResult[] = []
    const recommendations: string[] = []

    // Check all possible color combinations
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const fgResult = await this.checkColorContrast(colors[i], colors[j])
        const bgResult = await this.checkColorContrast(colors[j], colors[i])
        
        combinations.push(fgResult, bgResult)
      }
    }

    // Generate recommendations
    const failingCombinations = combinations.filter(c => !c.passes)
    if (failingCombinations.length > 0) {
      recommendations.push(
        `${failingCombinations.length} color combinations fail WCAG contrast requirements`
      )
      
      const worstContrast = Math.min(...failingCombinations.map(c => c.contrastRatio))
      recommendations.push(
        `Worst contrast ratio: ${worstContrast.toFixed(2)}:1 (minimum required: 4.5:1)`
      )
    }

    return { combinations, recommendations }
  }

  // ===== KEYBOARD NAVIGATION ANALYSIS =====

  async analyzeKeyboardNavigation(html: string): Promise<KeyboardNavigationReport> {
    const dom = new JSDOM(html)
    const document = dom.window.document

    const report: KeyboardNavigationReport = {
      focusableElements: [],
      tabOrder: [],
      issues: [],
      recommendations: [],
      score: 0,
      generatedAt: new Date(),
    }

    // Find all potentially focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'audio[controls]',
      'video[controls]',
    ]

    const elements = document.querySelectorAll(focusableSelectors.join(', '))
    
    elements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      const role = element.getAttribute('role')
      const ariaLabel = element.getAttribute('aria-label')
      const tabIndex = element.getAttribute('tabindex')
      const id = element.getAttribute('id')
      const className = element.getAttribute('class')

      const focusableElement = {
        tagName,
        role,
        ariaLabel,
        tabIndex: tabIndex ? parseInt(tabIndex) : 0,
        id,
        className,
        position: index,
        hasVisibleFocus: this.hasVisibleFocusIndicator(element),
        isAccessible: this.isElementAccessible(element),
      }

      report.focusableElements.push(focusableElement)
    })

    // Analyze tab order
    report.tabOrder = this.analyzeTabOrder(report.focusableElements)
    
    // Identify issues
    report.issues = this.identifyKeyboardIssues(report.focusableElements)
    
    // Generate recommendations
    report.recommendations = this.generateKeyboardRecommendations(report.issues)
    
    // Calculate score
    report.score = this.calculateKeyboardScore(report.focusableElements, report.issues)

    return report
  }

  // ===== SCREEN READER OPTIMIZATION =====

  async analyzeScreenReaderSupport(html: string): Promise<ScreenReaderReport> {
    const dom = new JSDOM(html)
    const document = dom.window.document

    const report: ScreenReaderReport = {
      headingStructure: [],
      landmarks: [],
      ariaUsage: [],
      issues: [],
      recommendations: [],
      score: 0,
      generatedAt: new Date(),
    }

    // Analyze heading structure
    report.headingStructure = this.analyzeHeadingStructure(document)
    
    // Analyze landmarks
    report.landmarks = this.analyzeLandmarks(document)
    
    // Analyze ARIA usage
    report.ariaUsage = this.analyzeAriaUsage(document)
    
    // Identify issues
    report.issues = this.identifyScreenReaderIssues(
      report.headingStructure,
      report.landmarks,
      report.ariaUsage
    )
    
    // Generate recommendations
    report.recommendations = this.generateScreenReaderRecommendations(report.issues)
    
    // Calculate score
    report.score = this.calculateScreenReaderScore(report.issues)

    return report
  }

  // ===== AUTOMATED FIXES =====

  async generateAutomatedFixes(violations: any[]): Promise<AccessibilityFix[]> {
    const fixes: AccessibilityFix[] = []

    for (const violation of violations) {
      const ruleId = violation.id
      const fixStrategy = this.autoFixStrategies.get(ruleId)
      
      if (fixStrategy) {
        for (const node of violation.nodes) {
          const elementFixes = fixStrategy(node)
          fixes.push(...elementFixes)
        }
      } else {
        // Generate generic fix suggestions
        fixes.push({
          id: `fix_${ruleId}_${Date.now()}`,
          ruleId,
          severity: violation.impact,
          element: {
            selector: violation.nodes[0]?.target?.[0] || 'unknown',
            html: violation.nodes[0]?.html || '',
          },
          issue: violation.description,
          fixType: 'manual',
          description: violation.help,
          implementation: {
            manual: this.generateManualFixInstructions(violation),
          },
          wcagReference: this.getWCAGReference(ruleId),
          confidence: 0.5,
        })
      }
    }

    return fixes
  }

  async applyAutomatedFixes(html: string, fixes: AccessibilityFix[]): Promise<string> {
    const dom = new JSDOM(html)
    const document = dom.window.document

    let appliedFixes = 0

    for (const fix of fixes) {
      if (fix.fixType === 'automatic' && fix.implementation.code) {
        try {
          const element = document.querySelector(fix.element.selector)
          if (element) {
            // Apply the fix based on the fix type
            switch (fix.implementation.type) {
              case 'setAttribute':
                element.setAttribute(
                  fix.implementation.code.attribute,
                  fix.implementation.code.value
                )
                appliedFixes++
                break
                
              case 'addElement':
                const newElement = document.createElement(fix.implementation.code.tagName)
                newElement.innerHTML = fix.implementation.code.content
                element.insertAdjacentElement('afterend', newElement)
                appliedFixes++
                break
                
              case 'modifyContent':
                element.innerHTML = fix.implementation.code.content
                appliedFixes++
                break
            }
          }
        } catch (error) {
          logger.warn(error, `Failed to apply automated fix: ${fix.id}`)
        }
      }
    }

    logger.info({ appliedFixes, totalFixes: fixes.length }, 'Applied automated accessibility fixes')
    return dom.serialize()
  }

  // ===== WCAG COMPLIANCE ASSESSMENT =====

  private assessWCAGCompliance(axeResults: any, wcagLevel: WCAGLevel): {
    level: WCAGLevel
    compliant: boolean
    violationsByLevel: Record<WCAGLevel, number>
    missingCriteria: string[]
  } {
    const violationsByLevel: Record<WCAGLevel, number> = { A: 0, AA: 0, AAA: 0 }
    const missingCriteria: string[] = []

    // Count violations by WCAG level
    axeResults.violations.forEach((violation: any) => {
      violation.tags.forEach((tag: string) => {
        if (tag.startsWith('wcag')) {
          const level = this.extractWCAGLevel(tag)
          if (level) {
            violationsByLevel[level]++
            missingCriteria.push(`${violation.id} (${level})`)
          }
        }
      })
    })

    // Determine compliance based on target level
    let compliant = true
    switch (wcagLevel) {
      case 'AAA':
        compliant = violationsByLevel.AAA === 0
        // fall through
      case 'AA':
        compliant = compliant && violationsByLevel.AA === 0
        // fall through
      case 'A':
        compliant = compliant && violationsByLevel.A === 0
        break
    }

    return {
      level: wcagLevel,
      compliant,
      violationsByLevel,
      missingCriteria: [...new Set(missingCriteria)],
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private initializeWCAGGuidelines(): void {
    // Initialize WCAG 2.1 guidelines
    const guidelines: AccessibilityGuideline[] = [
      {
        id: 'perceivable',
        name: 'Perceivable',
        description: 'Information and user interface components must be presentable to users in ways they can perceive.',
        principles: [
          '1.1 Text Alternatives',
          '1.2 Time-based Media',
          '1.3 Adaptable',
          '1.4 Distinguishable',
        ],
      },
      {
        id: 'operable',
        name: 'Operable',
        description: 'User interface components and navigation must be operable.',
        principles: [
          '2.1 Keyboard Accessible',
          '2.2 Enough Time',
          '2.3 Seizures and Physical Reactions',
          '2.4 Navigable',
          '2.5 Input Modalities',
        ],
      },
      {
        id: 'understandable',
        name: 'Understandable',
        description: 'Information and the operation of user interface must be understandable.',
        principles: [
          '3.1 Readable',
          '3.2 Predictable',
          '3.3 Input Assistance',
        ],
      },
      {
        id: 'robust',
        name: 'Robust',
        description: 'Content must be robust enough that it can be interpreted reliably by a wide variety of user agents.',
        principles: [
          '4.1 Compatible',
        ],
      },
    ]

    guidelines.forEach(guideline => {
      this.wcagGuidelines.set(guideline.id, guideline)
    })
  }

  private initializeAutoFixStrategies(): void {
    // Image alt text
    this.autoFixStrategies.set('image-alt', (node) => [{
      id: `fix_image_alt_${Date.now()}`,
      ruleId: 'image-alt',
      severity: 'serious',
      element: {
        selector: node.target[0],
        html: node.html,
      },
      issue: 'Images must have alternate text',
      fixType: 'automatic',
      description: 'Add alt attribute to image',
      implementation: {
        type: 'setAttribute',
        code: {
          attribute: 'alt',
          value: 'Descriptive text for this image',
        },
      },
      wcagReference: '1.1.1 Non-text Content',
      confidence: 0.8,
    }])

    // Form labels
    this.autoFixStrategies.set('label', (node) => [{
      id: `fix_label_${Date.now()}`,
      ruleId: 'label',
      severity: 'serious',
      element: {
        selector: node.target[0],
        html: node.html,
      },
      issue: 'Form elements must have labels',
      fixType: 'automatic',
      description: 'Add aria-label to form element',
      implementation: {
        type: 'setAttribute',
        code: {
          attribute: 'aria-label',
          value: 'Input field label',
        },
      },
      wcagReference: '1.3.1 Info and Relationships',
      confidence: 0.7,
    }])

    // Color contrast (requires manual intervention)
    this.autoFixStrategies.set('color-contrast', (node) => [{
      id: `fix_color_contrast_${Date.now()}`,
      ruleId: 'color-contrast',
      severity: 'serious',
      element: {
        selector: node.target[0],
        html: node.html,
      },
      issue: 'Elements must have sufficient color contrast',
      fixType: 'manual',
      description: 'Adjust foreground or background colors to meet contrast requirements',
      implementation: {
        manual: 'Use a color contrast analyzer to find colors that meet WCAG AA requirements (4.5:1 for normal text, 3:1 for large text)',
      },
      wcagReference: '1.4.3 Contrast (Minimum)',
      confidence: 0.9,
    }])
  }

  private buildAxeConfig(options?: any): any {
    const config: any = {
      rules: {},
      tags: options?.tags || ['wcag2a', 'wcag2aa', 'wcag21aa'],
    }

    // Include/exclude specific rules
    if (options?.includeRules) {
      options.includeRules.forEach((rule: string) => {
        config.rules[rule] = { enabled: true }
      })
    }

    if (options?.excludeRules) {
      options.excludeRules.forEach((rule: string) => {
        config.rules[rule] = { enabled: false }
      })
    }

    return config
  }

  private async generateAccessibilityReport(
    axeResults: any,
    options?: any
  ): Promise<AccessibilityReport> {
    return {
      id: `report_${Date.now()}`,
      timestamp: new Date(),
      wcagLevel: options?.wcagLevel || 'AA',
      violations: axeResults.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map((n: any) => ({
          html: n.html,
          target: n.target,
          failureSummary: n.failureSummary,
        })),
      })),
      passes: axeResults.passes.length,
      inapplicable: axeResults.inapplicable.length,
      incomplete: axeResults.incomplete.length,
      accessibilityScore: 0, // Will be calculated
      wcagCompliance: {
        level: options?.wcagLevel || 'AA',
        compliant: false,
        violationsByLevel: { A: 0, AA: 0, AAA: 0 },
        missingCriteria: [],
      },
      automatedFixes: [],
      recommendations: [],
    }
  }

  private calculateAccessibilityScore(axeResults: any): number {
    const total = axeResults.violations.length + axeResults.passes.length
    if (total === 0) return 100

    const passed = axeResults.passes.length
    const weightedViolations = axeResults.violations.reduce((sum: number, v: any) => {
      const weight = v.impact === 'critical' ? 4 : v.impact === 'serious' ? 3 : v.impact === 'moderate' ? 2 : 1
      return sum + weight
    }, 0)

    const maxPossibleScore = total * 4 // Assuming all could be critical
    const actualScore = passed * 4 - weightedViolations
    
    return Math.max(0, Math.round((actualScore / maxPossibleScore) * 100))
  }

  private getContrastRequirements(wcagLevel: WCAGLevel, isLargeText: boolean) {
    if (wcagLevel === 'AAA') {
      return {
        minimum: isLargeText ? 4.5 : 7,
        enhanced: 7,
      }
    }
    
    return {
      minimum: isLargeText ? 3 : 4.5,
      enhanced: isLargeText ? 4.5 : 7,
    }
  }

  private async generateContrastSuggestions(
    fgColor: Color,
    bgColor: Color,
    targetRatio: number
  ): Promise<string[]> {
    const suggestions: string[] = []
    
    // Try darkening foreground
    let darkened = fgColor.darken(0.1)
    while (darkened.contrast(bgColor) < targetRatio && darkened.lightness() > 0.1) {
      darkened = darkened.darken(0.05)
    }
    
    if (darkened.contrast(bgColor) >= targetRatio) {
      suggestions.push(`Darken foreground to ${darkened.hex()}`)
    }
    
    // Try lightening background
    let lightened = bgColor.lighten(0.1)
    while (fgColor.contrast(lightened) < targetRatio && lightened.lightness() < 0.9) {
      lightened = lightened.lighten(0.05)
    }
    
    if (fgColor.contrast(lightened) >= targetRatio) {
      suggestions.push(`Lighten background to ${lightened.hex()}`)
    }
    
    return suggestions
  }

  private getWCAGRules(): any {
    return {
      'color-contrast': { enabled: true },
      'image-alt': { enabled: true },
      'label': { enabled: true },
      'keyboard': { enabled: true },
      'focus-order-semantics': { enabled: true },
      'heading-order': { enabled: true },
      'landmark-one-main': { enabled: true },
      'page-has-heading-one': { enabled: true },
      'region': { enabled: true },
    }
  }

  private extractWCAGLevel(tag: string): WCAGLevel | null {
    if (tag.includes('wcag2a') && !tag.includes('wcag2aa')) return 'A'
    if (tag.includes('wcag2aa') || tag.includes('wcag21aa')) return 'AA'
    if (tag.includes('wcag2aaa') || tag.includes('wcag21aaa')) return 'AAA'
    return null
  }

  private hasVisibleFocusIndicator(element: any): boolean {
    // This would check computed styles for focus indicators
    // Simplified implementation
    return true
  }

  private isElementAccessible(element: any): boolean {
    // Check if element has proper accessibility attributes
    const tagName = element.tagName.toLowerCase()
    const role = element.getAttribute('role')
    const ariaLabel = element.getAttribute('aria-label')
    const alt = element.getAttribute('alt')

    switch (tagName) {
      case 'img':
        return !!alt
      case 'button':
      case 'input':
        return !!(ariaLabel || element.textContent?.trim())
      default:
        return true
    }
  }

  private analyzeTabOrder(elements: any[]): any[] {
    // Sort elements by tab index and DOM order
    return elements.sort((a, b) => {
      if (a.tabIndex !== b.tabIndex) {
        return a.tabIndex - b.tabIndex
      }
      return a.position - b.position
    })
  }

  private identifyKeyboardIssues(elements: any[]): any[] {
    const issues: any[] = []

    elements.forEach(element => {
      if (!element.hasVisibleFocus) {
        issues.push({
          type: 'missing-focus-indicator',
          element: element.tagName,
          severity: 'moderate',
          description: 'Element lacks visible focus indicator',
        })
      }

      if (!element.isAccessible) {
        issues.push({
          type: 'inaccessible-element',
          element: element.tagName,
          severity: 'serious',
          description: 'Element is not accessible via keyboard',
        })
      }
    })

    return issues
  }

  private generateKeyboardRecommendations(issues: any[]): string[] {
    const recommendations: string[] = []
    
    const focusIssues = issues.filter(i => i.type === 'missing-focus-indicator')
    if (focusIssues.length > 0) {
      recommendations.push('Add visible focus indicators to all interactive elements')
    }

    const accessibilityIssues = issues.filter(i => i.type === 'inaccessible-element')
    if (accessibilityIssues.length > 0) {
      recommendations.push('Ensure all interactive elements are keyboard accessible')
    }

    return recommendations
  }

  private calculateKeyboardScore(elements: any[], issues: any[]): number {
    if (elements.length === 0) return 100
    
    const criticalIssues = issues.filter(i => i.severity === 'critical').length
    const seriousIssues = issues.filter(i => i.severity === 'serious').length
    const moderateIssues = issues.filter(i => i.severity === 'moderate').length
    
    const totalDeductions = criticalIssues * 20 + seriousIssues * 10 + moderateIssues * 5
    const maxScore = elements.length * 20
    
    return Math.max(0, Math.round((1 - totalDeductions / maxScore) * 100))
  }

  private analyzeHeadingStructure(document: any): any[] {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    return Array.from(headings).map((heading: any, index) => ({
      level: parseInt(heading.tagName.charAt(1)),
      text: heading.textContent?.trim() || '',
      position: index,
      id: heading.id,
    }))
  }

  private analyzeLandmarks(document: any): any[] {
    const landmarks = document.querySelectorAll('[role], main, nav, header, footer, aside, section')
    return Array.from(landmarks).map((landmark: any) => ({
      role: landmark.getAttribute('role') || landmark.tagName.toLowerCase(),
      label: landmark.getAttribute('aria-label') || landmark.getAttribute('aria-labelledby'),
      id: landmark.id,
    }))
  }

  private analyzeAriaUsage(document: any): any[] {
    const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]')
    return Array.from(ariaElements).map((element: any) => ({
      tagName: element.tagName.toLowerCase(),
      ariaLabel: element.getAttribute('aria-label'),
      ariaLabelledby: element.getAttribute('aria-labelledby'),
      ariaDescribedby: element.getAttribute('aria-describedby'),
      role: element.getAttribute('role'),
    }))
  }

  private identifyScreenReaderIssues(headings: any[], landmarks: any[], ariaUsage: any[]): any[] {
    const issues: any[] = []

    // Check heading structure
    if (headings.length === 0) {
      issues.push({
        type: 'no-headings',
        severity: 'serious',
        description: 'Page has no heading structure',
      })
    } else {
      const h1Count = headings.filter(h => h.level === 1).length
      if (h1Count === 0) {
        issues.push({
          type: 'no-h1',
          severity: 'moderate',
          description: 'Page is missing an h1 heading',
        })
      } else if (h1Count > 1) {
        issues.push({
          type: 'multiple-h1',
          severity: 'moderate',
          description: 'Page has multiple h1 headings',
        })
      }
    }

    // Check landmarks
    const mainLandmarks = landmarks.filter(l => l.role === 'main' || l.role === 'main')
    if (mainLandmarks.length === 0) {
      issues.push({
        type: 'no-main-landmark',
        severity: 'moderate',
        description: 'Page is missing a main landmark',
      })
    }

    return issues
  }

  private generateScreenReaderRecommendations(issues: any[]): string[] {
    const recommendations: string[] = []

    if (issues.some(i => i.type === 'no-headings')) {
      recommendations.push('Add a logical heading structure to the page')
    }

    if (issues.some(i => i.type === 'no-h1')) {
      recommendations.push('Add an h1 heading to identify the main content')
    }

    if (issues.some(i => i.type === 'no-main-landmark')) {
      recommendations.push('Add a main landmark to identify the primary content area')
    }

    return recommendations
  }

  private calculateScreenReaderScore(issues: any[]): number {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length
    const seriousIssues = issues.filter(i => i.severity === 'serious').length
    const moderateIssues = issues.filter(i => i.severity === 'moderate').length
    
    const totalDeductions = criticalIssues * 30 + seriousIssues * 20 + moderateIssues * 10
    
    return Math.max(0, 100 - totalDeductions)
  }

  private generateManualFixInstructions(violation: any): string {
    const ruleId = violation.id
    const instructions: Record<string, string> = {
      'color-contrast': 'Adjust the foreground or background color to meet WCAG contrast requirements. Use a color contrast analyzer tool.',
      'image-alt': 'Add descriptive alt text to the image that conveys its purpose and content.',
      'label': 'Associate form controls with descriptive labels using the for attribute or wrap them in label elements.',
      'keyboard': 'Ensure all interactive elements are accessible via keyboard navigation.',
      'heading-order': 'Use headings in a logical order (h1, h2, h3, etc.) without skipping levels.',
    }

    return instructions[ruleId] || 'Refer to WCAG guidelines for specific remediation steps.'
  }

  private getWCAGReference(ruleId: string): string {
    const references: Record<string, string> = {
      'color-contrast': '1.4.3 Contrast (Minimum)',
      'image-alt': '1.1.1 Non-text Content',
      'label': '1.3.1 Info and Relationships',
      'keyboard': '2.1.1 Keyboard',
      'heading-order': '1.3.1 Info and Relationships',
    }

    return references[ruleId] || 'WCAG 2.1 Guidelines'
  }
}