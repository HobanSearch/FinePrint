import { z } from 'zod';
import * as axe from 'axe-core';
import { JSDOM } from 'jsdom';
import Color from 'color';
import { logger } from '../utils/logger.js';
const AccessibilityCheckSchema = z.object({
    html: z.string(),
    css: z.string().optional(),
    options: z.object({
        wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
        includeRules: z.array(z.string()).optional(),
        excludeRules: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
    }).optional(),
});
const ColorContrastCheckSchema = z.object({
    foreground: z.string(),
    background: z.string(),
    fontSize: z.number().optional(),
    fontWeight: z.enum(['normal', 'bold']).optional(),
    wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
});
export class AccessibilityAssistant {
    wcagGuidelines = new Map();
    customRules = new Map();
    autoFixStrategies = new Map();
    constructor() {
        this.initializeWCAGGuidelines();
        this.initializeAutoFixStrategies();
    }
    async initialize() {
        logger.info('Initializing Accessibility Assistant');
        axe.configure({
            branding: {
                brand: 'Fine Print AI Accessibility Assistant',
                application: 'design-system-service',
            },
            rules: this.getWCAGRules(),
        });
        logger.info('Accessibility Assistant initialized with WCAG 2.1 AA compliance');
    }
    async healthCheck() {
        try {
            const testResult = await this.checkColorContrast('#000000', '#ffffff');
            return testResult.passes;
        }
        catch {
            return false;
        }
    }
    async auditAccessibility(request) {
        const validated = AccessibilityCheckSchema.parse(request);
        logger.info({ wcagLevel: validated.options?.wcagLevel }, 'Starting accessibility audit');
        try {
            const dom = new JSDOM(validated.html, {
                runScripts: 'dangerously',
                resources: 'usable',
            });
            const { window } = dom;
            global.window = window;
            global.document = window.document;
            if (validated.css) {
                const style = window.document.createElement('style');
                style.textContent = validated.css;
                window.document.head.appendChild(style);
            }
            const axeConfig = this.buildAxeConfig(validated.options);
            const axeResults = await axe.run(window.document, axeConfig);
            const report = await this.generateAccessibilityReport(axeResults, validated.options);
            report.automatedFixes = await this.generateAutomatedFixes(axeResults.violations);
            report.accessibilityScore = this.calculateAccessibilityScore(axeResults);
            report.wcagCompliance = this.assessWCAGCompliance(axeResults, validated.options?.wcagLevel || 'AA');
            logger.info({
                score: report.accessibilityScore,
                violations: report.violations.length,
                wcagLevel: validated.options?.wcagLevel
            }, 'Accessibility audit completed');
            return report;
        }
        catch (error) {
            logger.error(error, 'Failed to perform accessibility audit');
            throw new Error(`Accessibility audit failed: ${error.message}`);
        }
    }
    async checkColorContrast(foreground, background, fontSize, fontWeight, wcagLevel = 'AA') {
        const validated = ColorContrastCheckSchema.parse({
            foreground,
            background,
            fontSize,
            fontWeight,
            wcagLevel,
        });
        try {
            const fgColor = Color(validated.foreground);
            const bgColor = Color(validated.background);
            const contrastRatio = fgColor.contrast(bgColor);
            const isLargeText = (fontSize && fontSize >= 18) ||
                (fontSize && fontSize >= 14 && fontWeight === 'bold');
            const requirements = this.getContrastRequirements(wcagLevel, isLargeText);
            const passes = contrastRatio >= requirements.minimum;
            const passesEnhanced = contrastRatio >= requirements.enhanced;
            const result = {
                foreground: validated.foreground,
                background: validated.background,
                contrastRatio,
                passes,
                passesEnhanced,
                wcagLevel,
                isLargeText,
                requirements,
                suggestions: passes ? [] : await this.generateContrastSuggestions(fgColor, bgColor, requirements.minimum),
                generatedAt: new Date(),
            };
            return result;
        }
        catch (error) {
            logger.error(error, 'Failed to check color contrast');
            throw new Error(`Color contrast check failed: ${error.message}`);
        }
    }
    async analyzeColorPalette(colors) {
        const combinations = [];
        const recommendations = [];
        for (let i = 0; i < colors.length; i++) {
            for (let j = i + 1; j < colors.length; j++) {
                const fgResult = await this.checkColorContrast(colors[i], colors[j]);
                const bgResult = await this.checkColorContrast(colors[j], colors[i]);
                combinations.push(fgResult, bgResult);
            }
        }
        const failingCombinations = combinations.filter(c => !c.passes);
        if (failingCombinations.length > 0) {
            recommendations.push(`${failingCombinations.length} color combinations fail WCAG contrast requirements`);
            const worstContrast = Math.min(...failingCombinations.map(c => c.contrastRatio));
            recommendations.push(`Worst contrast ratio: ${worstContrast.toFixed(2)}:1 (minimum required: 4.5:1)`);
        }
        return { combinations, recommendations };
    }
    async analyzeKeyboardNavigation(html) {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const report = {
            focusableElements: [],
            tabOrder: [],
            issues: [],
            recommendations: [],
            score: 0,
            generatedAt: new Date(),
        };
        const focusableSelectors = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
            'audio[controls]',
            'video[controls]',
        ];
        const elements = document.querySelectorAll(focusableSelectors.join(', '));
        elements.forEach((element, index) => {
            const tagName = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const ariaLabel = element.getAttribute('aria-label');
            const tabIndex = element.getAttribute('tabindex');
            const id = element.getAttribute('id');
            const className = element.getAttribute('class');
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
            };
            report.focusableElements.push(focusableElement);
        });
        report.tabOrder = this.analyzeTabOrder(report.focusableElements);
        report.issues = this.identifyKeyboardIssues(report.focusableElements);
        report.recommendations = this.generateKeyboardRecommendations(report.issues);
        report.score = this.calculateKeyboardScore(report.focusableElements, report.issues);
        return report;
    }
    async analyzeScreenReaderSupport(html) {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const report = {
            headingStructure: [],
            landmarks: [],
            ariaUsage: [],
            issues: [],
            recommendations: [],
            score: 0,
            generatedAt: new Date(),
        };
        report.headingStructure = this.analyzeHeadingStructure(document);
        report.landmarks = this.analyzeLandmarks(document);
        report.ariaUsage = this.analyzeAriaUsage(document);
        report.issues = this.identifyScreenReaderIssues(report.headingStructure, report.landmarks, report.ariaUsage);
        report.recommendations = this.generateScreenReaderRecommendations(report.issues);
        report.score = this.calculateScreenReaderScore(report.issues);
        return report;
    }
    async generateAutomatedFixes(violations) {
        const fixes = [];
        for (const violation of violations) {
            const ruleId = violation.id;
            const fixStrategy = this.autoFixStrategies.get(ruleId);
            if (fixStrategy) {
                for (const node of violation.nodes) {
                    const elementFixes = fixStrategy(node);
                    fixes.push(...elementFixes);
                }
            }
            else {
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
                });
            }
        }
        return fixes;
    }
    async applyAutomatedFixes(html, fixes) {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        let appliedFixes = 0;
        for (const fix of fixes) {
            if (fix.fixType === 'automatic' && fix.implementation.code) {
                try {
                    const element = document.querySelector(fix.element.selector);
                    if (element) {
                        switch (fix.implementation.type) {
                            case 'setAttribute':
                                element.setAttribute(fix.implementation.code.attribute, fix.implementation.code.value);
                                appliedFixes++;
                                break;
                            case 'addElement':
                                const newElement = document.createElement(fix.implementation.code.tagName);
                                newElement.innerHTML = fix.implementation.code.content;
                                element.insertAdjacentElement('afterend', newElement);
                                appliedFixes++;
                                break;
                            case 'modifyContent':
                                element.innerHTML = fix.implementation.code.content;
                                appliedFixes++;
                                break;
                        }
                    }
                }
                catch (error) {
                    logger.warn(error, `Failed to apply automated fix: ${fix.id}`);
                }
            }
        }
        logger.info({ appliedFixes, totalFixes: fixes.length }, 'Applied automated accessibility fixes');
        return dom.serialize();
    }
    assessWCAGCompliance(axeResults, wcagLevel) {
        const violationsByLevel = { A: 0, AA: 0, AAA: 0 };
        const missingCriteria = [];
        axeResults.violations.forEach((violation) => {
            violation.tags.forEach((tag) => {
                if (tag.startsWith('wcag')) {
                    const level = this.extractWCAGLevel(tag);
                    if (level) {
                        violationsByLevel[level]++;
                        missingCriteria.push(`${violation.id} (${level})`);
                    }
                }
            });
        });
        let compliant = true;
        switch (wcagLevel) {
            case 'AAA':
                compliant = violationsByLevel.AAA === 0;
            case 'AA':
                compliant = compliant && violationsByLevel.AA === 0;
            case 'A':
                compliant = compliant && violationsByLevel.A === 0;
                break;
        }
        return {
            level: wcagLevel,
            compliant,
            violationsByLevel,
            missingCriteria: [...new Set(missingCriteria)],
        };
    }
    initializeWCAGGuidelines() {
        const guidelines = [
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
        ];
        guidelines.forEach(guideline => {
            this.wcagGuidelines.set(guideline.id, guideline);
        });
    }
    initializeAutoFixStrategies() {
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
            }]);
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
            }]);
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
            }]);
    }
    buildAxeConfig(options) {
        const config = {
            rules: {},
            tags: options?.tags || ['wcag2a', 'wcag2aa', 'wcag21aa'],
        };
        if (options?.includeRules) {
            options.includeRules.forEach((rule) => {
                config.rules[rule] = { enabled: true };
            });
        }
        if (options?.excludeRules) {
            options.excludeRules.forEach((rule) => {
                config.rules[rule] = { enabled: false };
            });
        }
        return config;
    }
    async generateAccessibilityReport(axeResults, options) {
        return {
            id: `report_${Date.now()}`,
            timestamp: new Date(),
            wcagLevel: options?.wcagLevel || 'AA',
            violations: axeResults.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                help: v.help,
                helpUrl: v.helpUrl,
                tags: v.tags,
                nodes: v.nodes.map((n) => ({
                    html: n.html,
                    target: n.target,
                    failureSummary: n.failureSummary,
                })),
            })),
            passes: axeResults.passes.length,
            inapplicable: axeResults.inapplicable.length,
            incomplete: axeResults.incomplete.length,
            accessibilityScore: 0,
            wcagCompliance: {
                level: options?.wcagLevel || 'AA',
                compliant: false,
                violationsByLevel: { A: 0, AA: 0, AAA: 0 },
                missingCriteria: [],
            },
            automatedFixes: [],
            recommendations: [],
        };
    }
    calculateAccessibilityScore(axeResults) {
        const total = axeResults.violations.length + axeResults.passes.length;
        if (total === 0)
            return 100;
        const passed = axeResults.passes.length;
        const weightedViolations = axeResults.violations.reduce((sum, v) => {
            const weight = v.impact === 'critical' ? 4 : v.impact === 'serious' ? 3 : v.impact === 'moderate' ? 2 : 1;
            return sum + weight;
        }, 0);
        const maxPossibleScore = total * 4;
        const actualScore = passed * 4 - weightedViolations;
        return Math.max(0, Math.round((actualScore / maxPossibleScore) * 100));
    }
    getContrastRequirements(wcagLevel, isLargeText) {
        if (wcagLevel === 'AAA') {
            return {
                minimum: isLargeText ? 4.5 : 7,
                enhanced: 7,
            };
        }
        return {
            minimum: isLargeText ? 3 : 4.5,
            enhanced: isLargeText ? 4.5 : 7,
        };
    }
    async generateContrastSuggestions(fgColor, bgColor, targetRatio) {
        const suggestions = [];
        let darkened = fgColor.darken(0.1);
        while (darkened.contrast(bgColor) < targetRatio && darkened.lightness() > 0.1) {
            darkened = darkened.darken(0.05);
        }
        if (darkened.contrast(bgColor) >= targetRatio) {
            suggestions.push(`Darken foreground to ${darkened.hex()}`);
        }
        let lightened = bgColor.lighten(0.1);
        while (fgColor.contrast(lightened) < targetRatio && lightened.lightness() < 0.9) {
            lightened = lightened.lighten(0.05);
        }
        if (fgColor.contrast(lightened) >= targetRatio) {
            suggestions.push(`Lighten background to ${lightened.hex()}`);
        }
        return suggestions;
    }
    getWCAGRules() {
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
        };
    }
    extractWCAGLevel(tag) {
        if (tag.includes('wcag2a') && !tag.includes('wcag2aa'))
            return 'A';
        if (tag.includes('wcag2aa') || tag.includes('wcag21aa'))
            return 'AA';
        if (tag.includes('wcag2aaa') || tag.includes('wcag21aaa'))
            return 'AAA';
        return null;
    }
    hasVisibleFocusIndicator(element) {
        return true;
    }
    isElementAccessible(element) {
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const ariaLabel = element.getAttribute('aria-label');
        const alt = element.getAttribute('alt');
        switch (tagName) {
            case 'img':
                return !!alt;
            case 'button':
            case 'input':
                return !!(ariaLabel || element.textContent?.trim());
            default:
                return true;
        }
    }
    analyzeTabOrder(elements) {
        return elements.sort((a, b) => {
            if (a.tabIndex !== b.tabIndex) {
                return a.tabIndex - b.tabIndex;
            }
            return a.position - b.position;
        });
    }
    identifyKeyboardIssues(elements) {
        const issues = [];
        elements.forEach(element => {
            if (!element.hasVisibleFocus) {
                issues.push({
                    type: 'missing-focus-indicator',
                    element: element.tagName,
                    severity: 'moderate',
                    description: 'Element lacks visible focus indicator',
                });
            }
            if (!element.isAccessible) {
                issues.push({
                    type: 'inaccessible-element',
                    element: element.tagName,
                    severity: 'serious',
                    description: 'Element is not accessible via keyboard',
                });
            }
        });
        return issues;
    }
    generateKeyboardRecommendations(issues) {
        const recommendations = [];
        const focusIssues = issues.filter(i => i.type === 'missing-focus-indicator');
        if (focusIssues.length > 0) {
            recommendations.push('Add visible focus indicators to all interactive elements');
        }
        const accessibilityIssues = issues.filter(i => i.type === 'inaccessible-element');
        if (accessibilityIssues.length > 0) {
            recommendations.push('Ensure all interactive elements are keyboard accessible');
        }
        return recommendations;
    }
    calculateKeyboardScore(elements, issues) {
        if (elements.length === 0)
            return 100;
        const criticalIssues = issues.filter(i => i.severity === 'critical').length;
        const seriousIssues = issues.filter(i => i.severity === 'serious').length;
        const moderateIssues = issues.filter(i => i.severity === 'moderate').length;
        const totalDeductions = criticalIssues * 20 + seriousIssues * 10 + moderateIssues * 5;
        const maxScore = elements.length * 20;
        return Math.max(0, Math.round((1 - totalDeductions / maxScore) * 100));
    }
    analyzeHeadingStructure(document) {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(headings).map((heading, index) => ({
            level: parseInt(heading.tagName.charAt(1)),
            text: heading.textContent?.trim() || '',
            position: index,
            id: heading.id,
        }));
    }
    analyzeLandmarks(document) {
        const landmarks = document.querySelectorAll('[role], main, nav, header, footer, aside, section');
        return Array.from(landmarks).map((landmark) => ({
            role: landmark.getAttribute('role') || landmark.tagName.toLowerCase(),
            label: landmark.getAttribute('aria-label') || landmark.getAttribute('aria-labelledby'),
            id: landmark.id,
        }));
    }
    analyzeAriaUsage(document) {
        const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]');
        return Array.from(ariaElements).map((element) => ({
            tagName: element.tagName.toLowerCase(),
            ariaLabel: element.getAttribute('aria-label'),
            ariaLabelledby: element.getAttribute('aria-labelledby'),
            ariaDescribedby: element.getAttribute('aria-describedby'),
            role: element.getAttribute('role'),
        }));
    }
    identifyScreenReaderIssues(headings, landmarks, ariaUsage) {
        const issues = [];
        if (headings.length === 0) {
            issues.push({
                type: 'no-headings',
                severity: 'serious',
                description: 'Page has no heading structure',
            });
        }
        else {
            const h1Count = headings.filter(h => h.level === 1).length;
            if (h1Count === 0) {
                issues.push({
                    type: 'no-h1',
                    severity: 'moderate',
                    description: 'Page is missing an h1 heading',
                });
            }
            else if (h1Count > 1) {
                issues.push({
                    type: 'multiple-h1',
                    severity: 'moderate',
                    description: 'Page has multiple h1 headings',
                });
            }
        }
        const mainLandmarks = landmarks.filter(l => l.role === 'main' || l.role === 'main');
        if (mainLandmarks.length === 0) {
            issues.push({
                type: 'no-main-landmark',
                severity: 'moderate',
                description: 'Page is missing a main landmark',
            });
        }
        return issues;
    }
    generateScreenReaderRecommendations(issues) {
        const recommendations = [];
        if (issues.some(i => i.type === 'no-headings')) {
            recommendations.push('Add a logical heading structure to the page');
        }
        if (issues.some(i => i.type === 'no-h1')) {
            recommendations.push('Add an h1 heading to identify the main content');
        }
        if (issues.some(i => i.type === 'no-main-landmark')) {
            recommendations.push('Add a main landmark to identify the primary content area');
        }
        return recommendations;
    }
    calculateScreenReaderScore(issues) {
        const criticalIssues = issues.filter(i => i.severity === 'critical').length;
        const seriousIssues = issues.filter(i => i.severity === 'serious').length;
        const moderateIssues = issues.filter(i => i.severity === 'moderate').length;
        const totalDeductions = criticalIssues * 30 + seriousIssues * 20 + moderateIssues * 10;
        return Math.max(0, 100 - totalDeductions);
    }
    generateManualFixInstructions(violation) {
        const ruleId = violation.id;
        const instructions = {
            'color-contrast': 'Adjust the foreground or background color to meet WCAG contrast requirements. Use a color contrast analyzer tool.',
            'image-alt': 'Add descriptive alt text to the image that conveys its purpose and content.',
            'label': 'Associate form controls with descriptive labels using the for attribute or wrap them in label elements.',
            'keyboard': 'Ensure all interactive elements are accessible via keyboard navigation.',
            'heading-order': 'Use headings in a logical order (h1, h2, h3, etc.) without skipping levels.',
        };
        return instructions[ruleId] || 'Refer to WCAG guidelines for specific remediation steps.';
    }
    getWCAGReference(ruleId) {
        const references = {
            'color-contrast': '1.4.3 Contrast (Minimum)',
            'image-alt': '1.1.1 Non-text Content',
            'label': '1.3.1 Info and Relationships',
            'keyboard': '2.1.1 Keyboard',
            'heading-order': '1.3.1 Info and Relationships',
        };
        return references[ruleId] || 'WCAG 2.1 Guidelines';
    }
}
//# sourceMappingURL=accessibility-assistant.js.map