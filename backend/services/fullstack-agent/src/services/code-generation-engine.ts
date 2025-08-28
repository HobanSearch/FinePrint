import { promises as fs } from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import * as esprima from 'esprima';
import * as escodegen from 'escodegen';
import { glob } from 'glob';
import { z } from 'zod';
import {
  CodeGenerationRequest,
  CodeGenerationResult,
  GeneratedCodeFile,
  FileType,
  CodeMetadata,
  Template,
  TemplateVariable,
  QualityCheckType,
} from '@/types';
import { TemplateManager } from './template-manager';
import { QualityAssuranceService } from './quality-assurance-service';
import { AIService } from './ai-service';
import { Logger } from '@/utils/logger';
import { Cache } from '@/utils/cache';
import { config } from '@/config';

export class CodeGenerationEngine {
  private readonly logger = Logger.getInstance();
  private readonly cache = new Cache('code-generation');
  private readonly templateManager: TemplateManager;
  private readonly qualityService: QualityAssuranceService;
  private readonly aiService: AIService;

  constructor() {
    this.templateManager = new TemplateManager();
    this.qualityService = new QualityAssuranceService();
    this.aiService = new AIService();
    this.initializeHelpers();
  }

  /**
   * Generate code based on the provided request
   */
  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      this.logger.info(`Starting code generation request: ${requestId}`, { request });

      // Validate request
      this.validateRequest(request);

      // Check cache for similar requests
      const cacheKey = this.generateCacheKey(request);
      const cachedResult = await this.cache.get<CodeGenerationResult>(cacheKey);
      if (cachedResult && this.isCacheValid(cachedResult, request)) {
        this.logger.info(`Returning cached result for request: ${requestId}`);
        return cachedResult;
      }

      // Select appropriate template
      const template = await this.selectTemplate(request);
      
      // Prepare generation context
      const context = await this.prepareContext(request, template);

      // Generate code files
      const generatedFiles = await this.generateFiles(template, context, request);

      // Analyze code metadata
      const metadata = await this.analyzeCodeMetadata(generatedFiles);

      // Perform quality assessment
      const qualityScore = await this.assessQuality(generatedFiles, request);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        generatedFiles,
        metadata,
        qualityScore,
        request
      );

      const result: CodeGenerationResult = {
        id: requestId,
        request,
        generatedCode: generatedFiles,
        metadata,
        qualityScore,
        recommendations,
        timestamp: new Date(),
      };

      // Cache the result
      await this.cache.set(cacheKey, result, config.agent.architecture.decisionCacheTime);

      const processingTime = Date.now() - startTime;
      this.logger.info(`Code generation completed: ${requestId}`, {
        processingTime,
        filesGenerated: generatedFiles.length,
        qualityScore,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Code generation failed: ${requestId}`, {
        error: error.message,
        processingTime,
        request,
      });
      throw error;
    }
  }

  /**
   * Generate multiple code components in batch
   */
  async batchGenerate(requests: CodeGenerationRequest[]): Promise<CodeGenerationResult[]> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting batch code generation`, { count: requests.length });

      // Process requests in parallel with concurrency limit
      const concurrency = config.performance.maxConcurrentGenerations;
      const results: CodeGenerationResult[] = [];

      for (let i = 0; i < requests.length; i += concurrency) {
        const batch = requests.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(request => this.generateCode(request))
        );
        results.push(...batchResults);
      }

      const processingTime = Date.now() - startTime;
      this.logger.info(`Batch code generation completed`, {
        processingTime,
        requestCount: requests.length,
        totalFiles: results.reduce((sum, r) => sum + r.generatedCode.length, 0),
      });

      return results;

    } catch (error) {
      this.logger.error(`Batch code generation failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Enhance existing code using AI
   */
  async enhanceCode(
    existingCode: string,
    language: string,
    enhancementType: 'performance' | 'security' | 'maintainability' | 'accessibility',
    context?: Record<string, any>
  ): Promise<{
    enhancedCode: string;
    changes: string[];
    metrics: CodeMetadata;
  }> {
    try {
      this.logger.info(`Enhancing code`, { language, enhancementType });

      const prompt = this.buildEnhancementPrompt(existingCode, language, enhancementType, context);
      const enhancedCode = await this.aiService.generateCode(prompt, language);

      // Analyze changes
      const changes = await this.detectChanges(existingCode, enhancedCode, language);
      
      // Calculate metrics
      const metrics = await this.calculateCodeMetrics(enhancedCode, language);

      return {
        enhancedCode,
        changes,
        metrics,
      };

    } catch (error) {
      this.logger.error(`Code enhancement failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Refactor code based on patterns
   */
  async refactorCode(
    code: string,
    language: string,
    refactoringPattern: string,
    options: Record<string, any> = {}
  ): Promise<{
    refactoredCode: string;
    changes: string[];
    impact: {
      complexity: number;
      maintainability: number;
      performance: number;
    };
  }> {
    try {
      this.logger.info(`Refactoring code`, { language, refactoringPattern });

      let refactoredCode: string;

      switch (language.toLowerCase()) {
        case 'typescript':
        case 'javascript':
          refactoredCode = await this.refactorJavaScript(code, refactoringPattern, options);
          break;
        default:
          // Use AI for other languages
          const prompt = this.buildRefactoringPrompt(code, language, refactoringPattern, options);
          refactoredCode = await this.aiService.generateCode(prompt, language);
      }

      const changes = await this.detectChanges(code, refactoredCode, language);
      const originalMetrics = await this.calculateCodeMetrics(code, language);
      const newMetrics = await this.calculateCodeMetrics(refactoredCode, language);

      const impact = {
        complexity: newMetrics.complexity - originalMetrics.complexity,
        maintainability: newMetrics.estimatedMaintainability - originalMetrics.estimatedMaintainability,
        performance: newMetrics.performanceScore - originalMetrics.performanceScore,
      };

      return {
        refactoredCode,
        changes,
        impact,
      };

    } catch (error) {
      this.logger.error(`Code refactoring failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Generate code from natural language description
   */
  async generateFromDescription(
    description: string,
    framework: string,
    language: string,
    context?: Record<string, any>
  ): Promise<CodeGenerationResult> {
    try {
      this.logger.info(`Generating code from description`, { framework, language });

      // Convert description to structured request using AI
      const structuredRequest = await this.convertDescriptionToRequest(
        description,
        framework,
        language,
        context
      );

      // Generate code using structured request
      return await this.generateCode(structuredRequest);

    } catch (error) {
      this.logger.error(`Natural language code generation failed`, { error: error.message });
      throw error;
    }
  }

  // Private Methods

  private validateRequest(request: CodeGenerationRequest): void {
    try {
      CodeGenerationRequest.parse(request);
    } catch (error) {
      throw new Error(`Invalid code generation request: ${error.message}`);
    }
  }

  private generateRequestId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCacheKey(request: CodeGenerationRequest): string {
    const key = JSON.stringify({
      type: request.type,
      framework: request.framework,
      language: request.language,
      requirements: request.context.requirements,
      constraints: request.context.constraints,
      options: request.options,
    });
    return Buffer.from(key).toString('base64');
  }

  private isCacheValid(cachedResult: CodeGenerationResult, request: CodeGenerationRequest): boolean {
    const maxAge = config.agent.architecture.decisionCacheTime;
    const age = Date.now() - cachedResult.timestamp.getTime();
    
    return age < maxAge && 
           cachedResult.request.framework === request.framework &&
           cachedResult.request.language === request.language;
  }

  private async selectTemplate(request: CodeGenerationRequest): Promise<Template> {
    const templates = await this.templateManager.findTemplates({
      type: request.type,
      framework: request.framework,
      language: request.language,
    });

    if (templates.length === 0) {
      throw new Error(`No suitable template found for ${request.type} in ${request.framework}/${request.language}`);
    }

    // Select best template based on rating and compatibility
    return templates.sort((a, b) => {
      const scoreA = a.usage.averageRating * (a.usage.totalUsed + 1);
      const scoreB = b.usage.averageRating * (b.usage.totalUsed + 1);
      return scoreB - scoreA;
    })[0];
  }

  private async prepareContext(
    request: CodeGenerationRequest,
    template: Template
  ): Promise<Record<string, any>> {
    const context: Record<string, any> = {
      // Basic context
      projectType: request.context.projectType,
      framework: request.framework,
      language: request.language,
      requirements: request.context.requirements,
      
      // Template variables with defaults
      ...this.getTemplateVariableDefaults(template),
      
      // AI-enhanced context
      ...await this.enhanceContextWithAI(request),
      
      // Existing code analysis
      ...(request.context.existingCode && {
        existingPatterns: await this.analyzeExistingPatterns(request.context.existingCode),
      }),
      
      // Utility functions
      utils: this.getUtilityFunctions(),
      helpers: this.getTemplateHelpers(),
    };

    return context;
  }

  private async generateFiles(
    template: Template,
    context: Record<string, any>,
    request: CodeGenerationRequest
  ): Promise<GeneratedCodeFile[]> {
    const files: GeneratedCodeFile[] = [];

    for (const templateFile of template.content.files) {
      // Check conditions
      if (templateFile.conditions && !this.evaluateConditions(templateFile.conditions, context)) {
        continue;
      }

      let content: string;
      
      if (templateFile.isTemplate) {
        // Process Handlebars template
        const compiledTemplate = Handlebars.compile(templateFile.content);
        content = compiledTemplate(context);
      } else {
        content = templateFile.content;
      }

      // Apply post-processing
      content = await this.postProcessContent(content, request.language, request);

      const file: GeneratedCodeFile = {
        path: this.processPath(templateFile.path, context),
        content,
        type: this.inferFileType(templateFile.path, request),
        language: this.inferLanguage(templateFile.path, request.language),
        dependencies: await this.extractDependencies(content, request.language),
        description: `Generated ${request.type} file`,
      };

      files.push(file);
    }

    // Generate additional files if requested
    if (request.options?.includeTests) {
      const testFiles = await this.generateTestFiles(files, request);
      files.push(...testFiles);
    }

    if (request.options?.includeDocumentation) {
      const docFiles = await this.generateDocumentationFiles(files, request);
      files.push(...docFiles);
    }

    return files;
  }

  private async analyzeCodeMetadata(files: GeneratedCodeFile[]): Promise<CodeMetadata> {
    let totalLines = 0;
    let totalComplexity = 0;
    const allDependencies = new Set<string>();
    const patterns = new Set<string>();

    for (const file of files) {
      if (file.type === FileType.SOURCE) {
        const lines = file.content.split('\n').length;
        totalLines += lines;

        const complexity = await this.calculateComplexity(file.content, file.language);
        totalComplexity += complexity;

        file.dependencies.forEach(dep => allDependencies.add(dep));

        const filePatterns = await this.detectPatterns(file.content, file.language);
        filePatterns.forEach(pattern => patterns.add(pattern));
      }
    }

    const avgComplexity = files.length > 0 ? totalComplexity / files.length : 0;

    return {
      linesOfCode: totalLines,
      complexity: avgComplexity,
      dependencies: Array.from(allDependencies),
      patterns: Array.from(patterns),
      estimatedMaintainability: await this.calculateMaintainabilityIndex(files),
      securityScore: await this.calculateSecurityScore(files),
      performanceScore: await this.calculatePerformanceScore(files),
    };
  }

  private async assessQuality(
    files: GeneratedCodeFile[],
    request: CodeGenerationRequest
  ): Promise<number> {
    let totalScore = 0;
    let fileCount = 0;

    for (const file of files) {
      if (file.type === FileType.SOURCE) {
        const qualityResult = await this.qualityService.assessCode({
          code: file.content,
          language: file.language,
          context: {
            framework: request.framework,
            projectType: request.context.projectType,
          },
        });

        totalScore += qualityResult.overallScore;
        fileCount++;
      }
    }

    return fileCount > 0 ? totalScore / fileCount : 0;
  }

  private async generateRecommendations(
    files: GeneratedCodeFile[],
    metadata: CodeMetadata,
    qualityScore: number,
    request: CodeGenerationRequest
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Quality-based recommendations
    if (qualityScore < config.agent.quality.minimumScore) {
      recommendations.push(
        `Quality score (${qualityScore.toFixed(1)}) is below the minimum threshold. Consider reviewing the generated code for improvements.`
      );
    }

    // Complexity recommendations
    if (metadata.complexity > 10) {
      recommendations.push(
        'High complexity detected. Consider breaking down complex functions into smaller, more manageable pieces.'
      );
    }

    // Security recommendations
    if (metadata.securityScore < 80) {
      recommendations.push(
        'Security score is low. Review the code for potential security vulnerabilities and follow security best practices.'
      );
    }

    // Performance recommendations
    if (metadata.performanceScore < 70) {
      recommendations.push(
        'Performance optimizations may be needed. Consider implementing caching, lazy loading, or other optimization techniques.'
      );
    }

    // Framework-specific recommendations
    const frameworkRecommendations = await this.getFrameworkSpecificRecommendations(
      request.framework,
      files,
      metadata
    );
    recommendations.push(...frameworkRecommendations);

    // AI-generated recommendations
    const aiRecommendations = await this.generateAIRecommendations(files, metadata, request);
    recommendations.push(...aiRecommendations);

    return recommendations;
  }

  private initializeHelpers(): void {
    // Register Handlebars helpers
    Handlebars.registerHelper('camelCase', (str: string) => {
      return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    });

    Handlebars.registerHelper('pascalCase', (str: string) => {
      return str.replace(/(?:^|-)([a-z])/g, (g) => g.replace('-', '').toUpperCase());
    });

    Handlebars.registerHelper('kebabCase', (str: string) => {
      return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '');
    });

    Handlebars.registerHelper('snakeCase', (str: string) => {
      return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
    });

    Handlebars.registerHelper('if_eq', function(a: any, b: any, options: any) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('if_contains', function(array: any[], item: any, options: any) {
      return array && array.includes(item) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('join', (array: string[], separator: string = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    Handlebars.registerHelper('indent', (text: string, spaces: number = 2) => {
      const indentation = ' '.repeat(spaces);
      return text.split('\n').map(line => indentation + line).join('\n');
    });
  }

  private getTemplateVariableDefaults(template: Template): Record<string, any> {
    const defaults: Record<string, any> = {};
    
    template.content.variables.forEach(variable => {
      if (variable.defaultValue !== undefined) {
        defaults[variable.name] = variable.defaultValue;
      }
    });

    return defaults;
  }

  private async enhanceContextWithAI(request: CodeGenerationRequest): Promise<Record<string, any>> {
    try {
      const prompt = `
        Analyze the following code generation request and provide additional context that would be helpful:
        
        Type: ${request.type}
        Framework: ${request.framework}
        Language: ${request.language}
        Requirements: ${request.context.requirements}
        
        Provide suggestions for:
        1. Component names and structure
        2. Recommended patterns and practices
        3. Dependencies that might be needed
        4. Configuration options
        
        Return as JSON.
      `;

      const aiResponse = await this.aiService.generateContext(prompt);
      return JSON.parse(aiResponse);
    } catch (error) {
      this.logger.warn('AI context enhancement failed', { error: error.message });
      return {};
    }
  }

  private async analyzeExistingPatterns(existingCode: string): Promise<string[]> {
    // This would analyze existing code to detect patterns
    // For now, return empty array
    return [];
  }

  private getUtilityFunctions(): Record<string, Function> {
    return {
      formatDate: (date: Date) => date.toISOString(),
      generateId: () => Math.random().toString(36).substr(2, 9),
      capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
      pluralize: (str: string) => str.endsWith('s') ? str : str + 's',
    };
  }

  private getTemplateHelpers(): Record<string, Function> {
    return {
      importStatement: (module: string, imports: string[]) => {
        return `import { ${imports.join(', ')} } from '${module}';`;
      },
      exportStatement: (name: string, isDefault: boolean = false) => {
        return isDefault ? `export default ${name};` : `export { ${name} };`;
      },
      typeDefinition: (name: string, properties: Record<string, string>) => {
        const props = Object.entries(properties)
          .map(([key, type]) => `  ${key}: ${type};`)
          .join('\n');
        return `interface ${name} {\n${props}\n}`;
      },
    };
  }

  private evaluateConditions(conditions: any[], context: Record<string, any>): boolean {
    // Implement condition evaluation logic
    return true;
  }

  private async postProcessContent(
    content: string,
    language: string,
    request: CodeGenerationRequest
  ): Promise<string> {
    let processedContent = content;

    // Language-specific post-processing
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        processedContent = await this.postProcessJavaScript(processedContent, request);
        break;
      case 'python':
        processedContent = await this.postProcessPython(processedContent, request);
        break;
    }

    // Format code
    processedContent = await this.formatCode(processedContent, language);

    return processedContent;
  }

  private processPath(templatePath: string, context: Record<string, any>): string {
    const compiledPath = Handlebars.compile(templatePath);
    return compiledPath(context);
  }

  private inferFileType(filePath: string, request: CodeGenerationRequest): FileType {
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
      return FileType.TEST;
    }
    if (filePath.includes('config') || filePath.endsWith('.config.js') || filePath.endsWith('.json')) {
      return FileType.CONFIG;
    }
    if (filePath.endsWith('.md') || filePath.includes('README')) {
      return FileType.DOCUMENTATION;
    }
    if (filePath.includes('schema') || filePath.includes('migration')) {
      return FileType.SCHEMA;
    }
    return FileType.SOURCE;
  }

  private inferLanguage(filePath: string, defaultLanguage: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.sql': 'sql',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
      '.md': 'markdown',
    };
    return languageMap[ext] || defaultLanguage;
  }

  private async extractDependencies(content: string, language: string): Promise<string[]> {
    const dependencies: string[] = [];

    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
        const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          dependencies.push(match[1]);
        }
        while ((match = requireRegex.exec(content)) !== null) {
          dependencies.push(match[1]);
        }
        break;

      case 'python':
        const pythonImportRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
        while ((match = pythonImportRegex.exec(content)) !== null) {
          dependencies.push(match[1] || match[2]);
        }
        break;
    }

    return [...new Set(dependencies)];
  }

  private async generateTestFiles(
    sourceFiles: GeneratedCodeFile[],
    request: CodeGenerationRequest
  ): Promise<GeneratedCodeFile[]> {
    const testFiles: GeneratedCodeFile[] = [];

    for (const file of sourceFiles) {
      if (file.type === FileType.SOURCE) {
        const testContent = await this.generateTestContent(file, request);
        
        testFiles.push({
          path: this.getTestPath(file.path),
          content: testContent,
          type: FileType.TEST,
          language: file.language,
          dependencies: await this.extractDependencies(testContent, file.language),
          description: `Test file for ${file.path}`,
        });
      }
    }

    return testFiles;
  }

  private async generateDocumentationFiles(
    files: GeneratedCodeFile[],
    request: CodeGenerationRequest
  ): Promise<GeneratedCodeFile[]> {
    const docFiles: GeneratedCodeFile[] = [];

    // Generate README.md
    const readmeContent = await this.generateReadmeContent(files, request);
    docFiles.push({
      path: 'README.md',
      content: readmeContent,
      type: FileType.DOCUMENTATION,
      language: 'markdown',
      dependencies: [],
      description: 'Project documentation',
    });

    return docFiles;
  }

  // Additional helper methods would continue here...
  // For brevity, I'm including key method signatures

  private async calculateComplexity(code: string, language: string): Promise<number> {
    // Implement complexity calculation
    return 1;
  }

  private async detectPatterns(code: string, language: string): Promise<string[]> {
    // Implement pattern detection
    return [];
  }

  private async calculateMaintainabilityIndex(files: GeneratedCodeFile[]): Promise<number> {
    // Implement maintainability calculation
    return 85;
  }

  private async calculateSecurityScore(files: GeneratedCodeFile[]): Promise<number> {
    // Implement security scoring
    return 90;
  }

  private async calculatePerformanceScore(files: GeneratedCodeFile[]): Promise<number> {
    // Implement performance scoring
    return 80;
  }

  private async getFrameworkSpecificRecommendations(
    framework: string,
    files: GeneratedCodeFile[],
    metadata: CodeMetadata
  ): Promise<string[]> {
    // Implement framework-specific recommendations
    return [];
  }

  private async generateAIRecommendations(
    files: GeneratedCodeFile[],
    metadata: CodeMetadata,
    request: CodeGenerationRequest
  ): Promise<string[]> {
    // Use AI to generate recommendations
    return [];
  }

  private async postProcessJavaScript(content: string, request: CodeGenerationRequest): Promise<string> {
    // JavaScript-specific post-processing
    return content;
  }

  private async postProcessPython(content: string, request: CodeGenerationRequest): Promise<string> {
    // Python-specific post-processing
    return content;
  }

  private async formatCode(content: string, language: string): Promise<string> {
    // Implement code formatting
    return content;
  }

  private async calculateCodeMetrics(code: string, language: string): Promise<CodeMetadata> {
    // Implement comprehensive code metrics calculation
    return {
      linesOfCode: code.split('\n').length,
      complexity: 1,
      dependencies: [],
      patterns: [],
      estimatedMaintainability: 85,
      securityScore: 90,
      performanceScore: 80,
    };
  }

  private async detectChanges(oldCode: string, newCode: string, language: string): Promise<string[]> {
    // Implement change detection
    return [];
  }

  private buildEnhancementPrompt(
    code: string,
    language: string,
    enhancementType: string,
    context?: Record<string, any>
  ): string {
    return `Enhance the following ${language} code for ${enhancementType}:\n\n${code}`;
  }

  private buildRefactoringPrompt(
    code: string,
    language: string,
    pattern: string,
    options: Record<string, any>
  ): string {
    return `Refactor the following ${language} code using ${pattern} pattern:\n\n${code}`;
  }

  private async refactorJavaScript(
    code: string,
    pattern: string,
    options: Record<string, any>
  ): Promise<string> {
    // Implement JavaScript refactoring
    return code;
  }

  private async convertDescriptionToRequest(
    description: string,
    framework: string,
    language: string,
    context?: Record<string, any>
  ): Promise<CodeGenerationRequest> {
    // Use AI to convert natural language to structured request
    const prompt = `
      Convert the following description to a structured code generation request:
      
      Description: ${description}
      Framework: ${framework}
      Language: ${language}
      
      Return as JSON matching the CodeGenerationRequest schema.
    `;

    const aiResponse = await this.aiService.generateStructuredResponse(prompt);
    return JSON.parse(aiResponse);
  }

  private async generateTestContent(file: GeneratedCodeFile, request: CodeGenerationRequest): Promise<string> {
    // Generate test content based on source file
    return `// Test file for ${file.path}\n// TODO: Implement tests`;
  }

  private getTestPath(sourcePath: string): string {
    const dir = path.dirname(sourcePath);
    const name = path.basename(sourcePath, path.extname(sourcePath));
    const ext = path.extname(sourcePath);
    return path.join(dir, `${name}.test${ext}`);
  }

  private async generateReadmeContent(files: GeneratedCodeFile[], request: CodeGenerationRequest): Promise<string> {
    return `# ${request.context.projectType}\n\nGenerated code for ${request.type} component.`;
  }
}