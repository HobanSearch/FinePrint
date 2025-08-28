import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'yaml';
import { glob } from 'glob';
import archiver from 'archiver';
import tar from 'tar';
import {
  Template,
  TemplateCategory,
  TemplateType,
  TemplateContent,
  TemplateFile,
  TemplateVariable,
  TemplateMetadata,
  TemplateUsage,
  TemplateFeedback,
  VariableType,
} from '@/types';
import { Logger } from '@/utils/logger';
import { Cache } from '@/utils/cache';
import { config } from '@/config';

export interface TemplateSearchCriteria {
  type?: string;
  framework?: string;
  language?: string;
  category?: TemplateCategory;
  tags?: string[];
  minRating?: number;
}

export interface TemplateInstallOptions {
  force?: boolean;
  skipValidation?: boolean;
  customVariables?: Record<string, any>;
}

export class TemplateManager {
  private readonly logger = Logger.getInstance();
  private readonly cache = new Cache('templates');
  private readonly templatesPath: string;
  private readonly repositoryPath: string;
  private templates: Map<string, Template> = new Map();
  private lastUpdate: Date | null = null;

  constructor() {
    this.templatesPath = path.resolve(config.templates.repositoryUrl.replace('file://', '') || './templates');
    this.repositoryPath = path.resolve('./template-repository');
    this.initializeTemplates();
  }

  /**
   * Initialize template system
   */
  private async initializeTemplates(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.mkdir(this.templatesPath, { recursive: true });
      await fs.mkdir(this.repositoryPath, { recursive: true });

      // Load templates from local repository
      await this.loadTemplates();

      // Set up periodic updates
      this.setupPeriodicUpdates();

      this.logger.info('Template manager initialized', {
        templatesPath: this.templatesPath,
        templateCount: this.templates.size,
      });
    } catch (error) {
      this.logger.error('Failed to initialize template manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Find templates matching criteria
   */
  async findTemplates(criteria: TemplateSearchCriteria): Promise<Template[]> {
    try {
      const cacheKey = `search:${JSON.stringify(criteria)}`;
      const cached = await this.cache.get<Template[]>(cacheKey);
      if (cached) {
        return cached;
      }

      let results: Template[] = Array.from(this.templates.values());

      // Apply filters
      if (criteria.type) {
        results = results.filter(t => t.name.toLowerCase().includes(criteria.type!.toLowerCase()));
      }

      if (criteria.framework) {
        results = results.filter(t => t.framework.toLowerCase() === criteria.framework!.toLowerCase());
      }

      if (criteria.language) {
        results = results.filter(t => t.language.toLowerCase() === criteria.language!.toLowerCase());
      }

      if (criteria.category) {
        results = results.filter(t => t.category === criteria.category);
      }

      if (criteria.tags && criteria.tags.length > 0) {
        results = results.filter(t => 
          criteria.tags!.some(tag => t.metadata.tags.includes(tag))
        );
      }

      if (criteria.minRating) {
        results = results.filter(t => t.usage.averageRating >= criteria.minRating!);
      }

      // Sort by relevance and rating
      results.sort((a, b) => {
        const scoreA = a.usage.averageRating * Math.log(a.usage.totalUsed + 1);
        const scoreB = b.usage.averageRating * Math.log(b.usage.totalUsed + 1);
        return scoreB - scoreA;
      });

      // Cache results
      await this.cache.set(cacheKey, results, 300); // 5 minutes

      this.logger.info('Template search completed', {
        criteria,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      this.logger.error('Template search failed', { error: error.message, criteria });
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<Template | null> {
    return this.templates.get(id) || null;
  }

  /**
   * Create new template
   */
  async createTemplate(templateData: Partial<Template>): Promise<Template> {
    try {
      const template: Template = {
        id: this.generateTemplateId(),
        name: templateData.name || 'Untitled Template',
        description: templateData.description || '',
        category: templateData.category || TemplateCategory.COMPONENT,
        type: templateData.type || TemplateType.FILE,
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

      // Validate template
      await this.validateTemplate(template);

      // Save template
      await this.saveTemplate(template);

      // Add to memory cache
      this.templates.set(template.id, template);

      this.logger.info('Template created', { templateId: template.id, name: template.name });

      return template;
    } catch (error) {
      this.logger.error('Failed to create template', { error: error.message });
      throw error;
    }
  }

  /**
   * Update existing template
   */
  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    try {
      const existing = this.templates.get(id);
      if (!existing) {
        throw new Error(`Template with ID ${id} not found`);
      }

      const updated: Template = {
        ...existing,
        ...updates,
        id, // Ensure ID doesn't change
        metadata: {
          ...existing.metadata,
          ...updates.metadata,
          updatedAt: new Date(),
        },
      };

      // Validate updated template
      await this.validateTemplate(updated);

      // Save updated template
      await this.saveTemplate(updated);

      // Update memory cache
      this.templates.set(id, updated);

      this.logger.info('Template updated', { templateId: id });

      return updated;
    } catch (error) {
      this.logger.error('Failed to update template', { error: error.message, templateId: id });
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const template = this.templates.get(id);
      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Remove from filesystem
      const templatePath = this.getTemplatePath(id);
      await fs.rm(templatePath, { recursive: true, force: true });

      // Remove from memory
      this.templates.delete(id);

      // Clear related cache entries
      await this.cache.clear('search:*');

      this.logger.info('Template deleted', { templateId: id });
    } catch (error) {
      this.logger.error('Failed to delete template', { error: error.message, templateId: id });
      throw error;
    }
  }

  /**
   * Install template from URL or package
   */
  async installTemplate(
    source: string,
    options: TemplateInstallOptions = {}
  ): Promise<Template> {
    try {
      this.logger.info('Installing template', { source, options });

      // Download and extract template
      const tempDir = await this.downloadTemplate(source);

      // Load template metadata
      const template = await this.loadTemplateFromDirectory(tempDir);

      // Validate template
      if (!options.skipValidation) {
        await this.validateTemplate(template);
      }

      // Check if template already exists
      const existing = Array.from(this.templates.values()).find(
        t => t.name === template.name && t.framework === template.framework
      );

      if (existing && !options.force) {
        throw new Error(`Template ${template.name} already exists. Use force option to overwrite.`);
      }

      // Generate new ID if needed
      if (!template.id || this.templates.has(template.id)) {
        template.id = this.generateTemplateId();
      }

      // Apply custom variables if provided
      if (options.customVariables) {
        template.content.variables = this.mergeVariables(
          template.content.variables,
          options.customVariables
        );
      }

      // Save template
      await this.saveTemplate(template);

      // Add to memory cache
      this.templates.set(template.id, template);

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      this.logger.info('Template installed successfully', {
        templateId: template.id,
        name: template.name,
      });

      return template;
    } catch (error) {
      this.logger.error('Template installation failed', { error: error.message, source });
      throw error;
    }
  }

  /**
   * Export template as package
   */
  async exportTemplate(id: string, format: 'zip' | 'tar' = 'zip'): Promise<Buffer> {
    try {
      const template = this.templates.get(id);
      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      const templatePath = this.getTemplatePath(id);

      if (format === 'zip') {
        return await this.createZipArchive(templatePath);
      } else {
        return await this.createTarArchive(templatePath);
      }
    } catch (error) {
      this.logger.error('Template export failed', { error: error.message, templateId: id });
      throw error;
    }
  }

  /**
   * Record template usage
   */
  async recordUsage(id: string): Promise<void> {
    try {
      const template = this.templates.get(id);
      if (!template) {
        return;
      }

      template.usage.totalUsed++;
      template.usage.lastUsed = new Date();

      // Update in storage
      await this.saveTemplate(template);

      this.logger.debug('Template usage recorded', { templateId: id });
    } catch (error) {
      this.logger.error('Failed to record template usage', { error: error.message, templateId: id });
    }
  }

  /**
   * Add feedback for template
   */
  async addFeedback(id: string, userId: string, rating: number, comment: string): Promise<void> {
    try {
      const template = this.templates.get(id);
      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Validate rating
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      // Add feedback
      const feedback: TemplateFeedback = {
        userId,
        rating,
        comment,
        timestamp: new Date(),
      };

      template.usage.feedback.push(feedback);

      // Recalculate average rating
      const totalRating = template.usage.feedback.reduce((sum, f) => sum + f.rating, 0);
      template.usage.averageRating = totalRating / template.usage.feedback.length;

      // Update in storage
      await this.saveTemplate(template);

      this.logger.info('Template feedback added', { templateId: id, rating });
    } catch (error) {
      this.logger.error('Failed to add template feedback', { error: error.message, templateId: id });
      throw error;
    }
  }

  /**
   * Update templates from repository
   */
  async updateTemplates(force: boolean = false): Promise<void> {
    try {
      const shouldUpdate = force || this.shouldUpdate();
      
      if (!shouldUpdate) {
        this.logger.debug('Template update skipped - too recent');
        return;
      }

      this.logger.info('Updating templates from repository');

      // Clone or pull latest templates
      await this.syncRepository();

      // Reload templates
      await this.loadTemplates();

      this.lastUpdate = new Date();

      this.logger.info('Templates updated successfully', {
        templateCount: this.templates.size,
      });
    } catch (error) {
      this.logger.error('Template update failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get template statistics
   */
  getStatistics(): {
    totalTemplates: number;
    categoryCounts: Record<TemplateCategory, number>;
    frameworkCounts: Record<string, number>;
    languageCounts: Record<string, number>;
    averageRating: number;
    totalUsage: number;
  } {
    const templates = Array.from(this.templates.values());
    
    const categoryCounts = {} as Record<TemplateCategory, number>;
    const frameworkCounts: Record<string, number> = {};
    const languageCounts: Record<string, number> = {};
    
    let totalRating = 0;
    let totalUsage = 0;
    let ratedTemplates = 0;

    templates.forEach(template => {
      // Category counts
      categoryCounts[template.category] = (categoryCounts[template.category] || 0) + 1;
      
      // Framework counts
      frameworkCounts[template.framework] = (frameworkCounts[template.framework] || 0) + 1;
      
      // Language counts
      languageCounts[template.language] = (languageCounts[template.language] || 0) + 1;
      
      // Rating and usage
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

  // Private Methods

  private async loadTemplates(): Promise<void> {
    try {
      this.templates.clear();

      // Find all template.yml files
      const templateFiles = await glob('**/template.yml', {
        cwd: this.templatesPath,
        absolute: true,
      });

      for (const templateFile of templateFiles) {
        try {
          const template = await this.loadTemplateFromFile(templateFile);
          this.templates.set(template.id, template);
        } catch (error) {
          this.logger.warn('Failed to load template', {
            file: templateFile,
            error: error.message,
          });
        }
      }

      this.logger.info('Templates loaded', { count: this.templates.size });
    } catch (error) {
      this.logger.error('Failed to load templates', { error: error.message });
      throw error;
    }
  }

  private async loadTemplateFromFile(templateFile: string): Promise<Template> {
    const templateDir = path.dirname(templateFile);
    const templateYml = await fs.readFile(templateFile, 'utf-8');
    const templateData = yaml.parse(templateYml);

    // Load template files
    const files: TemplateFile[] = [];
    if (templateData.files) {
      for (const fileConfig of templateData.files) {
        const filePath = path.join(templateDir, fileConfig.path);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          files.push({
            path: fileConfig.path,
            content,
            isTemplate: fileConfig.isTemplate || false,
            conditions: fileConfig.conditions || [],
          });
        } catch (error) {
          this.logger.warn('Failed to load template file', {
            file: filePath,
            error: error.message,
          });
        }
      }
    }

    const template: Template = {
      id: templateData.id || this.generateTemplateId(),
      name: templateData.name,
      description: templateData.description || '',
      category: templateData.category || TemplateCategory.COMPONENT,
      type: templateData.type || TemplateType.FILE,
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

  private async loadTemplateFromDirectory(directory: string): Promise<Template> {
    const templateFile = path.join(directory, 'template.yml');
    return await this.loadTemplateFromFile(templateFile);
  }

  private async validateTemplate(template: Template): Promise<void> {
    // Validate required fields
    if (!template.name) {
      throw new Error('Template name is required');
    }

    if (!template.content.files || template.content.files.length === 0) {
      throw new Error('Template must have at least one file');
    }

    // Validate variables
    for (const variable of template.content.variables) {
      if (!variable.name) {
        throw new Error('Template variable must have a name');
      }

      if (!Object.values(VariableType).includes(variable.type)) {
        throw new Error(`Invalid variable type: ${variable.type}`);
      }
    }

    // Validate file paths
    for (const file of template.content.files) {
      if (!file.path) {
        throw new Error('Template file must have a path');
      }

      if (file.path.includes('..')) {
        throw new Error('Template file paths cannot contain parent directory references');
      }
    }
  }

  private async saveTemplate(template: Template): Promise<void> {
    const templatePath = this.getTemplatePath(template.id);
    await fs.mkdir(templatePath, { recursive: true });

    // Save template.yml
    const templateYml = yaml.stringify({
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

    await fs.writeFile(
      path.join(templatePath, 'template.yml'),
      templateYml,
      'utf-8'
    );

    // Save template files
    for (const file of template.content.files) {
      const filePath = path.join(templatePath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf-8');
    }
  }

  private getTemplatePath(id: string): string {
    return path.join(this.templatesPath, id);
  }

  private generateTemplateId(): string {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldUpdate(): boolean {
    if (!this.lastUpdate) {
      return true;
    }

    const timeSinceUpdate = Date.now() - this.lastUpdate.getTime();
    return timeSinceUpdate > config.templates.updateInterval * 1000;
  }

  private async syncRepository(): Promise<void> {
    try {
      const repoUrl = config.templates.repositoryUrl;
      
      if (repoUrl.startsWith('git') || repoUrl.startsWith('http')) {
        // Git repository
        if (await this.directoryExists(this.repositoryPath)) {
          // Pull latest changes
          execSync('git pull', { cwd: this.repositoryPath, stdio: 'inherit' });
        } else {
          // Clone repository
          execSync(`git clone ${repoUrl} ${this.repositoryPath}`, { stdio: 'inherit' });
        }

        // Copy templates to local directory
        await this.copyDirectory(this.repositoryPath, this.templatesPath);
      }
    } catch (error) {
      this.logger.error('Repository sync failed', { error: error.message });
      throw error;
    }
  }

  private async downloadTemplate(source: string): Promise<string> {
    const tempDir = path.join('/tmp', `template_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    if (source.startsWith('http')) {
      // Download from URL
      // Implementation depends on the source format (zip, tar, etc.)
      throw new Error('HTTP template download not implemented yet');
    } else if (source.startsWith('git')) {
      // Clone git repository
      execSync(`git clone ${source} ${tempDir}`, { stdio: 'inherit' });
    } else {
      // Local file or directory
      await this.copyDirectory(source, tempDir);
    }

    return tempDir;
  }

  private async createZipArchive(sourcePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', chunk => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  private async createTarArchive(sourcePath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      tar.create(
        { gzip: true, cwd: path.dirname(sourcePath) },
        [path.basename(sourcePath)]
      )
      .on('data', chunk => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
    });
  }

  private mergeVariables(
    existing: TemplateVariable[],
    custom: Record<string, any>
  ): TemplateVariable[] {
    const merged = [...existing];

    for (const [name, value] of Object.entries(custom)) {
      const existingIndex = merged.findIndex(v => v.name === name);
      if (existingIndex >= 0) {
        merged[existingIndex].defaultValue = value;
      } else {
        merged.push({
          name,
          type: VariableType.STRING,
          description: `Custom variable: ${name}`,
          required: false,
          defaultValue: value,
        });
      }
    }

    return merged;
  }

  private setupPeriodicUpdates(): void {
    setInterval(async () => {
      try {
        await this.updateTemplates(false);
      } catch (error) {
        this.logger.error('Periodic template update failed', { error: error.message });
      }
    }, config.templates.updateInterval * 1000);
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const items = await fs.readdir(source);

    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }
}