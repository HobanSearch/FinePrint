"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeGenerationEngine = void 0;
const path_1 = __importDefault(require("path"));
const handlebars_1 = __importDefault(require("handlebars"));
const types_1 = require("@/types");
const template_manager_1 = require("./template-manager");
const quality_assurance_service_1 = require("./quality-assurance-service");
const ai_service_1 = require("./ai-service");
const logger_1 = require("@/utils/logger");
const cache_1 = require("@/utils/cache");
const config_1 = require("@/config");
class CodeGenerationEngine {
    logger = logger_1.Logger.getInstance();
    cache = new cache_1.Cache('code-generation');
    templateManager;
    qualityService;
    aiService;
    constructor() {
        this.templateManager = new template_manager_1.TemplateManager();
        this.qualityService = new quality_assurance_service_1.QualityAssuranceService();
        this.aiService = new ai_service_1.AIService();
        this.initializeHelpers();
    }
    async generateCode(request) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        try {
            this.logger.info(`Starting code generation request: ${requestId}`, { request });
            this.validateRequest(request);
            const cacheKey = this.generateCacheKey(request);
            const cachedResult = await this.cache.get(cacheKey);
            if (cachedResult && this.isCacheValid(cachedResult, request)) {
                this.logger.info(`Returning cached result for request: ${requestId}`);
                return cachedResult;
            }
            const template = await this.selectTemplate(request);
            const context = await this.prepareContext(request, template);
            const generatedFiles = await this.generateFiles(template, context, request);
            const metadata = await this.analyzeCodeMetadata(generatedFiles);
            const qualityScore = await this.assessQuality(generatedFiles, request);
            const recommendations = await this.generateRecommendations(generatedFiles, metadata, qualityScore, request);
            const result = {
                id: requestId,
                request,
                generatedCode: generatedFiles,
                metadata,
                qualityScore,
                recommendations,
                timestamp: new Date(),
            };
            await this.cache.set(cacheKey, result, config_1.config.agent.architecture.decisionCacheTime);
            const processingTime = Date.now() - startTime;
            this.logger.info(`Code generation completed: ${requestId}`, {
                processingTime,
                filesGenerated: generatedFiles.length,
                qualityScore,
            });
            return result;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`Code generation failed: ${requestId}`, {
                error: error.message,
                processingTime,
                request,
            });
            throw error;
        }
    }
    async batchGenerate(requests) {
        const startTime = Date.now();
        try {
            this.logger.info(`Starting batch code generation`, { count: requests.length });
            const concurrency = config_1.config.performance.maxConcurrentGenerations;
            const results = [];
            for (let i = 0; i < requests.length; i += concurrency) {
                const batch = requests.slice(i, i + concurrency);
                const batchResults = await Promise.all(batch.map(request => this.generateCode(request)));
                results.push(...batchResults);
            }
            const processingTime = Date.now() - startTime;
            this.logger.info(`Batch code generation completed`, {
                processingTime,
                requestCount: requests.length,
                totalFiles: results.reduce((sum, r) => sum + r.generatedCode.length, 0),
            });
            return results;
        }
        catch (error) {
            this.logger.error(`Batch code generation failed`, { error: error.message });
            throw error;
        }
    }
    async enhanceCode(existingCode, language, enhancementType, context) {
        try {
            this.logger.info(`Enhancing code`, { language, enhancementType });
            const prompt = this.buildEnhancementPrompt(existingCode, language, enhancementType, context);
            const enhancedCode = await this.aiService.generateCode(prompt, language);
            const changes = await this.detectChanges(existingCode, enhancedCode, language);
            const metrics = await this.calculateCodeMetrics(enhancedCode, language);
            return {
                enhancedCode,
                changes,
                metrics,
            };
        }
        catch (error) {
            this.logger.error(`Code enhancement failed`, { error: error.message });
            throw error;
        }
    }
    async refactorCode(code, language, refactoringPattern, options = {}) {
        try {
            this.logger.info(`Refactoring code`, { language, refactoringPattern });
            let refactoredCode;
            switch (language.toLowerCase()) {
                case 'typescript':
                case 'javascript':
                    refactoredCode = await this.refactorJavaScript(code, refactoringPattern, options);
                    break;
                default:
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
        }
        catch (error) {
            this.logger.error(`Code refactoring failed`, { error: error.message });
            throw error;
        }
    }
    async generateFromDescription(description, framework, language, context) {
        try {
            this.logger.info(`Generating code from description`, { framework, language });
            const structuredRequest = await this.convertDescriptionToRequest(description, framework, language, context);
            return await this.generateCode(structuredRequest);
        }
        catch (error) {
            this.logger.error(`Natural language code generation failed`, { error: error.message });
            throw error;
        }
    }
    validateRequest(request) {
        try {
            types_1.CodeGenerationRequest.parse(request);
        }
        catch (error) {
            throw new Error(`Invalid code generation request: ${error.message}`);
        }
    }
    generateRequestId() {
        return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateCacheKey(request) {
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
    isCacheValid(cachedResult, request) {
        const maxAge = config_1.config.agent.architecture.decisionCacheTime;
        const age = Date.now() - cachedResult.timestamp.getTime();
        return age < maxAge &&
            cachedResult.request.framework === request.framework &&
            cachedResult.request.language === request.language;
    }
    async selectTemplate(request) {
        const templates = await this.templateManager.findTemplates({
            type: request.type,
            framework: request.framework,
            language: request.language,
        });
        if (templates.length === 0) {
            throw new Error(`No suitable template found for ${request.type} in ${request.framework}/${request.language}`);
        }
        return templates.sort((a, b) => {
            const scoreA = a.usage.averageRating * (a.usage.totalUsed + 1);
            const scoreB = b.usage.averageRating * (b.usage.totalUsed + 1);
            return scoreB - scoreA;
        })[0];
    }
    async prepareContext(request, template) {
        const context = {
            projectType: request.context.projectType,
            framework: request.framework,
            language: request.language,
            requirements: request.context.requirements,
            ...this.getTemplateVariableDefaults(template),
            ...await this.enhanceContextWithAI(request),
            ...(request.context.existingCode && {
                existingPatterns: await this.analyzeExistingPatterns(request.context.existingCode),
            }),
            utils: this.getUtilityFunctions(),
            helpers: this.getTemplateHelpers(),
        };
        return context;
    }
    async generateFiles(template, context, request) {
        const files = [];
        for (const templateFile of template.content.files) {
            if (templateFile.conditions && !this.evaluateConditions(templateFile.conditions, context)) {
                continue;
            }
            let content;
            if (templateFile.isTemplate) {
                const compiledTemplate = handlebars_1.default.compile(templateFile.content);
                content = compiledTemplate(context);
            }
            else {
                content = templateFile.content;
            }
            content = await this.postProcessContent(content, request.language, request);
            const file = {
                path: this.processPath(templateFile.path, context),
                content,
                type: this.inferFileType(templateFile.path, request),
                language: this.inferLanguage(templateFile.path, request.language),
                dependencies: await this.extractDependencies(content, request.language),
                description: `Generated ${request.type} file`,
            };
            files.push(file);
        }
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
    async analyzeCodeMetadata(files) {
        let totalLines = 0;
        let totalComplexity = 0;
        const allDependencies = new Set();
        const patterns = new Set();
        for (const file of files) {
            if (file.type === types_1.FileType.SOURCE) {
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
    async assessQuality(files, request) {
        let totalScore = 0;
        let fileCount = 0;
        for (const file of files) {
            if (file.type === types_1.FileType.SOURCE) {
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
    async generateRecommendations(files, metadata, qualityScore, request) {
        const recommendations = [];
        if (qualityScore < config_1.config.agent.quality.minimumScore) {
            recommendations.push(`Quality score (${qualityScore.toFixed(1)}) is below the minimum threshold. Consider reviewing the generated code for improvements.`);
        }
        if (metadata.complexity > 10) {
            recommendations.push('High complexity detected. Consider breaking down complex functions into smaller, more manageable pieces.');
        }
        if (metadata.securityScore < 80) {
            recommendations.push('Security score is low. Review the code for potential security vulnerabilities and follow security best practices.');
        }
        if (metadata.performanceScore < 70) {
            recommendations.push('Performance optimizations may be needed. Consider implementing caching, lazy loading, or other optimization techniques.');
        }
        const frameworkRecommendations = await this.getFrameworkSpecificRecommendations(request.framework, files, metadata);
        recommendations.push(...frameworkRecommendations);
        const aiRecommendations = await this.generateAIRecommendations(files, metadata, request);
        recommendations.push(...aiRecommendations);
        return recommendations;
    }
    initializeHelpers() {
        handlebars_1.default.registerHelper('camelCase', (str) => {
            return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        });
        handlebars_1.default.registerHelper('pascalCase', (str) => {
            return str.replace(/(?:^|-)([a-z])/g, (g) => g.replace('-', '').toUpperCase());
        });
        handlebars_1.default.registerHelper('kebabCase', (str) => {
            return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '');
        });
        handlebars_1.default.registerHelper('snakeCase', (str) => {
            return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
        });
        handlebars_1.default.registerHelper('if_eq', function (a, b, options) {
            return a === b ? options.fn(this) : options.inverse(this);
        });
        handlebars_1.default.registerHelper('if_contains', function (array, item, options) {
            return array && array.includes(item) ? options.fn(this) : options.inverse(this);
        });
        handlebars_1.default.registerHelper('join', (array, separator = ', ') => {
            return Array.isArray(array) ? array.join(separator) : '';
        });
        handlebars_1.default.registerHelper('indent', (text, spaces = 2) => {
            const indentation = ' '.repeat(spaces);
            return text.split('\n').map(line => indentation + line).join('\n');
        });
    }
    getTemplateVariableDefaults(template) {
        const defaults = {};
        template.content.variables.forEach(variable => {
            if (variable.defaultValue !== undefined) {
                defaults[variable.name] = variable.defaultValue;
            }
        });
        return defaults;
    }
    async enhanceContextWithAI(request) {
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
        }
        catch (error) {
            this.logger.warn('AI context enhancement failed', { error: error.message });
            return {};
        }
    }
    async analyzeExistingPatterns(existingCode) {
        return [];
    }
    getUtilityFunctions() {
        return {
            formatDate: (date) => date.toISOString(),
            generateId: () => Math.random().toString(36).substr(2, 9),
            capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
            pluralize: (str) => str.endsWith('s') ? str : str + 's',
        };
    }
    getTemplateHelpers() {
        return {
            importStatement: (module, imports) => {
                return `import { ${imports.join(', ')} } from '${module}';`;
            },
            exportStatement: (name, isDefault = false) => {
                return isDefault ? `export default ${name};` : `export { ${name} };`;
            },
            typeDefinition: (name, properties) => {
                const props = Object.entries(properties)
                    .map(([key, type]) => `  ${key}: ${type};`)
                    .join('\n');
                return `interface ${name} {\n${props}\n}`;
            },
        };
    }
    evaluateConditions(conditions, context) {
        return true;
    }
    async postProcessContent(content, language, request) {
        let processedContent = content;
        switch (language.toLowerCase()) {
            case 'typescript':
            case 'javascript':
                processedContent = await this.postProcessJavaScript(processedContent, request);
                break;
            case 'python':
                processedContent = await this.postProcessPython(processedContent, request);
                break;
        }
        processedContent = await this.formatCode(processedContent, language);
        return processedContent;
    }
    processPath(templatePath, context) {
        const compiledPath = handlebars_1.default.compile(templatePath);
        return compiledPath(context);
    }
    inferFileType(filePath, request) {
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            return types_1.FileType.TEST;
        }
        if (filePath.includes('config') || filePath.endsWith('.config.js') || filePath.endsWith('.json')) {
            return types_1.FileType.CONFIG;
        }
        if (filePath.endsWith('.md') || filePath.includes('README')) {
            return types_1.FileType.DOCUMENTATION;
        }
        if (filePath.includes('schema') || filePath.includes('migration')) {
            return types_1.FileType.SCHEMA;
        }
        return types_1.FileType.SOURCE;
    }
    inferLanguage(filePath, defaultLanguage) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        const languageMap = {
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
    async extractDependencies(content, language) {
        const dependencies = [];
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
    async generateTestFiles(sourceFiles, request) {
        const testFiles = [];
        for (const file of sourceFiles) {
            if (file.type === types_1.FileType.SOURCE) {
                const testContent = await this.generateTestContent(file, request);
                testFiles.push({
                    path: this.getTestPath(file.path),
                    content: testContent,
                    type: types_1.FileType.TEST,
                    language: file.language,
                    dependencies: await this.extractDependencies(testContent, file.language),
                    description: `Test file for ${file.path}`,
                });
            }
        }
        return testFiles;
    }
    async generateDocumentationFiles(files, request) {
        const docFiles = [];
        const readmeContent = await this.generateReadmeContent(files, request);
        docFiles.push({
            path: 'README.md',
            content: readmeContent,
            type: types_1.FileType.DOCUMENTATION,
            language: 'markdown',
            dependencies: [],
            description: 'Project documentation',
        });
        return docFiles;
    }
    async calculateComplexity(code, language) {
        return 1;
    }
    async detectPatterns(code, language) {
        return [];
    }
    async calculateMaintainabilityIndex(files) {
        return 85;
    }
    async calculateSecurityScore(files) {
        return 90;
    }
    async calculatePerformanceScore(files) {
        return 80;
    }
    async getFrameworkSpecificRecommendations(framework, files, metadata) {
        return [];
    }
    async generateAIRecommendations(files, metadata, request) {
        return [];
    }
    async postProcessJavaScript(content, request) {
        return content;
    }
    async postProcessPython(content, request) {
        return content;
    }
    async formatCode(content, language) {
        return content;
    }
    async calculateCodeMetrics(code, language) {
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
    async detectChanges(oldCode, newCode, language) {
        return [];
    }
    buildEnhancementPrompt(code, language, enhancementType, context) {
        return `Enhance the following ${language} code for ${enhancementType}:\n\n${code}`;
    }
    buildRefactoringPrompt(code, language, pattern, options) {
        return `Refactor the following ${language} code using ${pattern} pattern:\n\n${code}`;
    }
    async refactorJavaScript(code, pattern, options) {
        return code;
    }
    async convertDescriptionToRequest(description, framework, language, context) {
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
    async generateTestContent(file, request) {
        return `// Test file for ${file.path}\n// TODO: Implement tests`;
    }
    getTestPath(sourcePath) {
        const dir = path_1.default.dirname(sourcePath);
        const name = path_1.default.basename(sourcePath, path_1.default.extname(sourcePath));
        const ext = path_1.default.extname(sourcePath);
        return path_1.default.join(dir, `${name}.test${ext}`);
    }
    async generateReadmeContent(files, request) {
        return `# ${request.context.projectType}\n\nGenerated code for ${request.type} component.`;
    }
}
exports.CodeGenerationEngine = CodeGenerationEngine;
//# sourceMappingURL=code-generation-engine.js.map