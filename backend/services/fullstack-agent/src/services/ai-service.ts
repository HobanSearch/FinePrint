import axios from 'axios';
import { Logger } from '@/utils/logger';
import { Cache } from '@/utils/cache';
import { config } from '@/config';

export interface AIModelConfig {
  name: string;
  endpoint: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface AIGenerationRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  context?: Record<string, any>;
}

export interface AIGenerationResponse {
  content: string;
  model: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: string;
  processingTime: number;
}

export class AIService {
  private readonly logger = Logger.getInstance();
  private readonly cache = new Cache('ai-responses');
  private readonly models: Map<string, AIModelConfig> = new Map();

  constructor() {
    this.initializeModels();
  }

  /**
   * Generate code using AI
   */
  async generateCode(prompt: string, language: string, model?: string): Promise<string> {
    try {
      const systemPrompt = this.buildCodeGenerationSystemPrompt(language);
      
      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.codeGeneration,
        systemPrompt,
        temperature: 0.3, // Lower temperature for more consistent code
        maxTokens: config.ai.ollama.maxTokens,
      };

      const response = await this.generate(request);
      return this.extractCodeFromResponse(response.content, language);
    } catch (error) {
      this.logger.error('AI code generation failed', { error: error.message, language });
      throw error;
    }
  }

  /**
   * Generate structured response (JSON)
   */
  async generateStructuredResponse(prompt: string, model?: string): Promise<string> {
    try {
      const systemPrompt = `
You are an expert at generating structured JSON responses.
Always respond with valid JSON that matches the requested schema.
Do not include any additional text or explanations outside the JSON.
      `.trim();

      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.architectureDecisions,
        systemPrompt,
        temperature: 0.2,
        maxTokens: config.ai.ollama.maxTokens,
      };

      const response = await this.generate(request);
      return this.extractJsonFromResponse(response.content);
    } catch (error) {
      this.logger.error('AI structured response generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate context enhancement
   */
  async generateContext(prompt: string, model?: string): Promise<string> {
    try {
      const systemPrompt = `
You are an expert software architect and developer.
Analyze the given requirements and provide helpful context and suggestions.
Focus on practical, actionable insights that will improve code generation.
Respond with valid JSON containing your analysis and recommendations.
      `.trim();

      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.architectureDecisions,
        systemPrompt,
        temperature: 0.4,
        maxTokens: 2048,
      };

      const response = await this.generate(request);
      return this.extractJsonFromResponse(response.content);
    } catch (error) {
      this.logger.error('AI context generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate architecture recommendations
   */
  async generateArchitectureRecommendation(
    requirements: string[],
    constraints: string[],
    options: any[],
    model?: string
  ): Promise<string> {
    try {
      const prompt = `
Analyze the following architecture decision scenario:

Requirements:
${requirements.map(r => `- ${r}`).join('\n')}

Constraints:
${constraints.map(c => `- ${c}`).join('\n')}

Options:
${options.map(o => `- ${o.name}: ${o.description}`).join('\n')}

Provide a detailed recommendation including:
1. Recommended option with justification
2. Risk analysis
3. Implementation considerations
4. Alternative approaches

Respond with a structured JSON format.
      `.trim();

      return await this.generateStructuredResponse(prompt, model);
    } catch (error) {
      this.logger.error('AI architecture recommendation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate quality assessment
   */
  async generateQualityAssessment(
    code: string,
    language: string,
    checks: string[],
    model?: string
  ): Promise<string> {
    try {
      const prompt = `
Perform a comprehensive quality assessment of the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Assessment areas:
${checks.map(c => `- ${c}`).join('\n')}

Provide detailed analysis including:
1. Overall quality score (0-100)
2. Specific issues found
3. Recommendations for improvement
4. Best practices compliance
5. Security considerations

Respond with structured JSON format.
      `.trim();

      return await this.generateStructuredResponse(prompt, model);
    } catch (error) {
      this.logger.error('AI quality assessment failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate documentation
   */
  async generateDocumentation(
    code: string,
    language: string,
    type: 'api' | 'component' | 'readme' | 'tutorial',
    model?: string
  ): Promise<string> {
    try {
      const systemPrompt = this.buildDocumentationSystemPrompt(type);
      
      const prompt = `
Generate ${type} documentation for the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

The documentation should be comprehensive, well-structured, and include examples where appropriate.
      `.trim();

      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.codeGeneration,
        systemPrompt,
        temperature: 0.5,
        maxTokens: config.ai.ollama.maxTokens,
      };

      const response = await this.generate(request);
      return response.content;
    } catch (error) {
      this.logger.error('AI documentation generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate test cases
   */
  async generateTestCases(
    code: string,
    language: string,
    testFramework: string,
    model?: string
  ): Promise<string> {
    try {
      const systemPrompt = `
You are an expert test engineer. Generate comprehensive test cases for the given code.
Use ${testFramework} testing framework for ${language}.
Include unit tests, integration tests, and edge cases.
Follow testing best practices and ensure good coverage.
      `.trim();

      const prompt = `
Generate comprehensive test cases for the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Test framework: ${testFramework}

Include:
1. Unit tests covering all functions/methods
2. Edge cases and error conditions
3. Mock setup where needed
4. Test data and fixtures
5. Integration tests if applicable
      `.trim();

      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.codeGeneration,
        systemPrompt,
        temperature: 0.3,
        maxTokens: config.ai.ollama.maxTokens,
      };

      const response = await this.generate(request);
      return this.extractCodeFromResponse(response.content, language);
    } catch (error) {
      this.logger.error('AI test generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Explain code functionality
   */
  async explainCode(
    code: string,
    language: string,
    audience: 'developer' | 'manager' | 'user' = 'developer',
    model?: string
  ): Promise<string> {
    try {
      const systemPrompt = this.buildExplanationSystemPrompt(audience);
      
      const prompt = `
Explain the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Target audience: ${audience}
      `.trim();

      const request: AIGenerationRequest = {
        prompt,
        model: model || config.ai.ollama.models.codeGeneration,
        systemPrompt,
        temperature: 0.6,
        maxTokens: 2048,
      };

      const response = await this.generate(request);
      return response.content;
    } catch (error) {
      this.logger.error('AI code explanation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Core AI generation method
   */
  private async generate(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.cache.get<AIGenerationResponse>(cacheKey);
      if (cached) {
        this.logger.debug('Using cached AI response', { model: request.model });
        return cached;
      }

      const modelConfig = this.getModelConfig(request.model || 'default');
      
      // Prepare request payload
      const payload = {
        model: modelConfig.name,
        prompt: this.buildFullPrompt(request),
        options: {
          temperature: request.temperature || 0.7,
          max_tokens: request.maxTokens || modelConfig.maxTokens,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        },
        stream: false,
      };

      // Make API request
      const response = await axios.post(
        `${modelConfig.endpoint}/api/generate`,
        payload,
        {
          timeout: modelConfig.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const processingTime = Date.now() - startTime;
      
      const result: AIGenerationResponse = {
        content: response.data.response || '',
        model: modelConfig.name,
        tokens: {
          prompt: response.data.prompt_eval_count || 0,
          completion: response.data.eval_count || 0,
          total: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0),
        },
        finishReason: response.data.done ? 'stop' : 'length',
        processingTime,
      };

      // Cache the response
      await this.cache.set(cacheKey, result, 3600); // 1 hour

      this.logger.info('AI generation completed', {
        model: modelConfig.name,
        tokens: result.tokens.total,
        processingTime,
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('AI generation failed', {
        error: error.message,
        model: request.model,
        processingTime,
      });
      throw error;
    }
  }

  private initializeModels(): void {
    // Ollama models
    this.models.set('codellama', {
      name: 'codellama:7b',
      endpoint: config.ai.ollama.baseUrl,
      maxTokens: 4096,
      temperature: 0.3,
      timeout: 30000,
    });

    this.models.set('mixtral', {
      name: 'mixtral:8x7b',
      endpoint: config.ai.ollama.baseUrl,
      maxTokens: 4096,
      temperature: 0.5,
      timeout: 60000,
    });

    this.models.set('phi', {
      name: 'phi:2.7b',
      endpoint: config.ai.ollama.baseUrl,
      maxTokens: 2048,
      temperature: 0.4,
      timeout: 15000,
    });

    // Default model
    this.models.set('default', {
      name: config.ai.ollama.models.codeGeneration,
      endpoint: config.ai.ollama.baseUrl,
      maxTokens: config.ai.ollama.maxTokens,
      temperature: 0.5,
      timeout: config.ai.ollama.timeout,
    });

    this.logger.info('AI models initialized', {
      modelCount: this.models.size,
      models: Array.from(this.models.keys()),
    });
  }

  private getModelConfig(modelName: string): AIModelConfig {
    const config = this.models.get(modelName);
    if (!config) {
      this.logger.warn('Unknown model requested, using default', { modelName });
      return this.models.get('default')!;
    }
    return config;
  }

  private buildFullPrompt(request: AIGenerationRequest): string {
    let fullPrompt = '';

    if (request.systemPrompt) {
      fullPrompt += `System: ${request.systemPrompt}\n\n`;
    }

    if (request.context) {
      fullPrompt += `Context:\n${JSON.stringify(request.context, null, 2)}\n\n`;
    }

    fullPrompt += `Human: ${request.prompt}\n\nAssistant:`;

    return fullPrompt;
  }

  private buildCodeGenerationSystemPrompt(language: string): string {
    return `
You are an expert ${language} developer and software architect.
Generate clean, well-structured, and maintainable code that follows best practices.

Guidelines:
- Write production-ready code with proper error handling
- Include comprehensive comments and documentation
- Follow language-specific conventions and patterns
- Ensure code is secure and performant
- Include type annotations where applicable
- Use modern language features appropriately
- Structure code for readability and maintainability

Response format:
- Provide only the code without additional explanations
- Use proper indentation and formatting
- Include necessary imports and dependencies
    `.trim();
  }

  private buildDocumentationSystemPrompt(type: string): string {
    const typeSpecific = {
      api: 'Focus on endpoints, parameters, responses, and examples',
      component: 'Focus on props, usage examples, and customization options',
      readme: 'Focus on overview, installation, usage, and contribution guidelines',
      tutorial: 'Focus on step-by-step instructions and learning objectives',
    };

    return `
You are a technical writer specializing in software documentation.
Create comprehensive, clear, and well-organized documentation.

Guidelines:
- Use clear, concise language
- Include practical examples
- Structure content logically
- Use appropriate markdown formatting
- ${typeSpecific[type as keyof typeof typeSpecific]}
- Consider the target audience's knowledge level
    `.trim();
  }

  private buildExplanationSystemPrompt(audience: string): string {
    const audienceSpecific = {
      developer: 'Use technical terms and focus on implementation details',
      manager: 'Focus on business value and high-level functionality',
      user: 'Use simple language and focus on what the code does for them',
    };

    return `
You are an expert at explaining code to different audiences.
Provide clear, accurate explanations tailored to the target audience.

Guidelines:
- ${audienceSpecific[audience as keyof typeof audienceSpecific]}
- Use analogies and examples when helpful
- Break down complex concepts into understandable parts
- Be accurate but accessible
- Highlight important aspects and potential concerns
    `.trim();
  }

  private extractCodeFromResponse(response: string, language: string): string {
    // Look for code blocks
    const codeBlockRegex = new RegExp(`\`\`\`${language}?\\s*([\\s\\S]*?)\`\`\``, 'gi');
    const match = codeBlockRegex.exec(response);
    
    if (match) {
      return match[1].trim();
    }

    // Look for inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    const inlineMatch = inlineCodeRegex.exec(response);
    
    if (inlineMatch) {
      return inlineMatch[1].trim();
    }

    // Return the whole response if no code blocks found
    return response.trim();
  }

  private extractJsonFromResponse(response: string): string {
    try {
      // Look for JSON blocks
      const jsonBlockRegex = /```json\s*([\s\S]*?)```/gi;
      const match = jsonBlockRegex.exec(response);
      
      if (match) {
        const json = match[1].trim();
        JSON.parse(json); // Validate
        return json;
      }

      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const json = jsonMatch[0];
        JSON.parse(json); // Validate
        return json;
      }

      // If no JSON found, assume the whole response is JSON
      JSON.parse(response); // Validate
      return response.trim();
    } catch (error) {
      this.logger.error('Failed to extract valid JSON from AI response', {
        error: error.message,
        response: response.substring(0, 500),
      });
      throw new Error('AI response does not contain valid JSON');
    }
  }

  private generateCacheKey(request: AIGenerationRequest): string {
    const key = {
      model: request.model,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    };
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }
}