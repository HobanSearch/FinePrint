#!/usr/bin/env node

/**
 * Expanded Unified Training Data Pipeline
 * Combines data from all sources: websites, iOS apps, Android apps, and Chrome extensions
 */

const fs = require('fs');
const path = require('path');

class ExpandedUnifiedPipeline {
  constructor() {
    this.sources = {
      websites: {
        file: '../top50-real-analysis-complete.json',
        type: 'website',
        fields: ['privacy', 'terms']
      },
      iosApps: {
        file: '../ios-app-analysis-simple.json',
        type: 'mobile_app',
        platform: 'ios'
      },
      androidApps: {
        file: 'google-play-analysis-simple.json',
        type: 'mobile_app',
        platform: 'android'
      },
      chromeExtensions: {
        file: 'chrome-extensions-analysis-simple.json',
        type: 'browser_extension',
        platform: 'chrome'
      }
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

  // Extract training examples from websites
  extractWebsiteExamples(item) {
    const examples = [];
    
    // Helper function to create training example
    const createExample = (docData, docType) => {
      if (!docData || !docData.fetchSuccess) return null;
      
      return {
        id: `website_${item.id || item.name}_${docType}_${Date.now()}`,
        source_type: 'website',
        entity_name: item.name || item.id,
        entity_category: item.category || 'Unknown',
        document_type: docType,
        risk_score: docData.riskScore || 40,
        grade: item.grade || 'A',
        patterns_found: docData.patterns || [],
        pattern_count: docData.patternCount || 0,
        analyzed_length: docData.analyzedLength || 0,
        has_gdpr: docData.hasGDPR || false,
        has_children_policy: docData.hasChildrenPolicy || false,
        data_quality: item.dataQuality || 'unknown',
        timestamp: item.timestamp || new Date().toISOString()
      };
    };
    
    // Extract from privacy policy
    if (item.privacy) {
      const example = createExample(item.privacy, 'privacy_policy');
      if (example) examples.push(example);
    }
    
    // Extract from terms of service
    if (item.terms) {
      const example = createExample(item.terms, 'terms_of_service');
      if (example) examples.push(example);
    }
    
    return examples;
  }

  // Extract training examples from mobile apps
  extractMobileAppExamples(item, platform) {
    const examples = [];
    
    const example = {
      id: `${platform}_app_${item.id}_${Date.now()}`,
      source_type: 'mobile_app',
      platform: platform,
      entity_name: item.name,
      entity_category: item.category || 'Unknown',
      developer: item.developer,
      document_type: 'app_metadata',
      has_privacy_policy: item.hasPrivacyPolicy || false,
      privacy_policy_url: item.privacyPolicyUrl || null,
      risk_score: item.riskScore || item.combinedScore || 0,
      grade: item.grade || 'Unknown',
      rating: item.rating || 0,
      rating_count: item.ratingCount || 0,
      content_rating: item.contentRating || 'Unknown',
      patterns_found: item.patterns || [],
      pattern_count: item.patternCount || (item.patterns ? item.patterns.length : 0),
      data_sharing: item.dataSharing || {},
      data_collection: item.dataCollection || {},
      security: item.security || {},
      timestamp: item.timestamp || new Date().toISOString()
    };
    
    examples.push(example);
    return examples;
  }

  // Extract training examples from browser extensions
  extractExtensionExamples(item) {
    const examples = [];
    
    const example = {
      id: `chrome_ext_${item.id}_${Date.now()}`,
      source_type: 'browser_extension',
      platform: 'chrome',
      entity_name: item.name,
      entity_category: item.category || 'Unknown',
      developer: item.developer,
      document_type: 'extension_metadata',
      permissions: item.permissions || [],
      permission_count: item.permissionCount || 0,
      has_privacy_policy: item.hasPrivacyPolicy || false,
      risk_score: item.riskScore || 0,
      grade: item.grade || 'Unknown',
      patterns_found: item.patterns || [],
      pattern_count: item.patternCount || 0,
      risk_factors: item.riskFactors || {},
      trust_indicators: item.trustIndicators || {},
      timestamp: item.timestamp || new Date().toISOString()
    };
    
    examples.push(example);
    return examples;
  }

  // Create pattern analysis summary
  createPatternAnalysis(allExamples) {
    const stats = {
      total_examples: allExamples.length,
      by_source_type: {},
      by_document_type: {},
      by_platform: {},
      by_grade: {},
      risk_score_distribution: {
        low: 0,    // 0-33
        medium: 0, // 34-66
        high: 0    // 67-100
      },
      pattern_frequency: {},
      privacy_policy_coverage: {
        has_policy: 0,
        no_policy: 0
      }
    };
    
    allExamples.forEach(example => {
      // Source type
      stats.by_source_type[example.source_type] = (stats.by_source_type[example.source_type] || 0) + 1;
      
      // Document type
      stats.by_document_type[example.document_type] = (stats.by_document_type[example.document_type] || 0) + 1;
      
      // Platform
      if (example.platform) {
        stats.by_platform[example.platform] = (stats.by_platform[example.platform] || 0) + 1;
      }
      
      // Grade
      stats.by_grade[example.grade] = (stats.by_grade[example.grade] || 0) + 1;
      
      // Risk score distribution
      if (example.risk_score <= 33) stats.risk_score_distribution.low++;
      else if (example.risk_score <= 66) stats.risk_score_distribution.medium++;
      else stats.risk_score_distribution.high++;
      
      // Pattern frequency
      if (example.patterns_found && Array.isArray(example.patterns_found)) {
        example.patterns_found.forEach(pattern => {
          const patternType = pattern.type || 'unknown';
          stats.pattern_frequency[patternType] = (stats.pattern_frequency[patternType] || 0) + 1;
        });
      }
      
      // Privacy policy coverage
      if (example.has_privacy_policy !== undefined) {
        if (example.has_privacy_policy) {
          stats.privacy_policy_coverage.has_policy++;
        } else {
          stats.privacy_policy_coverage.no_policy++;
        }
      }
    });
    
    return stats;
  }

  // Generate LoRA training format
  generateLoRAFormat(examples) {
    const loraDataset = examples.map(example => {
      let instruction = '';
      let context = '';
      let response = '';
      
      if (example.source_type === 'website') {
        instruction = `Analyze the following ${example.document_type} for privacy concerns and assign a risk score.`;
        context = `Document from ${example.entity_name} (${example.entity_category})`;
        response = `Risk Assessment:\n- Risk Score: ${example.risk_score}/100\n- Grade: ${example.grade}\n- Patterns Found: ${example.pattern_count}\n`;
        
        if (example.patterns_found && example.patterns_found.length > 0) {
          response += '\nKey Concerns:\n';
          example.patterns_found.slice(0, 5).forEach(pattern => {
            response += `- ${pattern.type ? pattern.type.replace(/_/g, ' ') : 'Unknown'}: ${pattern.severity || 'medium'} severity\n`;
          });
        }
      } else if (example.source_type === 'mobile_app') {
        instruction = `Assess the privacy practices of this mobile application based on available metadata.`;
        context = `App: ${example.entity_name}\nDeveloper: ${example.developer}\nCategory: ${example.entity_category}\nPlatform: ${example.platform}\nPrivacy Policy: ${example.has_privacy_policy ? 'Yes' : 'No'}`;
        response = `Privacy Assessment:\n- Risk Score: ${example.risk_score}/100\n- Grade: ${example.grade}\n- Has Privacy Policy: ${example.has_privacy_policy ? 'Yes' : 'No'}\n`;
        
        if (!example.has_privacy_policy) {
          response += '\n⚠️ Warning: No privacy policy provided, which is a significant privacy concern.';
        }
        
        if (example.patterns_found && example.patterns_found.length > 0) {
          response += '\n\nIdentified Risks:\n';
          example.patterns_found.forEach(pattern => {
            response += `- ${pattern.description || pattern.type}\n`;
          });
        }
      } else if (example.source_type === 'browser_extension') {
        instruction = `Evaluate the privacy and security risks of this browser extension based on its permissions and metadata.`;
        context = `Extension: ${example.entity_name}\nDeveloper: ${example.developer}\nCategory: ${example.entity_category}\nPermissions: ${example.permissions.join(', ')}`;
        response = `Extension Risk Assessment:\n- Risk Score: ${example.risk_score}/100\n- Grade: ${example.grade}\n- Permission Count: ${example.permission_count}\n`;
        
        if (example.risk_factors) {
          response += '\nRisk Factors:\n';
          Object.entries(example.risk_factors).forEach(([factor, value]) => {
            if (value) {
              response += `- ${factor.replace(/([A-Z])/g, ' $1').trim()}: Yes\n`;
            }
          });
        }
        
        if (example.patterns_found && example.patterns_found.length > 0) {
          response += '\nSecurity Concerns:\n';
          example.patterns_found.forEach(pattern => {
            response += `- ${pattern.description || pattern.type}\n`;
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
          grade: example.grade,
          platform: example.platform || 'web'
        }
      };
    });
    
    return loraDataset;
  }

  // Main pipeline execution
  async runPipeline() {
    console.log('🚀 Expanded Unified Training Data Pipeline');
    console.log('=========================================\n');
    
    const allExamples = [];
    const loadedSources = {};
    
    // Load data from all available sources
    console.log('📥 Loading data sources...');
    
    // Load website data
    const websiteData = this.loadSourceData('websites');
    if (websiteData && websiteData.results) {
      loadedSources.websites = websiteData;
      
      let websiteExamples = 0;
      websiteData.results.forEach(item => {
        const examples = this.extractWebsiteExamples(item);
        allExamples.push(...examples);
        websiteExamples += examples.length;
      });
      
      console.log(`    → Extracted ${websiteExamples} website examples`);
    }
    
    // Load iOS app data
    const iosData = this.loadSourceData('iosApps');
    if (iosData && iosData.results) {
      loadedSources.iosApps = iosData;
      
      let iosExamples = 0;
      iosData.results.forEach(item => {
        const examples = this.extractMobileAppExamples(item, 'ios');
        allExamples.push(...examples);
        iosExamples += examples.length;
      });
      
      console.log(`    → Extracted ${iosExamples} iOS app examples`);
    }
    
    // Load Android app data
    const androidData = this.loadSourceData('androidApps');
    if (androidData && androidData.results) {
      loadedSources.androidApps = androidData;
      
      let androidExamples = 0;
      androidData.results.forEach(item => {
        const examples = this.extractMobileAppExamples(item, 'android');
        allExamples.push(...examples);
        androidExamples += examples.length;
      });
      
      console.log(`    → Extracted ${androidExamples} Android app examples`);
    }
    
    // Load Chrome extension data
    const chromeData = this.loadSourceData('chromeExtensions');
    if (chromeData && chromeData.results) {
      loadedSources.chromeExtensions = chromeData;
      
      let chromeExamples = 0;
      chromeData.results.forEach(item => {
        const examples = this.extractExtensionExamples(item);
        allExamples.push(...examples);
        chromeExamples += examples.length;
      });
      
      console.log(`    → Extracted ${chromeExamples} Chrome extension examples`);
    }
    
    console.log(`\n📊 Total training examples: ${allExamples.length}`);
    
    // Create pattern analysis
    console.log('\n🔍 Analyzing patterns...');
    const patternAnalysis = this.createPatternAnalysis(allExamples);
    
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
        version: 'expanded'
      },
      pattern_analysis: patternAnalysis,
      examples: allExamples
    };
    
    fs.writeFileSync(
      'unified-training-data-expanded.json',
      JSON.stringify(rawOutput, null, 2)
    );
    console.log('  ✓ Saved unified-training-data-expanded.json');
    
    // Save LoRA format
    const loraOutput = {
      metadata: {
        total_examples: loraDataset.length,
        model_type: 'instruction_following',
        task: 'privacy_policy_analysis',
        generation_date: new Date().toISOString(),
        version: 'expanded'
      },
      training_data: loraDataset
    };
    
    fs.writeFileSync(
      'lora-training-dataset-expanded.json',
      JSON.stringify(loraOutput, null, 2)
    );
    console.log('  ✓ Saved lora-training-dataset-expanded.json');
    
    // Save JSONL format for training
    const jsonlPath = 'lora-training-dataset-expanded.jsonl';
    const jsonlContent = loraDataset.map(item => JSON.stringify({
      instruction: item.instruction,
      input: item.input,
      output: item.output
    })).join('\n');
    
    fs.writeFileSync(jsonlPath, jsonlContent);
    console.log('  ✓ Saved lora-training-dataset-expanded.jsonl');
    
    // Display summary
    console.log('\n📈 Training Data Summary:');
    console.log(`  • Total examples: ${allExamples.length}`);
    console.log(`  • Website examples: ${patternAnalysis.by_source_type.website || 0}`);
    console.log(`  • Mobile app examples: ${patternAnalysis.by_source_type.mobile_app || 0}`);
    console.log(`  • Browser extension examples: ${patternAnalysis.by_source_type.browser_extension || 0}`);
    console.log('\n  • Platform breakdown:');
    Object.entries(patternAnalysis.by_platform).forEach(([platform, count]) => {
      console.log(`    - ${platform}: ${count}`);
    });
    console.log('\n  • Risk distribution:');
    console.log(`    - High risk: ${patternAnalysis.risk_score_distribution.high}`);
    console.log(`    - Medium risk: ${patternAnalysis.risk_score_distribution.medium}`);
    console.log(`    - Low risk: ${patternAnalysis.risk_score_distribution.low}`);
    console.log('\n  • Privacy policy coverage:');
    console.log(`    - Has policy: ${patternAnalysis.privacy_policy_coverage.has_policy}`);
    console.log(`    - No policy: ${patternAnalysis.privacy_policy_coverage.no_policy}`);
    
    console.log('\n✅ Expanded pipeline completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review the expanded training data');
    console.log('2. Use lora-training-dataset-expanded.jsonl for comprehensive LoRA fine-tuning');
    console.log('3. The dataset now includes websites, iOS apps, Android apps, and Chrome extensions');
    
    return {
      totalExamples: allExamples.length,
      loraDatasetSize: loraDataset.length,
      patternAnalysis
    };
  }
}

// Run the pipeline
if (require.main === module) {
  const pipeline = new ExpandedUnifiedPipeline();
  pipeline.runPipeline().catch(console.error);
}

module.exports = ExpandedUnifiedPipeline;