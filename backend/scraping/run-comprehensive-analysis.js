#!/usr/bin/env node

/**
 * Comprehensive Privacy Analysis Runner
 * Orchestrates all scrapers to generate complete LoRA training dataset
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ComprehensiveAnalysisRunner {
  constructor() {
    this.tasks = [
      {
        name: 'Re-analyze failed websites',
        script: 'analyze-failed-sites.js',
        timeout: 1800000, // 30 minutes
        required: false
      },
      {
        name: 'Analyze iOS apps',
        script: 'ios-app-store-scraper.js',
        timeout: 3600000, // 60 minutes
        required: true
      },
      {
        name: 'Analyze Android apps',
        script: 'google-play-store-scraper.js',
        timeout: 3600000, // 60 minutes
        required: true
      },
      {
        name: 'Analyze Chrome extensions',
        script: 'chrome-web-store-scraper.js',
        timeout: 3600000, // 60 minutes
        required: true
      },
      {
        name: 'Generate unified training data',
        script: 'unified-training-pipeline.js',
        timeout: 600000, // 10 minutes
        required: true
      }
    ];
    
    this.completedTasks = [];
    this.failedTasks = [];
    this.startTime = Date.now();
  }

  // Run a single script
  runScript(scriptName, timeout) {
    return new Promise((resolve, reject) => {
      console.log(`\n🚀 Starting: ${scriptName}`);
      console.log('═'.repeat(50));
      
      const scriptPath = path.join(__dirname, scriptName);
      const child = spawn('node', [scriptPath], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      let timeoutId;
      if (timeout) {
        timeoutId = setTimeout(() => {
          console.error(`\n⏱️  Timeout: ${scriptName} exceeded ${timeout/1000}s limit`);
          child.kill('SIGTERM');
          reject(new Error(`Script timeout: ${scriptName}`));
        }, timeout);
      }
      
      child.on('exit', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (code === 0) {
          console.log(`\n✅ Completed: ${scriptName}`);
          resolve();
        } else {
          console.error(`\n❌ Failed: ${scriptName} (exit code: ${code})`);
          reject(new Error(`Script failed with code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.error(`\n❌ Error running ${scriptName}:`, error.message);
        reject(error);
      });
    });
  }

  // Check if required files exist
  checkPrerequisites() {
    console.log('🔍 Checking prerequisites...\n');
    
    // Check for Top 50 website analysis
    const websiteDataPath = path.join(__dirname, '..', 'top50-real-analysis-complete.json');
    if (!fs.existsSync(websiteDataPath)) {
      console.error('❌ Missing top50-real-analysis-complete.json');
      console.error('   Please run: node analyze-top50-real.js first');
      return false;
    }
    
    console.log('✓ Found website analysis data');
    
    // Check for Node modules
    const modulesPath = path.join(__dirname, '..', 'node_modules');
    if (!fs.existsSync(modulesPath)) {
      console.error('❌ Missing node_modules');
      console.error('   Please run: npm install');
      return false;
    }
    
    console.log('✓ Node modules installed');
    
    return true;
  }

  // Save run summary
  saveRunSummary() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    const summary = {
      run_date: new Date().toISOString(),
      total_duration_seconds: duration,
      total_duration_formatted: `${Math.floor(duration / 60)}m ${duration % 60}s`,
      completed_tasks: this.completedTasks,
      failed_tasks: this.failedTasks,
      success_rate: `${Math.round((this.completedTasks.length / this.tasks.length) * 100)}%`,
      output_files: [
        'failed-sites-reanalysis.json',
        'ios-app-analysis.json',
        'google-play-analysis.json',
        'chrome-extensions-analysis.json',
        'unified-training-data.json',
        'lora-training-dataset.json',
        'lora-training-dataset.jsonl',
        'training-data-statistics.json'
      ]
    };
    
    fs.writeFileSync(
      'comprehensive-analysis-summary.json',
      JSON.stringify(summary, null, 2)
    );
    
    return summary;
  }

  // Main execution
  async run() {
    console.log('🚀 Comprehensive Privacy Analysis Runner');
    console.log('=======================================\n');
    console.log('This will analyze privacy policies across:');
    console.log('  • Failed websites (with Puppeteer)');
    console.log('  • iOS App Store (top 50 apps)');
    console.log('  • Google Play Store (top 50 apps)');
    console.log('  • Chrome Web Store (top 50 extensions)');
    console.log('\nEstimated time: 2-3 hours\n');
    
    // Check prerequisites
    if (!this.checkPrerequisites()) {
      console.error('\n❌ Prerequisites check failed. Exiting.');
      process.exit(1);
    }
    
    console.log('\n📊 Starting comprehensive analysis...\n');
    
    // Run each task
    for (const task of this.tasks) {
      try {
        await this.runScript(task.script, task.timeout);
        this.completedTasks.push(task.name);
        
        // Small delay between tasks
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        this.failedTasks.push({
          name: task.name,
          error: error.message
        });
        
        if (task.required) {
          console.error(`\n❌ Critical task failed: ${task.name}`);
          console.error('   Cannot continue without this task.');
          break;
        } else {
          console.warn(`\n⚠️  Non-critical task failed: ${task.name}`);
          console.warn('   Continuing with remaining tasks...');
        }
      }
    }
    
    // Save summary
    const summary = this.saveRunSummary();
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE ANALYSIS COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n✅ Completed tasks: ${this.completedTasks.length}/${this.tasks.length}`);
    
    if (this.completedTasks.length > 0) {
      console.log('\n✓ Successfully completed:');
      this.completedTasks.forEach(task => console.log(`  • ${task}`));
    }
    
    if (this.failedTasks.length > 0) {
      console.log('\n✗ Failed tasks:');
      this.failedTasks.forEach(task => console.log(`  • ${task.name}: ${task.error}`));
    }
    
    console.log(`\n⏱️  Total time: ${summary.total_duration_formatted}`);
    
    // Check if training data was generated
    const trainingDataPath = path.join(__dirname, 'lora-training-dataset.jsonl');
    if (fs.existsSync(trainingDataPath)) {
      const stats = fs.statSync(trainingDataPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log('\n🎯 LoRA Training Data Generated:');
      console.log(`  • File: lora-training-dataset.jsonl`);
      console.log(`  • Size: ${sizeMB} MB`);
      console.log(`  • Ready for fine-tuning!`);
      
      console.log('\n📋 Next Steps:');
      console.log('1. Review the training data:');
      console.log('   cat lora-training-dataset.jsonl | head -5');
      console.log('\n2. Copy to training directory:');
      console.log('   cp lora-training-dataset.jsonl ../training/');
      console.log('\n3. Run LoRA fine-tuning:');
      console.log('   cd ../training && python train-lora.py');
    } else {
      console.error('\n❌ Training data generation failed!');
      console.error('   Check the logs above for errors.');
    }
    
    console.log('\n📁 Summary saved to: comprehensive-analysis-summary.json\n');
  }
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Analysis interrupted by user');
  console.log('   Partial results may have been saved.');
  process.exit(1);
});

// Run the comprehensive analysis
if (require.main === module) {
  const runner = new ComprehensiveAnalysisRunner();
  runner.run().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = ComprehensiveAnalysisRunner;