export type Framework = 'react' | 'vue' | 'angular' | 'react-native';
export interface ComponentSpec {
    name: string;
    type: 'primitive' | 'composite' | 'layout' | 'visualization';
    framework: Framework;
    props: Record<string, any>;
    variants?: string[];
    accessibility?: AccessibilityFeatures;
    responsive?: ResponsiveConfig;
    styling?: StylingConfig;
    documentation?: string;
}
export interface GeneratedComponent {
    id: string;
    name: string;
    framework: Framework;
    type: string;
    code: string;
    props: Record<string, any>;
    variants?: string[];
    files?: ComponentFile[];
    dependencies: string[];
    accessibility?: AccessibilityFeatures;
    responsive?: ResponsiveConfig;
    createdAt: Date;
    updatedAt: Date;
    metadata: Record<string, any>;
}
export interface ComponentFile {
    name: string;
    content: string;
    type: 'component' | 'styles' | 'test' | 'documentation' | 'stories';
}
export interface AccessibilityFeatures {
    role?: string;
    ariaLabel?: string;
    keyboardNavigation?: boolean;
    screenReaderSupport?: boolean;
}
export interface ResponsiveConfig {
    breakpoints?: string[];
    adaptiveProps?: Record<string, any>;
}
export interface StylingConfig {
    theme?: string;
    customStyles?: Record<string, any>;
    cssModules?: boolean;
}
export interface ComponentVariant {
    id: string;
    name: string;
    baseComponentId: string;
    modifications: Record<string, any>;
    createdAt: Date;
}
//# sourceMappingURL=component-generation.d.ts.map