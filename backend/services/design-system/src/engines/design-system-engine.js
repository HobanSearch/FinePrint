import { z } from 'zod';
import { logger } from '../utils/logger.js';
const DesignTokenSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: z.enum(['color', 'typography', 'spacing', 'shadow', 'border', 'animation']),
    value: z.any(),
    description: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
});
const ThemeSchema = z.object({
    id: z.string(),
    name: z.string(),
    variant: z.enum(['light', 'dark', 'high-contrast', 'custom']),
    tokens: z.record(z.any()),
    metadata: z.record(z.any()).optional(),
});
const ComponentSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    variants: z.array(z.string()),
    props: z.record(z.any()),
    styles: z.record(z.any()),
    accessibility: z.record(z.any()),
    documentation: z.string().optional(),
});
export class DesignSystemEngine {
    database;
    redis;
    isInitialized = false;
    designSystems = new Map();
    tokenCache = new Map();
    themeCache = new Map();
    componentCache = new Map();
    constructor(database, redis) {
        this.database = database;
        this.redis = redis;
    }
    async initialize() {
        try {
            logger.info('Initializing Design System Engine');
            await this.loadDesignSystems();
            await this.ensureDefaultDesignSystem();
            await this.warmCaches();
            this.isInitialized = true;
            logger.info('Design System Engine initialized successfully');
        }
        catch (error) {
            logger.error(error, 'Failed to initialize Design System Engine');
            throw error;
        }
    }
    async healthCheck() {
        try {
            return this.isInitialized &&
                await this.database.healthCheck() &&
                await this.redis.healthCheck();
        }
        catch {
            return false;
        }
    }
    async createToken(token) {
        const validatedToken = DesignTokenSchema.omit({ id: true }).parse(token);
        const newToken = {
            id: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...validatedToken,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await this.database.query(`INSERT INTO design_tokens (id, name, category, value, description, aliases, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            newToken.id,
            newToken.name,
            newToken.category,
            JSON.stringify(newToken.value),
            newToken.description,
            JSON.stringify(newToken.aliases || []),
            JSON.stringify(newToken.metadata || {}),
            newToken.createdAt,
            newToken.updatedAt,
        ]);
        this.tokenCache.set(newToken.id, newToken);
        await this.redis.set(`token:${newToken.id}`, JSON.stringify(newToken), 3600);
        logger.info({ tokenId: newToken.id, tokenName: newToken.name }, 'Token created');
        return newToken;
    }
    async updateToken(id, updates) {
        const existingToken = await this.getToken(id);
        if (!existingToken) {
            throw new Error(`Token with id ${id} not found`);
        }
        const updatedToken = {
            ...existingToken,
            ...updates,
            updatedAt: new Date(),
        };
        DesignTokenSchema.parse(updatedToken);
        await this.database.query(`UPDATE design_tokens 
       SET name = $2, category = $3, value = $4, description = $5, aliases = $6, metadata = $7, updated_at = $8
       WHERE id = $1`, [
            id,
            updatedToken.name,
            updatedToken.category,
            JSON.stringify(updatedToken.value),
            updatedToken.description,
            JSON.stringify(updatedToken.aliases || []),
            JSON.stringify(updatedToken.metadata || {}),
            updatedToken.updatedAt,
        ]);
        this.tokenCache.set(id, updatedToken);
        await this.redis.set(`token:${id}`, JSON.stringify(updatedToken), 3600);
        await this.invalidateDependentCaches(id);
        logger.info({ tokenId: id }, 'Token updated');
        return updatedToken;
    }
    async getToken(id) {
        const cached = this.tokenCache.get(id);
        if (cached)
            return cached;
        const redisData = await this.redis.get(`token:${id}`);
        if (redisData) {
            const token = JSON.parse(redisData);
            this.tokenCache.set(id, token);
            return token;
        }
        const result = await this.database.query('SELECT * FROM design_tokens WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        const token = {
            id: row.id,
            name: row.name,
            category: row.category,
            value: JSON.parse(row.value),
            description: row.description,
            aliases: JSON.parse(row.aliases || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        this.tokenCache.set(id, token);
        await this.redis.set(`token:${id}`, JSON.stringify(token), 3600);
        return token;
    }
    async getTokensByCategory(category) {
        const result = await this.database.query('SELECT * FROM design_tokens WHERE category = $1 ORDER BY name', [category]);
        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            value: JSON.parse(row.value),
            description: row.description,
            aliases: JSON.parse(row.aliases || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    async searchTokens(query) {
        const result = await this.database.query(`SELECT * FROM design_tokens 
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY name`, [`%${query}%`]);
        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            value: JSON.parse(row.value),
            description: row.description,
            aliases: JSON.parse(row.aliases || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    async createTheme(theme) {
        const validatedTheme = ThemeSchema.omit({ id: true }).parse(theme);
        const newTheme = {
            id: `theme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...validatedTheme,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await this.database.query(`INSERT INTO design_themes (id, name, variant, tokens, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            newTheme.id,
            newTheme.name,
            newTheme.variant,
            JSON.stringify(newTheme.tokens),
            JSON.stringify(newTheme.metadata || {}),
            newTheme.createdAt,
            newTheme.updatedAt,
        ]);
        this.themeCache.set(newTheme.id, newTheme);
        await this.redis.set(`theme:${newTheme.id}`, JSON.stringify(newTheme), 3600);
        logger.info({ themeId: newTheme.id, themeName: newTheme.name }, 'Theme created');
        return newTheme;
    }
    async generateThemeVariant(baseThemeId, variant) {
        const baseTheme = await this.getTheme(baseThemeId);
        if (!baseTheme) {
            throw new Error(`Base theme with id ${baseThemeId} not found`);
        }
        const variantTokens = await this.applyThemeVariant(baseTheme.tokens, variant);
        return this.createTheme({
            name: `${baseTheme.name} (${variant})`,
            variant,
            tokens: variantTokens,
            metadata: {
                ...baseTheme.metadata,
                baseThemeId,
                isVariant: true,
            },
        });
    }
    async getTheme(id) {
        const cached = this.themeCache.get(id);
        if (cached)
            return cached;
        const redisData = await this.redis.get(`theme:${id}`);
        if (redisData) {
            const theme = JSON.parse(redisData);
            this.themeCache.set(id, theme);
            return theme;
        }
        const result = await this.database.query('SELECT * FROM design_themes WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        const theme = {
            id: row.id,
            name: row.name,
            variant: row.variant,
            tokens: JSON.parse(row.tokens),
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        this.themeCache.set(id, theme);
        await this.redis.set(`theme:${id}`, JSON.stringify(theme), 3600);
        return theme;
    }
    async createComponent(component) {
        const validatedComponent = ComponentSchema.omit({ id: true }).parse(component);
        const newComponent = {
            id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...validatedComponent,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await this.database.query(`INSERT INTO design_components (id, name, category, variants, props, styles, accessibility, documentation, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
            newComponent.id,
            newComponent.name,
            newComponent.category,
            JSON.stringify(newComponent.variants),
            JSON.stringify(newComponent.props),
            JSON.stringify(newComponent.styles),
            JSON.stringify(newComponent.accessibility),
            newComponent.documentation,
            newComponent.createdAt,
            newComponent.updatedAt,
        ]);
        this.componentCache.set(newComponent.id, newComponent);
        await this.redis.set(`component:${newComponent.id}`, JSON.stringify(newComponent), 3600);
        logger.info({ componentId: newComponent.id, componentName: newComponent.name }, 'Component created');
        return newComponent;
    }
    async getComponent(id) {
        const cached = this.componentCache.get(id);
        if (cached)
            return cached;
        const redisData = await this.redis.get(`component:${id}`);
        if (redisData) {
            const component = JSON.parse(redisData);
            this.componentCache.set(id, component);
            return component;
        }
        const result = await this.database.query('SELECT * FROM design_components WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        const component = {
            id: row.id,
            name: row.name,
            category: row.category,
            variants: JSON.parse(row.variants),
            props: JSON.parse(row.props),
            styles: JSON.parse(row.styles),
            accessibility: JSON.parse(row.accessibility),
            documentation: row.documentation,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        this.componentCache.set(id, component);
        await this.redis.set(`component:${id}`, JSON.stringify(component), 3600);
        return component;
    }
    async getComponentLibrary() {
        const result = await this.database.query('SELECT * FROM design_components ORDER BY category, name');
        const components = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            variants: JSON.parse(row.variants),
            props: JSON.parse(row.props),
            styles: JSON.parse(row.styles),
            accessibility: JSON.parse(row.accessibility),
            documentation: row.documentation,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        const library = {};
        for (const component of components) {
            if (!library[component.category]) {
                library[component.category] = [];
            }
            library[component.category].push(component);
        }
        return library;
    }
    async createDesignSystem(config) {
        const newConfig = {
            id: `ds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...config,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await this.database.query(`INSERT INTO design_systems (id, name, version, tokens, themes, components, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            newConfig.id,
            newConfig.name,
            newConfig.version,
            JSON.stringify(newConfig.tokens),
            JSON.stringify(newConfig.themes),
            JSON.stringify(newConfig.components),
            JSON.stringify(newConfig.config),
            newConfig.createdAt,
            newConfig.updatedAt,
        ]);
        this.designSystems.set(newConfig.id, newConfig);
        logger.info({ designSystemId: newConfig.id, name: newConfig.name }, 'Design system created');
        return newConfig;
    }
    async exportDesignSystem(id, format) {
        const designSystem = this.designSystems.get(id);
        if (!designSystem) {
            throw new Error(`Design system with id ${id} not found`);
        }
        switch (format) {
            case 'json':
                return JSON.stringify(designSystem, null, 2);
            case 'css':
                return this.generateCSSVariables(designSystem);
            case 'scss':
                return this.generateSCSSVariables(designSystem);
            case 'tokens':
                return this.generateTokensFile(designSystem);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    async loadDesignSystems() {
        const result = await this.database.query('SELECT * FROM design_systems');
        for (const row of result.rows) {
            const config = {
                id: row.id,
                name: row.name,
                version: row.version,
                tokens: JSON.parse(row.tokens),
                themes: JSON.parse(row.themes),
                components: JSON.parse(row.components),
                config: JSON.parse(row.config),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
            this.designSystems.set(config.id, config);
        }
    }
    async ensureDefaultDesignSystem() {
        if (this.designSystems.size === 0) {
            await this.createDefaultDesignSystem();
        }
    }
    async createDefaultDesignSystem() {
        const defaultConfig = {
            name: 'Fine Print AI Design System',
            version: '1.0.0',
            tokens: {
                colors: {
                    guardian: { 500: '#2563eb' },
                    sage: { 500: '#10b981' },
                    risk: {
                        safe: { 500: '#10b981' },
                        low: { 500: '#22c55e' },
                        medium: { 500: '#f59e0b' },
                        high: { 500: '#ef4444' },
                        critical: { 500: '#ec4899' },
                    },
                },
                typography: {
                    fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                    },
                    fontSize: {
                        base: '1rem',
                        lg: '1.125rem',
                        xl: '1.25rem',
                    },
                },
                spacing: {
                    4: '1rem',
                    8: '2rem',
                    12: '3rem',
                },
            },
            themes: ['light', 'dark'],
            components: ['Button', 'Card', 'Badge'],
            config: {
                platforms: ['web', 'mobile', 'extension'],
                frameworks: ['react', 'vue', 'angular'],
            },
        };
        await this.createDesignSystem(defaultConfig);
    }
    async warmCaches() {
        logger.info('Warming design system caches');
        const tokenResult = await this.database.query('SELECT * FROM design_tokens LIMIT 100');
        for (const row of tokenResult.rows) {
            const token = {
                id: row.id,
                name: row.name,
                category: row.category,
                value: JSON.parse(row.value),
                description: row.description,
                aliases: JSON.parse(row.aliases || '[]'),
                metadata: JSON.parse(row.metadata || '{}'),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
            this.tokenCache.set(token.id, token);
        }
    }
    async invalidateDependentCaches(tokenId) {
        this.themeCache.clear();
        this.componentCache.clear();
        await this.redis.deletePattern('theme:*');
        await this.redis.deletePattern('component:*');
    }
    async applyThemeVariant(baseTokens, variant) {
        switch (variant) {
            case 'dark':
                return this.applyDarkThemeTransform(baseTokens);
            case 'high-contrast':
                return this.applyHighContrastTransform(baseTokens);
            default:
                return baseTokens;
        }
    }
    applyDarkThemeTransform(tokens) {
        const darkTokens = JSON.parse(JSON.stringify(tokens));
        if (darkTokens.colors?.neutral) {
            const neutral = darkTokens.colors.neutral;
            const temp = { ...neutral };
            Object.keys(neutral).forEach(key => {
                const invertedKey = String(1000 - parseInt(key));
                if (temp[invertedKey]) {
                    neutral[key] = temp[invertedKey];
                }
            });
        }
        return darkTokens;
    }
    applyHighContrastTransform(tokens) {
        const contrastTokens = JSON.parse(JSON.stringify(tokens));
        if (contrastTokens.colors) {
            Object.keys(contrastTokens.colors).forEach(colorGroup => {
                if (typeof contrastTokens.colors[colorGroup] === 'object') {
                    Object.keys(contrastTokens.colors[colorGroup]).forEach(shade => {
                        const shadeNum = parseInt(shade);
                        if (shadeNum < 500) {
                            contrastTokens.colors[colorGroup][shade] = contrastTokens.colors[colorGroup]['100'];
                        }
                        else if (shadeNum > 500) {
                            contrastTokens.colors[colorGroup][shade] = contrastTokens.colors[colorGroup]['900'];
                        }
                    });
                }
            });
        }
        return contrastTokens;
    }
    generateCSSVariables(designSystem) {
        let css = ':root {\n';
        const flattenTokens = (obj, prefix = '') => {
            let result = '';
            for (const [key, value] of Object.entries(obj)) {
                const varName = `--${prefix}${prefix ? '-' : ''}${key}`;
                if (typeof value === 'object' && value !== null) {
                    result += flattenTokens(value, `${prefix}${prefix ? '-' : ''}${key}`);
                }
                else {
                    result += `  ${varName}: ${value};\n`;
                }
            }
            return result;
        };
        css += flattenTokens(designSystem.tokens);
        css += '}\n';
        return css;
    }
    generateSCSSVariables(designSystem) {
        let scss = '// Fine Print AI Design System SCSS Variables\n\n';
        const flattenTokens = (obj, prefix = '') => {
            let result = '';
            for (const [key, value] of Object.entries(obj)) {
                const varName = `$${prefix}${prefix ? '-' : ''}${key}`;
                if (typeof value === 'object' && value !== null) {
                    result += flattenTokens(value, `${prefix}${prefix ? '-' : ''}${key}`);
                }
                else {
                    result += `${varName}: ${value};\n`;
                }
            }
            return result;
        };
        scss += flattenTokens(designSystem.tokens);
        return scss;
    }
    generateTokensFile(designSystem) {
        return JSON.stringify({
            name: designSystem.name,
            version: designSystem.version,
            tokens: designSystem.tokens,
        }, null, 2);
    }
}
//# sourceMappingURL=design-system-engine.js.map