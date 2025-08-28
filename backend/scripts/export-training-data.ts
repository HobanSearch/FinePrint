#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const prisma = new PrismaClient();

interface TrainingEntry {
  id: string;
  category: string;
  document_type: 'privacy_policy' | 'terms_of_service';
  content: string;
  analysis: {
    score: number;
    grade: string;
    patterns: Array<{
      type: string;
      severity: string;
      description: string;
    }>;
    findings: Array<{
      title: string;
      severity: string;
      explanation: string;
    }>;
    summary: string;
  };
  metadata: {
    domain: string;
    analyzed_at: string;
    model_used: string;
    word_count: number;
  };
}

async function exportTrainingData() {
  console.log('🔍 Fine Print AI - Training Data Exporter');
  console.log('=======================================\n');

  try {
    // Get all websites with their latest scores
    const websites = await prisma.website.findMany({
      include: {
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            patterns: true,
            documents: {
              include: {
                document: true
              }
            }
          }
        }
      }
    });

    console.log(`Found ${websites.length} websites in database`);
    
    const trainingData: TrainingEntry[] = [];
    const validationData: TrainingEntry[] = [];
    
    let processedCount = 0;
    let skippedCount = 0;

    for (const website of websites) {
      if (!website.scores[0]) {
        console.log(`⚠️  Skipping ${website.name} - no analysis found`);
        skippedCount++;
        continue;
      }

      const score = website.scores[0];
      
      // Process each document type
      for (const scoreDoc of score.documents) {
        const doc = scoreDoc.document;
        
        if (!doc.content || doc.content.length < 100) {
          console.log(`⚠️  Skipping ${website.name} ${doc.type} - content too short`);
          continue;
        }

        const entry: TrainingEntry = {
          id: `${website.id}_${doc.type}`,
          category: website.category,
          document_type: doc.type as 'privacy_policy' | 'terms_of_service',
          content: doc.content,
          analysis: {
            score: score.score,
            grade: score.grade,
            patterns: score.patterns.map(p => ({
              type: p.type,
              severity: p.severity,
              description: p.description
            })),
            findings: (score.findings as any[]) || [],
            summary: score.summary || ''
          },
          metadata: {
            domain: website.domain,
            analyzed_at: score.createdAt.toISOString(),
            model_used: 'phi-2',
            word_count: doc.content.split(/\s+/).length
          }
        };

        // 80/20 split for training/validation
        if (Math.random() < 0.8) {
          trainingData.push(entry);
        } else {
          validationData.push(entry);
        }
        
        processedCount++;
      }
      
      console.log(`✅ Processed ${website.name}`);
    }

    console.log(`\n📊 Export Summary:`);
    console.log(`- Total websites: ${websites.length}`);
    console.log(`- Processed documents: ${processedCount}`);
    console.log(`- Skipped: ${skippedCount}`);
    console.log(`- Training samples: ${trainingData.length}`);
    console.log(`- Validation samples: ${validationData.length}`);

    // Create output directory
    const outputDir = path.join(__dirname, '..', 'data', 'training');
    await fs.mkdir(outputDir, { recursive: true });

    // Export as JSONL for fine-tuning
    const trainPath = path.join(outputDir, 'train.jsonl');
    const valPath = path.join(outputDir, 'validation.jsonl');
    
    await fs.writeFile(
      trainPath,
      trainingData.map(entry => JSON.stringify(entry)).join('\n')
    );
    
    await fs.writeFile(
      valPath,
      validationData.map(entry => JSON.stringify(entry)).join('\n')
    );

    // Also export as formatted JSON for inspection
    await fs.writeFile(
      path.join(outputDir, 'train.json'),
      JSON.stringify(trainingData, null, 2)
    );
    
    await fs.writeFile(
      path.join(outputDir, 'validation.json'),
      JSON.stringify(validationData, null, 2)
    );

    // Create fine-tuning prompt templates
    const promptTemplates = {
      privacy_analysis: trainingData.slice(0, 5).map(entry => ({
        instruction: `Analyze this privacy policy and identify problematic patterns:\n\n${entry.content.substring(0, 500)}...`,
        response: `Risk Score: ${entry.analysis.score}/100 (Grade: ${entry.analysis.grade})\n\n` +
                  `Key Findings:\n${entry.analysis.findings.map(f => `- ${f.title}: ${f.explanation}`).join('\n')}\n\n` +
                  `Summary: ${entry.analysis.summary}`
      })),
      pattern_detection: trainingData.slice(0, 5).map(entry => ({
        instruction: `Identify privacy-related patterns in this text:\n\n${entry.content.substring(0, 300)}...`,
        response: entry.analysis.patterns.map(p => 
          `Pattern: ${p.type}\nSeverity: ${p.severity}\nDescription: ${p.description}`
        ).join('\n\n')
      }))
    };

    await fs.writeFile(
      path.join(outputDir, 'prompt_templates.json'),
      JSON.stringify(promptTemplates, null, 2)
    );

    console.log(`\n✅ Training data exported to: ${outputDir}`);
    console.log('\nFiles created:');
    console.log('- train.jsonl (for fine-tuning)');
    console.log('- validation.jsonl (for evaluation)');
    console.log('- train.json (formatted for inspection)');
    console.log('- validation.json (formatted for inspection)');
    console.log('- prompt_templates.json (example prompts)');

  } catch (error) {
    console.error('❌ Error exporting training data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the export
exportTrainingData();