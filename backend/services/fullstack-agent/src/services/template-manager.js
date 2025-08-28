"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const yaml_1 = __importDefault(require("yaml"));
const glob_1 = require("glob");
const archiver_1 = __importDefault(require("archiver"));
const tar_1 = __importDefault(require("tar"));
const types_1 = require("@/types");
const logger_1 = require("@/utils/logger");
const cache_1 = require("@/utils/cache");
const config_1 = require("@/config");
class TemplateManager {
    logger = logger_1.Logger.getInstance();
    cache = new cache_1.Cache('templates');
    templatesPath;
    repositoryPath;
    templates = new Map();
    lastUpdate = null;
    constructor() {
        this.templatesPath = path_1.default.resolve(config_1.config.templates.repositoryUrl.replace('file://', '') || './templates');
        this.repositoryPath = path_1.default.resolve('./template-repository');
        this.initializeTemplates();
    }
    async initializeTemplates() {
        try {
            await fs_1.promises.mkdir(this.templatesPath, { recursive: true });
            await fs_1.promises.mkdir(this.repositoryPath, { recursive: true });
            await this.loadTemplates();
            this.setupPeriodicUpdates();
            this.logger.info('Template manager initialized', {
                templatesPath: this.templatesPath,
                templateCount: this.templates.size,
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize template manager', { error: error.message });
            throw error;
        }
    }
    async findTemplates(criteria) {
        try {
            const cacheKey = `search:${JSON.stringify(criteria)}`;
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            let results = Array.from(this.templates.values());
            if (criteria.type) {
                results = results.filter(t => t.name.toLowerCase().includes(criteria.type.toLowerCase()));
            }
            if (criteria.framework) {
                results = results.filter(t => t.framework.toLowerCase() === criteria.framework.toLowerCase());
            }
            if (criteria.language) {
                results = results.filter(t => t.language.toLowerCase() === criteria.language.toLowerCase());
            }
            if (criteria.category) {
                results = results.filter(t => t.category === criteria.category);
            }
            if (criteria.tags && criteria.tags.length > 0) {
                results = results.filter(t => criteria.tags.some(tag => t.metadata.tags.includes(tag)));
            }
            if (criteria.minRating) {
                results = results.filter(t => t.usage.averageRating >= criteria.minRating);
            }
            results.sort((a, b) => {
                const scoreA = a.usage.averageRating * Math.log(a.usage.totalUsed + 1);
                const scoreB = b.usage.averageRating * Math.log(b.usage.totalUsed + 1);
                return scoreB - scoreA;
            });
            await this.cache.set(cacheKey, results, 300);
            this.logger.info('Template search completed', {
                criteria,
                resultCount: results.length,
            });
            return results;
        }
        catch (error) {
            this.logger.error('Template search failed', { error: error.message, criteria });
            throw error;
        }
    }
    async getTemplate(id) {
        return this.templates.get(id) || null;
    }
    async createTemplate(templateData) {
        try {
            const template = {
                id: this.generateTemplateId(),
                name: templateData.name || 'Untitled Template',
                description: templateData.description || '',
                category: templateData.category || types_1.TemplateCategory.COMPONENT,
                type: templateData.type || types_1.TemplateType.FILE,
                framework: templateData.framework || 'generic',
                language: templateData.language || 'typescript',
                version: '1.0.0',
                content: templateData.content || {
                    files: [],
                    variables: [],
                    hooks: [],
                },
                metadata: {
                    author: 'System',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    tags: templateData.metadata?.tags || [],
                    dependencies: templateData.metadata?.dependencies || [],
                    compatibility: templateData.metadata?.compatibility || [],
                    documentation: templateData.metadata?.documentation || '',
                    examples: templateData.metadata?.examples || [],
                },
                usage: {
                    totalUsed: 0,
                    lastUsed: new Date(),
                    averageRating: 0,
                    feedback: [],
                },
            };
            await this.validateTemplate(template);
            await this.saveTemplate(template);
            this.templates.set(template.id, template);
            this.logger.info('Template created', { templateId: template.id, name: template.name });
            return template;
        }
        catch (error) {
            this.logger.error('Failed to create template', { error: error.message });
            throw error;
        }
    }
    async updateTemplate(id, updates) {
        try {
            const existing = this.templates.get(id);
            if (!existing) {
                throw new Error(`Template with ID ${id} not found`);
            }
            const updated = {
                ...existing,
                ...updates,
                id,
                metadata: {
                    ...existing.metadata,
                    ...updates.metadata,
                    updatedAt: new Date(),
                },
            };
            await this.validateTemplate(updated);
            await this.saveTemplate(updated);
            this.templates.set(id, updated);
            this.logger.info('Template updated', { templateId: id });
            return updated;
        }
        catch (error) {
            this.logger.error('Failed to update template', { error: error.message, templateId: id });
            throw error;
        }
    }
    async deleteTemplate(id) {
        try {
            const template = this.templates.get(id);
            if (!template) {
                throw new Error(`Template with ID ${id} not found`);
            }
            const templatePath = this.getTemplatePath(id);
            await fs_1.promises.rm(templatePath, { recursive: true, force: true });
            this.templates.delete(id);
            await this.cache.clear('search:*');
            this.logger.info('Template deleted', { templateId: id });
        }
        catch (error) {
            this.logger.error('Failed to delete template', { error: error.message, templateId: id });
            throw error;
        }
    }
    async installTemplate(source, options = {}) {
        try {
            this.logger.info('Installing template', { source, options });
            const tempDir = await this.downloadTemplate(source);
            const template = await this.loadTemplateFromDirectory(tempDir);
            if (!options.skipValidation) {
                await this.validateTemplate(template);
            }
            const existing = Array.from(this.templates.values()).find(t => t.name === template.name && t.framework === template.framework);
            if (existing && !options.force) {
                throw new Error(`Template ${template.name} already exists. Use force option to overwrite.`);
            }
            if (!template.id || this.templates.has(template.id)) {
                template.id = this.generateTemplateId();
            }
            if (options.customVariables) {
                template.content.variables = this.mergeVariables(template.content.variables, options.customVariables);
            }
            await this.saveTemplate(template);
            this.templates.set(template.id, template);
            await fs_1.promises.rm(tempDir, { recursive: true, force: true });
            this.logger.info('Template installed successfully', {
                templateId: template.id,
                name: template.name,
            });
            return template;
        }
        catch (error) {
            this.logger.error('Template installation failed', { error: error.message, source });
            throw error;
        }
    }
    async exportTemplate(id, format = 'zip') {
        try {
            const template = this.templates.get(id);
            if (!template) {
                throw new Error(`Template with ID ${id} not found`);
            }
            const templatePath = this.getTemplatePath(id);
            if (format === 'zip') {
                return await this.createZipArchive(templatePath);
            }
            else {
                return await this.createTarArchive(templatePath);
            }
        }
        catch (error) {
            this.logger.error('Template export failed', { error: error.message, templateId: id });
            throw error;
        }
    }
    async recordUsage(id) {
        try {
            const template = this.templates.get(id);
            if (!template) {
                return;
            }
            template.usage.totalUsed++;
            template.usage.lastUsed = new Date();
            await this.saveTemplate(template);
            this.logger.debug('Template usage recorded', { templateId: id });
        }
        catch (error) {
            this.logger.error('Failed to record template usage', { error: error.message, templateId: id });
        }
    }
    async addFeedback(id, userId, rating, comment) {
        try {
            const template = this.templates.get(id);
            if (!template) {
                throw new Error(`Template with ID ${id} not found`);
            }
            if (rating < 1 || rating > 5) {
                throw new Error('Rating must be between 1 and 5');
            }
            const feedback = {
                userId,
                rating,
                comment,
                timestamp: new Date(),
            };
            template.usage.feedback.push(feedback);
            const totalRating = template.usage.feedback.reduce((sum, f) => sum + f.rating, 0);
            template.usage.averageRating = totalRating / template.usage.feedback.length;
            await this.saveTemplate(template);
            this.logger.info('Template feedback added', { templateId: id, rating });
        }
        catch (error) {
            this.logger.error('Failed to add template feedback', { error: error.message, templateId: id });
            throw error;
        }
    }
    async updateTemplates(force = false) {
        try {
            const shouldUpdate = force || this.shouldUpdate();
            if (!shouldUpdate) {
                this.logger.debug('Template update skipped - too recent');
                return;
            }
            this.logger.info('Updating templates from repository');
            await this.syncRepository();
            await this.loadTemplates();
            this.lastUpdate = new Date();
            this.logger.info('Templates updated successfully', {
                templateCount: this.templates.size,
            });
        }
        catch (error) {
            this.logger.error('Template update failed', { error: error.message });
            throw error;
        }
    }
    getStatistics() {
        const templates = Array.from(this.templates.values());
        const categoryCounts = {};
        const frameworkCounts = {};
        const languageCounts = {};
        let totalRating = 0;
        let totalUsage = 0;
        let ratedTemplates = 0;
        templates.forEach(template => {
            categoryCounts[template.category] = (categoryCounts[template.category] || 0) + 1;
            frameworkCounts[template.framework] = (frameworkCounts[template.framework] || 0) + 1;
            languageCounts[template.language] = (languageCounts[template.language] || 0) + 1;
            if (template.usage.averageRating > 0) {
                totalRating += template.usage.averageRating;
                ratedTemplates++;
            }
            totalUsage += template.usage.totalUsed;
        });
        return {
            totalTemplates: templates.length,
            categoryCounts,
            frameworkCounts,
            languageCounts,
            averageRating: ratedTemplates > 0 ? totalRating / ratedTemplates : 0,
            totalUsage,
        };
    }
    async loadTemplates() {
        try {
            this.templates.clear();
            const templateFiles = await (0, glob_1.glob)('**/template.yml', {
                cwd: this.templatesPath,
                absolute: true,
            });
            for (const templateFile of templateFiles) {
                try {
                    const template = await this.loadTemplateFromFile(templateFile);
                    this.templates.set(template.id, template);
                }
                catch (error) {
                    this.logger.warn('Failed to load template', {
                        file: templateFile,
                        error: error.message,
                    });
                }
            }
            this.logger.info('Templates loaded', { count: this.templates.size });
        }
        catch (error) {
            this.logger.error('Failed to load templates', { error: error.message });
            throw error;
        }
    }
    async loadTemplateFromFile(templateFile) {
        const templateDir = path_1.default.dirname(templateFile);
        const templateYml = await fs_1.promises.readFile(templateFile, 'utf-8');
        const templateData = yaml_1.default.parse(templateYml);
        const files = [];
        if (templateData.files) {
            for (const fileConfig of templateData.files) {
                const filePath = path_1.default.join(templateDir, fileConfig.path);
                try {
                    const content = await fs_1.promises.readFile(filePath, 'utf-8');
                    files.push({
                        path: fileConfig.path,
                        content,
                        isTemplate: fileConfig.isTemplate || false,
                        conditions: fileConfig.conditions || [],
                    });
                }
                catch (error) {
                    this.logger.warn('Failed to load template file', {
                        file: filePath,
                        error: error.message,
                    });
                }
            }
        }
        const template = {
            id: templateData.id || this.generateTemplateId(),
            name: templateData.name,
            description: templateData.description || '',
            category: templateData.category || types_1.TemplateCategory.COMPONENT,
            type: templateData.type || types_1.TemplateType.FILE,
            framework: templateData.framework || 'generic',
            language: templateData.language || 'typescript',
            version: templateData.version || '1.0.0',
            content: {
                files,
                variables: templateData.variables || [],
                hooks: templateData.hooks || [],
            },
            metadata: {
                author: templateData.author || 'Unknown',
                createdAt: new Date(templateData.createdAt || Date.now()),
                updatedAt: new Date(templateData.updatedAt || Date.now()),
                tags: templateData.tags || [],
                dependencies: templateData.dependencies || [],
                compatibility: templateData.compatibility || [],
                documentation: templateData.documentation || '',
                examples: templateData.examples || [],
            },
            usage: {
                totalUsed: 0,
                lastUsed: new Date(),
                averageRating: 0,
                feedback: [],
            },
        };
        return template;
    }
    async loadTemplateFromDirectory(directory) {
        const templateFile = path_1.default.join(directory, 'template.yml');
        return await this.loadTemplateFromFile(templateFile);
    }
    async validateTemplate(template) {
        if (!template.name) {
            throw new Error('Template name is required');
        }
        if (!template.content.files || template.content.files.length === 0) {
            throw new Error('Template must have at least one file');
        }
        for (const variable of template.content.variables) {
            if (!variable.name) {
                throw new Error('Template variable must have a name');
            }
            if (!Object.values(types_1.VariableType).includes(variable.type)) {
                throw new Error(`Invalid variable type: ${variable.type}`);
            }
        }
        for (const file of template.content.files) {
            if (!file.path) {
                throw new Error('Template file must have a path');
            }
            if (file.path.includes('..')) {
                throw new Error('Template file paths cannot contain parent directory references');
            }
        }
    }
    async saveTemplate(template) {
        const templatePath = this.getTemplatePath(template.id);
        await fs_1.promises.mkdir(templatePath, { recursive: true });
        const templateYml = yaml_1.default.stringify({
            id: template.id,
            name: template.name,
            description: template.description,
            category: template.category,
            type: template.type,
            framework: template.framework,
            language: template.language,
            version: template.version,
            author: template.metadata.author,
            createdAt: template.metadata.createdAt.toISOString(),
            updatedAt: template.metadata.updatedAt.toISOString(),
            tags: template.metadata.tags,
            dependencies: template.metadata.dependencies,
            compatibility: template.metadata.compatibility,
            documentation: template.metadata.documentation,
            examples: template.metadata.examples,
            variables: template.content.variables,
            hooks: template.content.hooks,
            files: template.content.files.map(f => ({
                path: f.path,
                isTemplate: f.isTemplate,
                conditions: f.conditions,
            })),
        });
        await fs_1.promises.writeFile(path_1.default.join(templatePath, 'template.yml'), templateYml, 'utf-8');
        for (const file of template.content.files) {
            const filePath = path_1.default.join(templatePath, file.path);
            await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await fs_1.promises.writeFile(filePath, file.content, 'utf-8');
        }
    }
    getTemplatePath(id) {
        return path_1.default.join(this.templatesPath, id);
    }
    generateTemplateId() {
        return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    shouldUpdate() {
        if (!this.lastUpdate) {
            return true;
        }
        const timeSinceUpdate = Date.now() - this.lastUpdate.getTime();
        return timeSinceUpdate > config_1.config.templates.updateInterval * 1000;
    }
    async syncRepository() {
        try {
            const repoUrl = config_1.config.templates.repositoryUrl;
            if (repoUrl.startsWith('git') || repoUrl.startsWith('http')) {
                if (await this.directoryExists(this.repositoryPath)) {
                    (0, child_process_1.execSync)('git pull', { cwd: this.repositoryPath, stdio: 'inherit' });
                }
                else {
                    (0, child_process_1.execSync)(`git clone ${repoUrl} ${this.repositoryPath}`, { stdio: 'inherit' });
                }
                await this.copyDirectory(this.repositoryPath, this.templatesPath);
            }
        }
        catch (error) {
            this.logger.error('Repository sync failed', { error: error.message });
            throw error;
        }
    }
    async downloadTemplate(source) {
        const tempDir = path_1.default.join('/tmp', `template_${Date.now()}`);
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        if (source.startsWith('http')) {
            throw new Error('HTTP template download not implemented yet');
        }
        else if (source.startsWith('git')) {
            (0, child_process_1.execSync)(`git clone ${source} ${tempDir}`, { stdio: 'inherit' });
        }
        else {
            await this.copyDirectory(source, tempDir);
        }
        return tempDir;
    }
    async createZipArchive(sourcePath) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
            archive.on('data', chunk => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', reject);
            archive.directory(sourcePath, false);
            archive.finalize();
        });
    }
    async createTarArchive(sourcePath) {
        const chunks = [];
        return new Promise((resolve, reject) => {
            tar_1.default.create({ gzip: true, cwd: path_1.default.dirname(sourcePath) }, [path_1.default.basename(sourcePath)])
                .on('data', chunk => chunks.push(chunk))
                .on('end', () => resolve(Buffer.concat(chunks)))
                .on('error', reject);
        });
    }
    mergeVariables(existing, custom) {
        const merged = [...existing];
        for (const [name, value] of Object.entries(custom)) {
            const existingIndex = merged.findIndex(v => v.name === name);
            if (existingIndex >= 0) {
                merged[existingIndex].defaultValue = value;
            }
            else {
                merged.push({
                    name,
                    type: types_1.VariableType.STRING,
                    description: `Custom variable: ${name}`,
                    required: false,
                    defaultValue: value,
                });
            }
        }
        return merged;
    }
    setupPeriodicUpdates() {
        setInterval(async () => {
            try {
                await this.updateTemplates(false);
            }
            catch (error) {
                this.logger.error('Periodic template update failed', { error: error.message });
            }
        }, config_1.config.templates.updateInterval * 1000);
    }
    async directoryExists(dirPath) {
        try {
            const stats = await fs_1.promises.stat(dirPath);
            return stats.isDirectory();
        }
        catch {
            return false;
        }
    }
    async copyDirectory(source, destination) {
        await fs_1.promises.mkdir(destination, { recursive: true });
        const items = await fs_1.promises.readdir(source);
        for (const item of items) {
            const sourcePath = path_1.default.join(source, item);
            const destPath = path_1.default.join(destination, item);
            const stats = await fs_1.promises.stat(sourcePath);
            if (stats.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            }
            else {
                await fs_1.promises.copyFile(sourcePath, destPath);
            }
        }
    }
}
exports.TemplateManager = TemplateManager;
//# sourceMappingURL=template-manager.js.map