#!/usr/bin/env node

/**
 * Simplified Analysis Runner
 * Runs analysis without Puppeteer dependencies
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class SimpleAnalysisRunner {
  constructor() {
    this.tasks = [
      {
        name: 'Analyze iOS apps (simplified)',
        script: 'ios-app-store-simple.js',
        timeout: 600000, // 10 minutes
        required: true
      },
      {
        name: 'Generate unified training data',
        script: 'unified-training-pipeline.js',
        timeout: 300000, // 5 minutes
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

  // Modify source mappings for unified pipeline
  modifyUnifiedPipeline() {
    console.log('📝 Updating unified pipeline configuration...');
    
    const pipelinePath = path.join(__dirname, 'unified-training-pipeline.js');
    let content = fs.readFileSync(pipelinePath, 'utf8');
    
    // Update the sources to use simplified iOS data
    content = content.replace(
      "file: 'ios-app-analysis.json',",
      "file: 'ios-app-analysis-simple.json',"
    );
    
    // Comment out sources that require Puppeteer
    content = content.replace(
      "failedSites: {",
      "// failedSites: {"
    );
    content = content.replace(
      "file: 'failed-sites-reanalysis.json',",
      "// file: 'failed-sites-reanalysis.json',"
    );
    content = content.replace(
      "type: 'website',",
      "// type: 'website',"
    );
    content = content.replace(
      "fields: ['privacy', 'terms']",
      "// fields: ['privacy', 'terms']"
    );
    content = content.replace(
      "},\n      iosApps:",
      "// },\n      iosApps:"
    );
    
    // Comment out other scraped sources temporarily
    const sourcesToComment = ['androidApps', 'chromeExtensions'];
    sourcesToComment.forEach(source => {
      const regex = new RegExp(`${source}: {[^}]+},`, 'gs');
      content = content.replace(regex, (match) => {
        return match.split('\n').map(line => '// ' + line).join('\n');
      });
    });
    
    fs.writeFileSync(pipelinePath + '.backup', fs.readFileSync(pipelinePath));
    fs.writeFileSync(pipelinePath, content);
    
    console.log('✓ Pipeline configuration updated');
  }

  // Restore original pipeline
  restorePipeline() {
    const pipelinePath = path.join(__dirname, 'unified-training-pipeline.js');
    const backupPath = pipelinePath + '.backup';
    
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, pipelinePath);
      fs.unlinkSync(backupPath);
      console.log('✓ Original pipeline restored');
    }
  }

  // Main execution
  async run() {
    console.log('🚀 Simplified Privacy Analysis Runner');
    console.log('====================================\n');
    console.log('This simplified version will:');
    console.log('  • Use existing website analysis data');
    console.log('  • Analyze iOS apps using iTunes API only');
    console.log('  • Generate training data from available sources\n');
    
    // Check for existing website data
    const websiteDataPath = path.join(__dirname, '..', 'top50-real-analysis-complete.json');
    if (!fs.existsSync(websiteDataPath)) {
      console.error('❌ Missing top50-real-analysis-complete.json');
      console.error('   The website analysis data is required.');
      process.exit(1);
    }
    
    console.log('✓ Found existing website analysis data');
    
    try {
      // Modify pipeline configuration
      this.modifyUnifiedPipeline();
      
      // Run each task
      for (const task of this.tasks) {
        try {
          await this.runScript(task.script, task.timeout);
          this.completedTasks.push(task.name);
          
          // Small delay between tasks
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          this.failedTasks.push({
            name: task.name,
            error: error.message
          });
          
          if (task.required) {
            console.error(`\n❌ Critical task failed: ${task.name}`);
            break;
          }
        }
      }
      
    } finally {
      // Restore original pipeline
      this.restorePipeline();
    }
    
    // Display results
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SIMPLIFIED ANALYSIS COMPLETE');
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
    
    console.log(`\n⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    
    // Check if training data was generated
    const trainingDataPath = path.join(__dirname, 'lora-training-dataset.jsonl');
    if (fs.existsSync(trainingDataPath)) {
      const stats = fs.statSync(trainingDataPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log('\n🎯 LoRA Training Data Generated:');
      console.log(`  • File: lora-training-dataset.jsonl`);
      console.log(`  • Size: ${sizeMB} MB`);
      console.log('\n📋 Data sources included:');
      console.log('  • 38 websites (from previous analysis)');
      console.log('  • 50 iOS apps (simplified analysis)');
      console.log('\n⚠️  Note: This is a partial dataset.');
      console.log('   For complete analysis, install Puppeteer dependencies.');
    }
    
    console.log('\n✨ Done!\n');
  }
}

// Run the simplified analysis
if (require.main === module) {
  const runner = new SimpleAnalysisRunner();
  runner.run().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = SimpleAnalysisRunner;