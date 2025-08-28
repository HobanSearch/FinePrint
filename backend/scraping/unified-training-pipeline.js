#!/usr/bin/env node

/**
 * Unified Training Data Pipeline
 * Combines data from all sources into a comprehensive LoRA training dataset
 */

const fs = require('fs');
const path = require('path');

class UnifiedTrainingPipeline {
  constructor() {
    this.sources = {
      websites: {
        file: '../top50-real-analysis-complete.json',
        type: 'website',
        fields: ['privacy', 'terms']
      },
      failedSites: {
        file: 'failed-sites-reanalysis.json',
        type: 'website',
        fields: ['privacy', 'terms']
      },
      iosApps: {
        file: 'ios-app-analysis.json',
        type: 'mobile_app',
        fields: ['privacyPolicy', 'privacyLabels']
      },
      androidApps: {
        file: 'google-play-analysis.json',
        type: 'mobile_app',
        fields: ['privacyPolicy', 'details.dataSafety']
      },
      chromeExtensions: {
        file: 'chrome-extensions-analysis.json',
        type: 'browser_extension',
        fields: ['privacyPolicy', 'permissions']
      }
    };
    
    this.patternCategories = {
      data_collection: ['collect', 'gather', 'obtain', 'acquire', 'track'],
      data_sharing: ['share', 'disclose', 'provide', 'transfer', 'sell'],
      third_parties: ['third party', 'third-party', 'partner', 'affiliate', 'vendor'],
      user_rights: ['opt out', 'opt-out', 'delete', 'access', 'correct', 'port'],
      security: ['encrypt', 'secure', 'protect', 'safeguard', 'confidential'],
      legal: ['arbitration', 'class action', 'liability', 'indemnify', 'dispute'],
      transparency: ['gdpr', 'ccpa', 'privacy shield', 'compliance', 'transparent'],
      retention: ['retain', 'keep', 'store', 'maintain', 'preserve'],
      children: ['children', 'minor', 'under 13', 'coppa', 'parental'],
      advertising: ['advertis', 'marketing', 'promotional', 'commercial', 'sponsor']
    };
  }

  // Load data from a source
  loadSourceData(sourceName) {
    const source = this.sources[sourceName];
    const filePath = path.join(__dirname, source.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  ${sourceName} data not found at ${filePath}`);
      return null;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`  ✓ Loaded ${sourceName}: ${data.results?.length || 0} entries`);
      return data;
    } catch (error) {
      console.error(`  ✗ Error loading ${sourceName}:`, error.message);
      return null;
    }
  }

  // Extract training examples from a single item
  extractTrainingExamples(item, sourceType) {
    const examples = [];
    
    // Helper function to create training example
    const createExample = (text, patterns, metadata) => {
      if (!text || text.length < 100) return null;
      
      // Clean and normalize text
      const cleanText = text
        .replace(/\s+/g, ' ')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
      
      // Extract context windows around patterns
      const contexts = [];
      patterns.forEach(pattern => {
        if (pattern.example) {
          contexts.push({
            pattern: pattern.type,
            severity: pattern.severity,
            context: pattern.example
          });
        }
      });
      
      return {
        id: `${sourceType}_${item.id || item.name}_${Date.now()}`,
        source_type: sourceType,
        entity_name: item.name || item.id,
        entity_category: item.category || 'Unknown',
        document_type: metadata.docType,
        text_length: cleanText.length,
        risk_score: metadata.riskScore || 0,
        grade: metadata.grade || item.grade || 'Unknown',
        patterns_found: patterns.map(p => ({
          type: p.type,
          severity: p.severity,
          count: p.count || 1
        })),
        pattern_contexts: contexts,
        full_text: cleanText,
        timestamp: item.timestamp || new Date().toISOString()
      };
    };
    
    // Extract from websites
    if (sourceType === 'website') {
      if (item.privacy?.patterns) {
        const example = createExample(
          item.privacy.analyzedText || 'Privacy policy content',
          item.privacy.patterns,
          {
            docType: 'privacy_policy',
            riskScore: item.privacy.riskScore,
            grade: item.grade
          }
        );
        if (example) examples.push(example);
      }
      
      if (item.terms?.patterns) {
        const example = createExample(
          item.terms.analyzedText || 'Terms of service content',
          item.terms.patterns,
          {
            docType: 'terms_of_service',
            riskScore: item.terms.riskScore,
            grade: item.grade
          }
        );
        if (example) examples.push(example);
      }
    }
    
    // Extract from mobile apps
    else if (sourceType === 'mobile_app') {
      if (item.privacyPolicy?.patterns) {
        const example = createExample(
          'Privacy policy content',
          item.privacyPolicy.patterns,
          {
            docType: 'mobile_privacy_policy',
            riskScore: item.privacyPolicy.riskScore,
            grade: item.grade
          }
        );
        if (example) examples.push(example);
      }
      
      // Add privacy labels as structured data
      if (item.privacyLabels) {
        const labelExample = {
          id: `${sourceType}_${item.id}_labels_${Date.now()}`,
          source_type: sourceType,
          entity_name: item.name,
          entity_category: item.category || 'Unknown',
          document_type: 'privacy_labels',
          privacy_labels: {
            data_used_to_track: item.privacyLabels.dataUsedToTrackYou || [],
            data_linked_to_user: item.privacyLabels.dataLinkedToYou || [],
            data_not_linked: item.privacyLabels.dataNotLinkedToYou || []
          },
          risk_score: item.combinedScore || 0,
          grade: item.grade,
          timestamp: item.timestamp
        };
        examples.push(labelExample);
      }
      
      // Add data safety for Android
      if (item.details?.dataSafety) {
        const safetyExample = {
          id: `${sourceType}_${item.id}_safety_${Date.now()}`,
          source_type: sourceType,
          entity_name: item.name,
          entity_category: item.category || 'Unknown',
          document_type: 'data_safety',
          data_safety: {
            data_shared: item.details.dataSafety.dataShared || [],
            data_collected: item.details.dataSafety.dataCollected || [],
            security_practices: item.details.dataSafety.securityPractices || []
          },
          risk_score: item.combinedScore || 0,
          grade: item.grade,
          timestamp: item.timestamp
        };
        examples.push(safetyExample);
      }
    }
    
    // Extract from browser extensions
    else if (sourceType === 'browser_extension') {
      if (item.privacyPolicy?.patterns) {
        const example = createExample(
          'Privacy policy content',
          item.privacyPolicy.patterns,
          {
            docType: 'extension_privacy_policy',
            riskScore: item.privacyPolicy.riskScore,
            grade: item.grade
          }
        );
        if (example) examples.push(example);
      }
      
      // Add permissions as structured data
      if (item.permissions && item.permissions.length > 0) {
        const permExample = {
          id: `${sourceType}_${item.id}_perms_${Date.now()}`,
          source_type: sourceType,
          entity_name: item.name,
          entity_category: item.category || 'Unknown',
          document_type: 'extension_permissions',
          permissions: item.permissions,
          permission_risk_factors: item.permissions.filter(p =>
            p.toLowerCase().includes('all sites') ||
            p.toLowerCase().includes('all urls') ||
            p.toLowerCase().includes('modify data') ||
            p.toLowerCase().includes('browsing history')
          ),
          risk_score: item.combinedScore || 0,
          grade: item.grade,
          timestamp: item.timestamp
        };
        examples.push(permExample);
      }
    }
    
    return examples;
  }

  // Create pattern analysis summary
  createPatternAnalysis(allExamples) {
    const patternStats = {};
    const categoryStats = {};
    const gradeDistribution = {};
    
    allExamples.forEach(example => {
      // Pattern statistics
      if (example.patterns_found) {
        example.patterns_found.forEach(pattern => {
          if (!patternStats[pattern.type]) {
            patternStats[pattern.type] = {
              count: 0,
              severity_distribution: { high: 0, medium: 0, low: 0 },
              sources: new Set()
            };
          }
          patternStats[pattern.type].count += pattern.count || 1;
          patternStats[pattern.type].severity_distribution[pattern.severity]++;
          patternStats[pattern.type].sources.add(example.source_type);
        });
      }
      
      // Category statistics
      const category = example.entity_category || 'Unknown';
      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          avg_risk_score: 0,
          risk_scores: []
        };
      }
      categoryStats[category].count++;
      categoryStats[category].risk_scores.push(example.risk_score || 0);
      
      // Grade distribution
      const grade = example.grade || 'Unknown';
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    });
    
    // Calculate averages
    Object.keys(categoryStats).forEach(cat => {
      const scores = categoryStats[cat].risk_scores;
      categoryStats[cat].avg_risk_score = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      delete categoryStats[cat].risk_scores;
    });
    
    // Convert sets to arrays
    Object.keys(patternStats).forEach(pattern => {
      patternStats[pattern].sources = Array.from(patternStats[pattern].sources);
    });
    
    return {
      total_patterns_detected: Object.keys(patternStats).length,
      pattern_statistics: patternStats,
      category_analysis: categoryStats,
      grade_distribution: gradeDistribution
    };
  }

  // Generate LoRA training format
  generateLoRAFormat(examples) {
    const loraDataset = examples.map(example => {
      // Create instruction-response pairs for fine-tuning
      const instruction = `Analyze the following ${example.document_type} for privacy concerns and problematic patterns.`;
      
      let context = '';
      if (example.full_text) {
        context = example.full_text.substring(0, 2000); // Limit context length
      } else if (example.privacy_labels) {
        context = JSON.stringify(example.privacy_labels, null, 2);
      } else if (example.permissions) {
        context = `Permissions requested:\n${example.permissions.join('\n')}`;
      }
      
      let response = `Analysis of ${example.entity_name} (${example.entity_category}):\n\n`;
      response += `Risk Score: ${example.risk_score}/100\n`;
      response += `Grade: ${example.grade}\n\n`;
      
      if (example.patterns_found && example.patterns_found.length > 0) {
        response += 'Problematic patterns detected:\n';
        example.patterns_found.forEach(pattern => {
          response += `- ${pattern.type} (${pattern.severity} severity): ${pattern.count} instances\n`;
        });
        
        if (example.pattern_contexts && example.pattern_contexts.length > 0) {
          response += '\nExamples:\n';
          example.pattern_contexts.slice(0, 3).forEach(ctx => {
            response += `- ${ctx.pattern}: "${ctx.context.substring(0, 100)}..."\n`;
          });
        }
      }
      
      return {
        instruction,
        input: context,
        output: response,
        metadata: {
          source_type: example.source_type,
          document_type: example.document_type,
          risk_score: example.risk_score,
          grade: example.grade
        }
      };
    });
    
    return loraDataset;
  }

  // Main pipeline execution
  async runPipeline() {
    console.log('🚀 Unified Training Data Pipeline');
    console.log('=================================\n');
    
    const allExamples = [];
    const loadedSources = {};
    
    // Load data from all sources
    console.log('📥 Loading data sources...');
    for (const [sourceName, config] of Object.entries(this.sources)) {
      const data = this.loadSourceData(sourceName);
      if (data && data.results) {
        loadedSources[sourceName] = data;
        
        // Extract training examples
        let sourceExamples = 0;
        data.results.forEach(item => {
          const examples = this.extractTrainingExamples(item, config.type);
          allExamples.push(...examples);
          sourceExamples += examples.length;
        });
        
        console.log(`    → Extracted ${sourceExamples} training examples`);
      }
    }
    
    console.log(`\n📊 Total training examples: ${allExamples.length}`);
    
    // Create pattern analysis
    console.log('\n🔍 Analyzing patterns...');
    const patternAnalysis = this.createPatternAnalysis(allExamples);
    console.log(`  ✓ Detected ${patternAnalysis.total_patterns_detected} unique pattern types`);
    
    // Generate LoRA training format
    console.log('\n🎯 Generating LoRA training dataset...');
    const loraDataset = this.generateLoRAFormat(allExamples);
    
    // Save outputs
    console.log('\n💾 Saving training data...');
    
    // Save raw training examples
    const rawOutput = {
      metadata: {
        total_examples: allExamples.length,
        sources: Object.keys(loadedSources),
        generation_date: new Date().toISOString(),
        pattern_categories: Object.keys(this.patternCategories)
      },
      pattern_analysis: patternAnalysis,
      examples: allExamples
    };
    
    fs.writeFileSync(
      'unified-training-data.json',
      JSON.stringify(rawOutput, null, 2)
    );
    console.log('  ✓ Saved unified-training-data.json');
    
    // Save LoRA format
    const loraOutput = {
      metadata: {
        total_examples: loraDataset.length,
        model_type: 'instruction_following',
        task: 'privacy_policy_analysis',
        generation_date: new Date().toISOString()
      },
      training_data: loraDataset
    };
    
    fs.writeFileSync(
      'lora-training-dataset.json',
      JSON.stringify(loraOutput, null, 2)
    );
    console.log('  ✓ Saved lora-training-dataset.json');
    
    // Save JSONL format for training
    const jsonlPath = 'lora-training-dataset.jsonl';
    const jsonlContent = loraDataset.map(item => JSON.stringify({
      instruction: item.instruction,
      input: item.input,
      output: item.output
    })).join('\n');
    
    fs.writeFileSync(jsonlPath, jsonlContent);
    console.log('  ✓ Saved lora-training-dataset.jsonl');
    
    // Generate training statistics
    this.generateStatistics(allExamples, loraDataset);
    
    console.log('\n✅ Pipeline completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review the training data in unified-training-data.json');
    console.log('2. Use lora-training-dataset.jsonl for LoRA fine-tuning');
    console.log('3. Run: python train-lora.py --data lora-training-dataset.jsonl');
    
    return {
      totalExamples: allExamples.length,
      loraDatasetSize: loraDataset.length,
      patternAnalysis
    };
  }

  // Generate comprehensive statistics
  generateStatistics(examples, loraDataset) {
    const stats = {
      dataset_overview: {
        total_raw_examples: examples.length,
        total_lora_examples: loraDataset.length,
        unique_entities: new Set(examples.map(e => e.entity_name)).size,
        document_types: {},
        source_distribution: {}
      },
      quality_metrics: {
        avg_text_length: 0,
        examples_with_patterns: 0,
        examples_with_high_risk: 0,
        grade_distribution: {}
      },
      pattern_insights: {
        most_common_patterns: [],
        high_severity_patterns: [],
        patterns_by_source: {}
      }
    };
    
    // Calculate statistics
    let totalTextLength = 0;
    examples.forEach(example => {
      // Document types
      stats.dataset_overview.document_types[example.document_type] = 
        (stats.dataset_overview.document_types[example.document_type] || 0) + 1;
      
      // Source distribution
      stats.dataset_overview.source_distribution[example.source_type] = 
        (stats.dataset_overview.source_distribution[example.source_type] || 0) + 1;
      
      // Quality metrics
      if (example.text_length) {
        totalTextLength += example.text_length;
      }
      
      if (example.patterns_found && example.patterns_found.length > 0) {
        stats.quality_metrics.examples_with_patterns++;
      }
      
      if (example.risk_score >= 70) {
        stats.quality_metrics.examples_with_high_risk++;
      }
      
      // Grade distribution
      const grade = example.grade || 'Unknown';
      stats.quality_metrics.grade_distribution[grade] = 
        (stats.quality_metrics.grade_distribution[grade] || 0) + 1;
    });
    
    // Calculate averages
    stats.quality_metrics.avg_text_length = examples.length > 0
      ? Math.round(totalTextLength / examples.filter(e => e.text_length).length)
      : 0;
    
    // Save statistics
    fs.writeFileSync(
      'training-data-statistics.json',
      JSON.stringify(stats, null, 2)
    );
    console.log('  ✓ Saved training-data-statistics.json');
    
    // Display summary
    console.log('\n📈 Training Data Summary:');
    console.log(`  • Total examples: ${stats.dataset_overview.total_raw_examples}`);
    console.log(`  • Unique entities: ${stats.dataset_overview.unique_entities}`);
    console.log(`  • Examples with patterns: ${stats.quality_metrics.examples_with_patterns}`);
    console.log(`  • High-risk examples: ${stats.quality_metrics.examples_with_high_risk}`);
    console.log(`  • Average text length: ${stats.quality_metrics.avg_text_length} characters`);
  }
}

// Run the pipeline
if (require.main === module) {
  const pipeline = new UnifiedTrainingPipeline();
  pipeline.runPipeline().catch(console.error);
}

module.exports = UnifiedTrainingPipeline;