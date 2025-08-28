#!/usr/bin/env node

/**
 * Simplified Unified Training Data Pipeline
 * Works with available data without Puppeteer dependencies
 */

const fs = require('fs');
const path = require('path');

class SimplifiedTrainingPipeline {
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
        fields: ['privacyAnalysis']
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

  // Extract training examples from websites
  extractWebsiteExamples(item) {
    const examples = [];
    
    // Helper function to create training example
    const createExample = (docData, metadata) => {
      if (!docData || !docData.fetchSuccess) return null;
      
      return {
        id: `website_${item.id || item.name}_${metadata.docType}_${Date.now()}`,
        source_type: 'website',
        entity_name: item.name || item.id,
        entity_category: item.category || 'Unknown',
        document_type: metadata.docType,
        risk_score: docData.riskScore || 0,
        grade: item.grade || 'Unknown',
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
    if (item.privacy && item.privacy.fetchSuccess) {
      const example = createExample(
        item.privacy,
        {
          docType: 'privacy_policy'
        }
      );
      if (example) examples.push(example);
    }
    
    // Extract from terms of service
    if (item.terms && item.terms.fetchSuccess) {
      const example = createExample(
        item.terms,
        {
          docType: 'terms_of_service'
        }
      );
      if (example) examples.push(example);
    }
    
    return examples;
  }

  // Extract training examples from iOS apps
  extractiOSAppExamples(item) {
    const examples = [];
    
    const example = {
      id: `ios_app_${item.id}_${Date.now()}`,
      source_type: 'mobile_app',
      platform: 'ios',
      entity_name: item.name,
      entity_category: item.category || 'Unknown',
      developer: item.developer,
      document_type: 'app_metadata',
      has_privacy_policy: item.privacyAnalysis?.hasPrivacyPolicy || false,
      privacy_policy_url: item.privacyPolicyUrl || null,
      risk_score: item.combinedScore || 0,
      grade: item.grade || 'Unknown',
      rating: item.rating || 0,
      rating_count: item.ratingCount || 0,
      content_rating: item.contentRating || 'Unknown',
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
      by_grade: {},
      risk_score_distribution: {
        low: 0,    // 0-33
        medium: 0, // 34-66
        high: 0    // 67-100
      }
    };
    
    allExamples.forEach(example => {
      // Source type
      stats.by_source_type[example.source_type] = (stats.by_source_type[example.source_type] || 0) + 1;
      
      // Document type
      stats.by_document_type[example.document_type] = (stats.by_document_type[example.document_type] || 0) + 1;
      
      // Grade
      stats.by_grade[example.grade] = (stats.by_grade[example.grade] || 0) + 1;
      
      // Risk score distribution
      if (example.risk_score <= 33) stats.risk_score_distribution.low++;
      else if (example.risk_score <= 66) stats.risk_score_distribution.medium++;
      else stats.risk_score_distribution.high++;
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
            response += `- ${pattern.type.replace(/_/g, ' ')}: ${pattern.severity} severity\n`;
          });
        }
      } else if (example.source_type === 'mobile_app') {
        instruction = `Assess the privacy practices of this mobile application based on available metadata.`;
        context = `App: ${example.entity_name}\nDeveloper: ${example.developer}\nCategory: ${example.entity_category}\nPrivacy Policy: ${example.has_privacy_policy ? 'Yes' : 'No'}`;
        response = `Privacy Assessment:\n- Risk Score: ${example.risk_score}/100\n- Grade: ${example.grade}\n- Has Privacy Policy: ${example.has_privacy_policy ? 'Yes' : 'No'}\n`;
        
        if (!example.has_privacy_policy) {
          response += '\n⚠️ Warning: No privacy policy provided, which is a significant privacy concern.';
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
    console.log('🚀 Simplified Unified Training Data Pipeline');
    console.log('==========================================\n');
    
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
        const examples = this.extractiOSAppExamples(item);
        allExamples.push(...examples);
        iosExamples += examples.length;
      });
      
      console.log(`    → Extracted ${iosExamples} iOS app examples`);
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
        version: 'simplified'
      },
      pattern_analysis: patternAnalysis,
      examples: allExamples
    };
    
    fs.writeFileSync(
      'unified-training-data-simple.json',
      JSON.stringify(rawOutput, null, 2)
    );
    console.log('  ✓ Saved unified-training-data-simple.json');
    
    // Save LoRA format
    const loraOutput = {
      metadata: {
        total_examples: loraDataset.length,
        model_type: 'instruction_following',
        task: 'privacy_policy_analysis',
        generation_date: new Date().toISOString(),
        version: 'simplified'
      },
      training_data: loraDataset
    };
    
    fs.writeFileSync(
      'lora-training-dataset-simple.json',
      JSON.stringify(loraOutput, null, 2)
    );
    console.log('  ✓ Saved lora-training-dataset-simple.json');
    
    // Save JSONL format for training
    const jsonlPath = 'lora-training-dataset.jsonl';
    const jsonlContent = loraDataset.map(item => JSON.stringify({
      instruction: item.instruction,
      input: item.input,
      output: item.output
    })).join('\n');
    
    fs.writeFileSync(jsonlPath, jsonlContent);
    console.log('  ✓ Saved lora-training-dataset.jsonl');
    
    // Display summary
    console.log('\n📈 Training Data Summary:');
    console.log(`  • Total examples: ${allExamples.length}`);
    console.log(`  • Website examples: ${patternAnalysis.by_source_type.website || 0}`);
    console.log(`  • Mobile app examples: ${patternAnalysis.by_source_type.mobile_app || 0}`);
    console.log(`  • High risk examples: ${patternAnalysis.risk_score_distribution.high}`);
    console.log(`  • Medium risk examples: ${patternAnalysis.risk_score_distribution.medium}`);
    console.log(`  • Low risk examples: ${patternAnalysis.risk_score_distribution.low}`);
    
    console.log('\n✅ Pipeline completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review the training data in unified-training-data-simple.json');
    console.log('2. Use lora-training-dataset.jsonl for LoRA fine-tuning');
    console.log('3. For complete dataset, install Puppeteer dependencies');
    
    return {
      totalExamples: allExamples.length,
      loraDatasetSize: loraDataset.length,
      patternAnalysis
    };
  }
}

// Run the pipeline
if (require.main === module) {
  const pipeline = new SimplifiedTrainingPipeline();
  pipeline.runPipeline().catch(console.error);
}

module.exports = SimplifiedTrainingPipeline;