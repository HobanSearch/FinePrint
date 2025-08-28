export interface DesignToken {
    id: string;
    name: string;
    category: 'color' | 'typography' | 'spacing' | 'shadow' | 'border' | 'animation';
    value: any;
    description?: string;
    aliases?: string[];
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export interface Theme {
    id: string;
    name: string;
    variant: ThemeVariant;
    tokens: Record<string, any>;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export interface Component {
    id: string;
    name: string;
    category: string;
    variants: string[];
    props: Record<string, any>;
    styles: Record<string, any>;
    accessibility: Record<string, any>;
    documentation?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface DesignSystemConfig {
    id: string;
    name: string;
    version: string;
    tokens: Record<string, any>;
    themes: string[];
    components: string[];
    config: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export type ThemeVariant = 'light' | 'dark' | 'high-contrast' | 'custom';
export type TokenUpdate = Partial<Omit<DesignToken, 'id' | 'createdAt' | 'updatedAt'>>;
export interface ComponentLibrary {
    [category: string]: Component[];
}
//# sourceMappingURL=design-system.d.ts.map