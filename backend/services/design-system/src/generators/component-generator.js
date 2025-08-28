import { z } from 'zod';
import generate from '@babel/generator';
import { parse } from '@babel/parser';
import { logger } from '../utils/logger.js';
const ComponentSpecSchema = z.object({
    name: z.string(),
    type: z.enum(['primitive', 'composite', 'layout', 'visualization']),
    framework: z.enum(['react', 'vue', 'angular', 'react-native']),
    props: z.record(z.any()),
    variants: z.array(z.string()).optional(),
    accessibility: z.object({
        role: z.string().optional(),
        ariaLabel: z.string().optional(),
        keyboardNavigation: z.boolean().optional(),
        screenReaderSupport: z.boolean().optional(),
    }).optional(),
    responsive: z.object({
        breakpoints: z.array(z.string()).optional(),
        adaptiveProps: z.record(z.any()).optional(),
    }).optional(),
    styling: z.object({
        theme: z.string().optional(),
        customStyles: z.record(z.any()).optional(),
        cssModules: z.boolean().optional(),
    }).optional(),
    documentation: z.string().optional(),
});
export class ComponentGenerator {
    designSystemEngine;
    templateCache = new Map();
    generatedComponents = new Map();
    constructor(designSystemEngine) {
        this.designSystemEngine = designSystemEngine;
    }
    async generateComponent(spec) {
        const validatedSpec = ComponentSpecSchema.parse(spec);
        logger.info({
            componentName: spec.name,
            framework: spec.framework
        }, 'Generating component');
        try {
            const component = await this.generateByFramework(validatedSpec);
            const accessibleComponent = await this.enhanceAccessibility(component, validatedSpec.accessibility);
            const responsiveComponent = await this.applyResponsiveDesign(accessibleComponent, validatedSpec.responsive);
            const componentWithTests = await this.generateTests(responsiveComponent, validatedSpec);
            const finalComponent = await this.generateDocumentation(componentWithTests, validatedSpec);
            const componentId = `${spec.framework}_${spec.name}_${Date.now()}`;
            this.generatedComponents.set(componentId, finalComponent);
            logger.info({
                componentId,
                componentName: spec.name,
                linesOfCode: finalComponent.code.split('\n').length
            }, 'Component generated successfully');
            return finalComponent;
        }
        catch (error) {
            logger.error({
                error: error.message,
                componentName: spec.name,
                framework: spec.framework
            }, 'Failed to generate component');
            throw error;
        }
    }
    async generateVariant(baseComponentId, variantName, modifications) {
        const baseComponent = this.generatedComponents.get(baseComponentId);
        if (!baseComponent) {
            throw new Error(`Base component with id ${baseComponentId} not found`);
        }
        logger.info({
            baseComponentId,
            variantName
        }, 'Generating component variant');
        const ast = parse(baseComponent.code, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx'],
        });
        const modifiedAst = this.applyVariantModifications(ast, modifications);
        const { code } = generate(modifiedAst, {
            retainLines: false,
            compact: false,
            minified: false,
        });
        const variantComponent = {
            ...baseComponent,
            id: `${baseComponentId}_variant_${variantName}`,
            name: `${baseComponent.name}${variantName}`,
            code,
            variants: [...(baseComponent.variants || []), variantName],
            metadata: {
                ...baseComponent.metadata,
                isVariant: true,
                baseComponentId,
                variantName,
                modifications,
            },
        };
        this.generatedComponents.set(variantComponent.id, variantComponent);
        return variantComponent;
    }
    async batchGenerate(specs) {
        logger.info({ count: specs.length }, 'Starting batch component generation');
        const results = await Promise.allSettled(specs.map(spec => this.generateComponent(spec)));
        const successful = results
            .filter((result) => result.status === 'fulfilled')
            .map(result => result.value);
        const failed = results
            .filter((result) => result.status === 'rejected')
            .map((result, index) => ({ spec: specs[index], error: result.reason }));
        if (failed.length > 0) {
            logger.warn({
                successful: successful.length,
                failed: failed.length,
                failures: failed.map(f => ({ name: f.spec.name, error: f.error.message }))
            }, 'Batch generation completed with failures');
        }
        else {
            logger.info({ count: successful.length }, 'Batch generation completed successfully');
        }
        return successful;
    }
    async regenerateWithUpdatedTokens(componentId) {
        const component = this.generatedComponents.get(componentId);
        if (!component) {
            throw new Error(`Component with id ${componentId} not found`);
        }
        logger.info({ componentId }, 'Regenerating component with updated design tokens');
        const tokenReferences = this.extractTokenReferences(component.code);
        const updatedTokens = await this.getUpdatedTokens(tokenReferences);
        const updatedCode = this.replaceTokenValues(component.code, updatedTokens);
        const updatedComponent = {
            ...component,
            code: updatedCode,
            updatedAt: new Date(),
            metadata: {
                ...component.metadata,
                tokenReferences,
                lastTokenUpdate: new Date(),
            },
        };
        this.generatedComponents.set(componentId, updatedComponent);
        return updatedComponent;
    }
    async generateByFramework(spec) {
        switch (spec.framework) {
            case 'react':
                return this.generateReactComponent(spec);
            case 'vue':
                return this.generateVueComponent(spec);
            case 'angular':
                return this.generateAngularComponent(spec);
            case 'react-native':
                return this.generateReactNativeComponent(spec);
            default:
                throw new Error(`Unsupported framework: ${spec.framework}`);
        }
    }
    async generateReactComponent(spec) {
        const template = await this.getTemplate('react', spec.type);
        const propsInterface = this.generatePropsInterface(spec.props, 'typescript');
        const componentLogic = this.generateComponentLogic(spec, 'react');
        const styles = await this.generateStyles(spec, 'react');
        const code = this.populateTemplate(template, {
            componentName: spec.name,
            propsInterface,
            componentLogic,
            styles,
            imports: this.generateImports(spec, 'react'),
        });
        return {
            id: `react_${spec.name}_${Date.now()}`,
            name: spec.name,
            framework: 'react',
            type: spec.type,
            code,
            props: spec.props,
            variants: spec.variants,
            files: [
                {
                    name: `${spec.name}.tsx`,
                    content: code,
                    type: 'component',
                },
                {
                    name: `${spec.name}.module.css`,
                    content: styles,
                    type: 'styles',
                },
            ],
            dependencies: this.getDependencies(spec, 'react'),
            accessibility: spec.accessibility,
            responsive: spec.responsive,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                generator: 'ComponentGenerator',
                version: '1.0.0',
                framework: 'react',
            },
        };
    }
    async generateVueComponent(spec) {
        const template = await this.getTemplate('vue', spec.type);
        const propsDefinition = this.generatePropsInterface(spec.props, 'vue');
        const componentLogic = this.generateComponentLogic(spec, 'vue');
        const styles = await this.generateStyles(spec, 'vue');
        const code = this.populateTemplate(template, {
            componentName: spec.name,
            propsDefinition,
            componentLogic,
            styles,
        });
        return {
            id: `vue_${spec.name}_${Date.now()}`,
            name: spec.name,
            framework: 'vue',
            type: spec.type,
            code,
            props: spec.props,
            variants: spec.variants,
            files: [
                {
                    name: `${spec.name}.vue`,
                    content: code,
                    type: 'component',
                },
            ],
            dependencies: this.getDependencies(spec, 'vue'),
            accessibility: spec.accessibility,
            responsive: spec.responsive,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                generator: 'ComponentGenerator',
                version: '1.0.0',
                framework: 'vue',
            },
        };
    }
    async generateAngularComponent(spec) {
        const template = await this.getTemplate('angular', spec.type);
        const componentClass = this.generateComponentLogic(spec, 'angular');
        const templateHtml = this.generateAngularTemplate(spec);
        const styles = await this.generateStyles(spec, 'angular');
        const code = this.populateTemplate(template, {
            componentName: spec.name,
            componentClass,
            templateHtml,
            styles,
            imports: this.generateImports(spec, 'angular'),
        });
        return {
            id: `angular_${spec.name}_${Date.now()}`,
            name: spec.name,
            framework: 'angular',
            type: spec.type,
            code,
            props: spec.props,
            variants: spec.variants,
            files: [
                {
                    name: `${spec.name.toLowerCase()}.component.ts`,
                    content: code,
                    type: 'component',
                },
                {
                    name: `${spec.name.toLowerCase()}.component.html`,
                    content: templateHtml,
                    type: 'template',
                },
                {
                    name: `${spec.name.toLowerCase()}.component.scss`,
                    content: styles,
                    type: 'styles',
                },
            ],
            dependencies: this.getDependencies(spec, 'angular'),
            accessibility: spec.accessibility,
            responsive: spec.responsive,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                generator: 'ComponentGenerator',
                version: '1.0.0',
                framework: 'angular',
            },
        };
    }
    async generateReactNativeComponent(spec) {
        const template = await this.getTemplate('react-native', spec.type);
        const propsInterface = this.generatePropsInterface(spec.props, 'typescript');
        const componentLogic = this.generateComponentLogic(spec, 'react-native');
        const styles = await this.generateReactNativeStyles(spec);
        const code = this.populateTemplate(template, {
            componentName: spec.name,
            propsInterface,
            componentLogic,
            styles,
            imports: this.generateImports(spec, 'react-native'),
        });
        return {
            id: `react_native_${spec.name}_${Date.now()}`,
            name: spec.name,
            framework: 'react-native',
            type: spec.type,
            code,
            props: spec.props,
            variants: spec.variants,
            files: [
                {
                    name: `${spec.name}.tsx`,
                    content: code,
                    type: 'component',
                },
            ],
            dependencies: this.getDependencies(spec, 'react-native'),
            accessibility: spec.accessibility,
            responsive: spec.responsive,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                generator: 'ComponentGenerator',
                version: '1.0.0',
                framework: 'react-native',
                platform: 'mobile',
            },
        };
    }
    async getTemplate(framework, type) {
        const cacheKey = `${framework}_${type}`;
        if (this.templateCache.has(cacheKey)) {
            return this.templateCache.get(cacheKey);
        }
        const template = await this.loadTemplate(framework, type);
        this.templateCache.set(cacheKey, template);
        return template;
    }
    async loadTemplate(framework, type) {
        const templates = {
            react: {
                primitive: `
import React from 'react'
import { clsx } from 'clsx'
{{imports}}

{{propsInterface}}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({
  children,
  className,
  ...props
}) => {
  {{componentLogic}}

  return (
    <div
      className={clsx(styles.{{componentName}}, className)}
      {...props}
    >
      {children}
    </div>
  )
}

{{componentName}}.displayName = '{{componentName}}'
        `,
                composite: `
import React from 'react'
import { clsx } from 'clsx'
{{imports}}

{{propsInterface}}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({
  children,
  className,
  ...props
}) => {
  {{componentLogic}}

  return (
    <div className={clsx(styles.{{componentName}}, className)}>
      {{componentTemplate}}
    </div>
  )
}

{{componentName}}.displayName = '{{componentName}}'
        `,
            },
            vue: {
                primitive: `
<template>
  <div :class="computedClasses" v-bind="$attrs">
    <slot />
  </div>
</template>

<script setup lang="ts">
{{propsDefinition}}

{{componentLogic}}
</script>

<style scoped>
{{styles}}
</style>
        `,
            },
            angular: {
                primitive: `
import { Component, Input } from '@angular/core'
{{imports}}

@Component({
  selector: 'app-{{componentName}}',
  templateUrl: './{{componentName}}.component.html',
  styleUrls: ['./{{componentName}}.component.scss']
})
export class {{componentName}}Component {
  {{componentClass}}
}
        `,
            },
            'react-native': {
                primitive: `
import React from 'react'
import { View, StyleSheet } from 'react-native'
{{imports}}

{{propsInterface}}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({
  children,
  style,
  ...props
}) => {
  {{componentLogic}}

  return (
    <View style={[styles.container, style]} {...props}>
      {children}
    </View>
  )
}

{{styles}}
        `,
            },
        };
        return templates[framework]?.[type] || templates[framework]?.primitive || templates.react.primitive;
    }
    generatePropsInterface(props, syntax) {
        if (syntax === 'vue') {
            const propsArray = Object.entries(props).map(([key, config]) => {
                return `${key}: ${this.getVuePropType(config)}`;
            });
            return `const props = defineProps<{\n  ${propsArray.join(',\n  ')}\n}>()`;
        }
        const propsArray = Object.entries(props).map(([key, config]) => {
            const optional = config.required === false ? '?' : '';
            return `${key}${optional}: ${this.getTypeScriptType(config)}`;
        });
        return `interface ${this.getCurrentComponentName()}Props {
  ${propsArray.join('\n  ')}
  children?: React.ReactNode
  className?: string
}`;
    }
    generateComponentLogic(spec, framework) {
        const logic = [];
        if (spec.variants && spec.variants.length > 0) {
            logic.push(`// Variant handling`);
            logic.push(`const variant = props.variant || 'default'`);
        }
        if (spec.accessibility?.keyboardNavigation) {
            logic.push(`// Keyboard navigation`);
            if (framework === 'react' || framework === 'react-native') {
                logic.push(`const handleKeyDown = (event: KeyboardEvent) => {
          // Keyboard navigation logic
        }`);
            }
        }
        return logic.join('\n  ');
    }
    async generateStyles(spec, framework) {
        const theme = await this.designSystemEngine.getTheme('default');
        let styles = '';
        if (framework === 'react') {
            styles = `.${spec.name} {
  /* Base styles */
  display: flex;
  align-items: center;
  justify-content: center;
}`;
        }
        else if (framework === 'vue' || framework === 'angular') {
            styles = `.${spec.name.toLowerCase()} {
  /* Base styles */
  display: flex;
  align-items: center;
  justify-content: center;
}`;
        }
        if (spec.variants) {
            for (const variant of spec.variants) {
                styles += `\n\n.${spec.name}--${variant} {
  /* ${variant} variant styles */
}`;
            }
        }
        return styles;
    }
    async generateReactNativeStyles(spec) {
        return `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
    `;
    }
    generateImports(spec, framework) {
        const imports = [];
        if (spec.accessibility?.screenReaderSupport) {
            if (framework === 'react') {
                imports.push(`import { VisuallyHidden } from '@/components/accessibility'`);
            }
        }
        return imports.join('\n');
    }
    getDependencies(spec, framework) {
        const deps = [];
        if (framework === 'react' || framework === 'react-native') {
            deps.push('react');
            if (framework === 'react-native') {
                deps.push('react-native');
            }
        }
        else if (framework === 'vue') {
            deps.push('vue');
        }
        else if (framework === 'angular') {
            deps.push('@angular/core');
        }
        return deps;
    }
    populateTemplate(template, variables) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            result = result.replace(new RegExp(placeholder, 'g'), value);
        }
        return result;
    }
    getCurrentComponentName() {
        return 'Component';
    }
    getTypeScriptType(config) {
        if (config.type === 'string')
            return 'string';
        if (config.type === 'number')
            return 'number';
        if (config.type === 'boolean')
            return 'boolean';
        if (config.type === 'array')
            return 'any[]';
        if (config.type === 'object')
            return 'Record<string, any>';
        return 'any';
    }
    getVuePropType(config) {
        if (config.type === 'string')
            return 'String';
        if (config.type === 'number')
            return 'Number';
        if (config.type === 'boolean')
            return 'Boolean';
        if (config.type === 'array')
            return 'Array';
        if (config.type === 'object')
            return 'Object';
        return 'any';
    }
    async enhanceAccessibility(component, accessibility) {
        if (!accessibility)
            return component;
        let enhancedCode = component.code;
        if (accessibility.role) {
            enhancedCode = enhancedCode.replace(/(<[^>]+)/, `$1 role="${accessibility.role}"`);
        }
        if (accessibility.ariaLabel) {
            enhancedCode = enhancedCode.replace(/(<[^>]+)/, `$1 aria-label="${accessibility.ariaLabel}"`);
        }
        if (accessibility.keyboardNavigation) {
            enhancedCode = enhancedCode.replace(/(<[^>]+)/, `$1 onKeyDown={handleKeyDown} tabIndex={0}`);
        }
        return {
            ...component,
            code: enhancedCode,
        };
    }
    async applyResponsiveDesign(component, responsive) {
        if (!responsive)
            return component;
        return component;
    }
    async generateTests(component, spec) {
        const testCode = `
import { render, screen } from '@testing-library/react'
import { ${component.name} } from './${component.name}'

describe('${component.name}', () => {
  it('renders correctly', () => {
    render(<${component.name}>Test content</${component.name}>)
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  ${spec.accessibility ? `
  it('is accessible', async () => {
    const { container } = render(<${component.name}>Test</${component.name}>)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
  ` : ''}
})
    `;
        return {
            ...component,
            files: [
                ...component.files || [],
                {
                    name: `${component.name}.test.tsx`,
                    content: testCode,
                    type: 'test',
                },
            ],
        };
    }
    async generateDocumentation(component, spec) {
        const documentation = `
# ${component.name}

${spec.documentation || 'Auto-generated component documentation'}

## Props

${Object.entries(spec.props).map(([prop, config]) => `- **${prop}**: ${config.type} ${config.required === false ? '(optional)' : '(required)'}`).join('\n')}

## Usage

\`\`\`${component.framework === 'react' ? 'tsx' : component.framework}
<${component.name} prop="value">
  Content
</${component.name}>
\`\`\`

${spec.variants ? `
## Variants

${spec.variants.map(variant => `- ${variant}`).join('\n')}
` : ''}

## Accessibility

${spec.accessibility ? `
- WCAG 2.1 AA compliant
- Keyboard navigation: ${spec.accessibility.keyboardNavigation ? 'Yes' : 'No'}
- Screen reader support: ${spec.accessibility.screenReaderSupport ? 'Yes' : 'No'}
` : 'Standard accessibility features included'}
    `;
        return {
            ...component,
            files: [
                ...component.files || [],
                {
                    name: `${component.name}.md`,
                    content: documentation,
                    type: 'documentation',
                },
            ],
        };
    }
    applyVariantModifications(ast, modifications) {
        return ast;
    }
    extractTokenReferences(code) {
        const tokenPattern = /tokens\.[\w.]+/g;
        const matches = code.match(tokenPattern) || [];
        return [...new Set(matches)];
    }
    async getUpdatedTokens(tokenReferences) {
        const tokens = {};
        for (const reference of tokenReferences) {
            const tokenPath = reference.replace('tokens.', '').split('.');
            tokens[reference] = 'updated-value';
        }
        return tokens;
    }
    replaceTokenValues(code, updatedTokens) {
        let updatedCode = code;
        for (const [tokenRef, value] of Object.entries(updatedTokens)) {
            updatedCode = updatedCode.replace(new RegExp(tokenRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }
        return updatedCode;
    }
    generateAngularTemplate(spec) {
        return `
<div class="${spec.name.toLowerCase()}" [ngClass]="getClasses()">
  <ng-content></ng-content>
</div>
    `;
    }
}
//# sourceMappingURL=component-generator.js.map