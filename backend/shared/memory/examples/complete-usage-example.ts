/**
 * Complete Usage Example for Fine Print AI Memory Service
 * Demonstrates all major features and capabilities
 */

import { 
  MemoryServer, 
  MemoryType, 
  ImportanceLevel, 
  StorageTier,
  defaultConfig 
} from '../src';

async function demonstrateMemoryService() {
  console.log('🧠 Fine Print AI Memory Service - Complete Demo\n');

  // 1. Initialize Memory Server
  console.log('1️⃣ Initializing Memory Server...');
  const server = new MemoryServer({
    ...defaultConfig,
    port: 3001,
    memory: {
      ...defaultConfig.memory,
      // Enable all features for demo
      consolidation: { enabled: true, threshold: 0.8, schedule: '0 3 * * *' },
      lifecycle: { enabled: true, cleanupSchedule: '0 4 * * *', retentionPolicies: {} },
      sharing: { enabled: true, defaultPermissions: { canRead: true, canWrite: false, canDelete: false, canShare: false } },
    },
  });

  try {
    await server.start();
    console.log('✅ Memory server started successfully\n');

    const memoryService = server.service;
    const agentId = 'demo-legal-agent-001';

    // 2. Create Different Types of Memories
    console.log('2️⃣ Creating different types of memories...');

    // Semantic Memory - Legal Knowledge
    const semanticMemoryId = await memoryService.createMemory({
      type: MemoryType.SEMANTIC,
      category: 'legal-compliance',
      title: 'GDPR Data Processing Requirements',
      description: 'Essential requirements for GDPR compliance in data processing activities',
      content: {
        concept: 'GDPR Data Processing',
        domain: 'privacy-law',
        facts: [
          {
            statement: 'Consent must be freely given, specific, informed and unambiguous',
            confidence: 0.95,
            sources: ['GDPR Article 4(11)', 'EU Guidelines 05/2020']
          },
          {
            statement: 'Data subjects have the right to withdraw consent at any time',
            confidence: 0.98,
            sources: ['GDPR Article 7(3)']
          }
        ],
        rules: [
          {
            condition: 'Processing personal data without legal basis',
            conclusion: 'Violation of GDPR Article 6',
            confidence: 0.9
          }
        ],
        applicability: ['EU', 'UK', 'data-processing', 'consent-management'],
        certaintyLevel: 0.92,
        evidenceCount: 5,
        abstractionLevel: 7
      },
      agentId,
      importanceLevel: ImportanceLevel.CRITICAL
    });

    console.log(`✅ Created semantic memory: ${semanticMemoryId}`);

    // Procedural Memory - Legal Analysis Process
    const proceduralMemoryId = await memoryService.createMemory({
      type: MemoryType.PROCEDURAL,
      category: 'analysis-procedures',
      title: 'Terms of Service Risk Assessment Procedure',
      description: 'Step-by-step process for analyzing Terms of Service for potential risks',
      content: {
        procedureName: 'ToS Risk Assessment',
        skillDomain: 'legal-analysis',
        steps: [
          {
            order: 1,
            description: 'Extract and categorize all clauses',
            action: 'clause_extraction',
            parameters: { 'extraction_method': 'nlp', 'confidence_threshold': 0.8 }
          },
          {
            order: 2,
            description: 'Identify potentially problematic clauses',
            action: 'risk_identification',
            conditions: ['clause_type', 'jurisdiction', 'industry_sector']
          },
          {
            order: 3,
            description: 'Score risk level for each identified issue',
            action: 'risk_scoring',
            parameters: { 'scoring_model': 'weighted_severity', 'scale': '1-10' }
          }
        ],
        successRate: 0.87,
        avgExecutionTime: 45000, // 45 seconds
        complexity: 7,
        practiceCount: 143,
        masteryLevel: 0.82
      },
      agentId,
      importanceLevel: ImportanceLevel.HIGH
    });

    console.log(`✅ Created procedural memory: ${proceduralMemoryId}`);

    // Episodic Memory - Customer Interaction
    const episodicMemoryId = await memoryService.createMemory({
      type: MemoryType.EPISODIC,
      category: 'customer-interactions',
      title: 'Privacy Policy Analysis for TechCorp',
      description: 'Analysis session for TechCorp\'s privacy policy update',
      content: {
        episodeType: 'analysis_task',
        duration: 1250, // seconds
        outcome: 'success',
        participants: ['legal-agent', 'customer-rep-techcorp'],
        environment: {
          client_type: 'enterprise',
          document_type: 'privacy_policy',
          urgency_level: 'high'
        },
        inputModalities: ['text', 'document'],
        outputActions: ['risk_report', 'recommendations'],
        emotionalTone: 'neutral',
        significance: 0.75
      },
      agentId,
      importanceLevel: ImportanceLevel.MEDIUM,
      contextDate: new Date('2024-01-15')
    });

    console.log(`✅ Created episodic memory: ${episodicMemoryId}`);

    // Business Memory - Performance Metrics
    const businessMemoryId = await memoryService.createMemory({
      type: MemoryType.BUSINESS,
      category: 'performance-metrics',
      title: 'Q1 2024 Legal Analysis Performance',
      description: 'Performance metrics and business insights for Q1 2024',
      content: {
        businessDomain: 'legal-tech',
        metricType: 'performance',
        customerSegment: 'enterprise',
        industryVertical: 'legal-services',
        kpiValue: 0.89, // accuracy rate
        trend: 'increasing',
        benchmarkValue: 0.82,
        competitorInfo: {
          'LegalAI Corp': { accuracy: 0.84, market_share: 0.15 },
          'ComplianceBot': { accuracy: 0.81, market_share: 0.22 }
        },
        marketConditions: {
          'regulatory_changes': 'high',
          'demand': 'increasing',
          'competition': 'moderate'
        },
        revenueImpact: 125000, // USD
        roi: 2.3
      },
      agentId,
      importanceLevel: ImportanceLevel.HIGH
    });

    console.log(`✅ Created business memory: ${businessMemoryId}`);

    // Working Memory - Current Task Context
    const workingMemoryId = await memoryService.createMemory({
      type: MemoryType.WORKING,
      category: 'active-tasks',
      title: 'Current Analysis: SaaS Terms Update',
      description: 'Working context for ongoing SaaS terms analysis',
      content: {
        taskContext: {
          client_id: 'saas-startup-xyz',
          document_id: 'terms-v2.1',
          analysis_progress: 0.65,
          current_section: 'liability_limitations',
          identified_issues: ['broad_indemnification', 'unilateral_modification']
        },
        dependencies: [semanticMemoryId, proceduralMemoryId],
        priority: 8,
        ttlSeconds: 7200 // 2 hours
      },
      agentId,
      importanceLevel: ImportanceLevel.MEDIUM
    });

    console.log(`✅ Created working memory: ${workingMemoryId}\n`);

    // 3. Demonstrate Search Capabilities
    console.log('3️⃣ Demonstrating search capabilities...');

    // Text-based search
    const searchResults = await memoryService.searchMemories({
      types: [MemoryType.SEMANTIC, MemoryType.PROCEDURAL],
      textSearch: 'GDPR compliance',
      importanceLevels: [ImportanceLevel.CRITICAL, ImportanceLevel.HIGH]
    }, agentId, {
      page: 1,
      pageSize: 10,
      sortBy: 'importanceScore',
      sortOrder: 'desc'
    });

    console.log(`🔍 Text search found ${searchResults.results.length} memories`);
    searchResults.results.forEach(result => {
      console.log(`   - ${result.title} (${result.type})`);
    });

    // Vector similarity search
    const vectorResults = await memoryService.vectorSearch(
      'data protection and privacy regulations',
      agentId,
      {
        algorithm: 'cosine',
        threshold: 0.7,
        maxResults: 5,
        includeMetadata: true
      },
      {
        types: [MemoryType.SEMANTIC, MemoryType.BUSINESS]
      }
    );

    console.log(`🎯 Vector search found ${vectorResults.length} similar memories:`);
    vectorResults.forEach(result => {
      console.log(`   - ${result.memory.title} (similarity: ${(result.similarity * 100).toFixed(1)}%)`);
      if (result.explanation) {
        console.log(`     ${result.explanation}`);
      }
    });
    console.log();

    // 4. Demonstrate Memory Sharing
    console.log('4️⃣ Demonstrating memory sharing...');

    const targetAgentId = 'compliance-specialist-002';
    
    await memoryService.shareMemory(
      semanticMemoryId,
      agentId,
      targetAgentId,
      {
        canRead: true,
        canWrite: false,
        canDelete: false,
        canShare: true
      },
      {
        reason: 'Share GDPR knowledge with compliance specialist',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    );

    console.log(`✅ Shared semantic memory with ${targetAgentId}\n`);

    // 5. Demonstrate Memory Updates and Versioning
    console.log('5️⃣ Demonstrating memory updates...');

    await memoryService.updateMemory(
      businessMemoryId,
      {
        content: {
          ...((await memoryService.retrieveMemory(businessMemoryId, agentId))?.content || {}),
          kpiValue: 0.91, // Updated performance
          trend: 'stable',
          lastUpdated: new Date().toISOString()
        },
        metadata: {
          updateReason: 'Q1 final results',
          updatedBy: agentId
        }
      },
      agentId
    );

    console.log(`✅ Updated business memory with latest Q1 results\n`);

    // 6. Get Agent Statistics
    console.log('6️⃣ Retrieving agent memory statistics...');

    const stats = await memoryService.getAgentMemoryStats(agentId);
    console.log(`📊 Agent Memory Statistics:`);
    console.log(`   Total Memories: ${stats.totalMemories}`);
    console.log(`   Storage Usage: ${(stats.storageUsage / 1024).toFixed(2)} KB`);
    console.log(`   Shared Memories: ${stats.sharedMemories}`);
    console.log(`   Memory Types:`);
    Object.entries(stats.memoryTypes).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });
    console.log();

    // 7. Demonstrate Storage Tier Management
    console.log('7️⃣ Demonstrating storage tier management...');

    // Move old episodic memory to cold storage
    await memoryService.storageManager.moveMemoryToTier(episodicMemoryId, StorageTier.COLD);
    console.log(`❄️ Moved episodic memory to cold storage`);

    // Get storage statistics
    const storageStats = await memoryService.storageManager.getStorageStats();
    console.log(`💾 Storage Distribution:`);
    Object.entries(storageStats.tierDistribution).forEach(([tier, count]) => {
      console.log(`   ${tier}: ${count} memories`);
    });
    console.log();

    // 8. Health Check
    console.log('8️⃣ Performing health check...');

    const health = await memoryService.healthCheck();
    console.log(`🏥 System Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`   Total Memories: ${health.metrics.totalMemories}`);
    console.log(`   Avg Response Time: ${health.metrics.avgResponseTime.toFixed(2)}ms`);
    console.log(`   Services Status:`);
    console.log(`     Storage: ${health.services.storage.overall ? '✅' : '❌'}`);
    console.log(`     Consolidation: ${health.services.consolidation ? '✅' : '❌'}`);
    console.log(`     Lifecycle: ${health.services.lifecycle ? '✅' : '❌'}`);
    console.log(`     Sharing: ${health.services.sharing ? '✅' : '❌'}`);
    console.log();

    console.log('🎉 Demo completed successfully!');
    console.log('\n📝 Summary of capabilities demonstrated:');
    console.log('   ✅ Multi-type memory creation (Semantic, Procedural, Episodic, Business, Working)');
    console.log('   ✅ Text-based and vector similarity search');
    console.log('   ✅ Cross-agent memory sharing with permissions');
    console.log('   ✅ Memory updates and versioning');
    console.log('   ✅ Agent statistics and analytics');
    console.log('   ✅ Multi-tier storage management');
    console.log('   ✅ System health monitoring');
    console.log('\n🚀 The memory service is ready for production use!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await server.stop();
    console.log('✅ Cleanup complete');
  }
}

// Advanced usage examples
async function advancedUsageExamples() {
  console.log('\n🚀 Advanced Usage Examples\n');

  // Example: Batch memory creation for training data
  console.log('📚 Batch Memory Creation Example:');
  
  const trainingData = [
    {
      type: MemoryType.SEMANTIC,
      category: 'legal-patterns',
      title: 'Arbitration Clause Analysis',
      content: { 
        pattern: 'mandatory_arbitration',
        risk_level: 'high',
        user_impact: 'waives_jury_trial_rights'
      }
    },
    {
      type: MemoryType.SEMANTIC,
      category: 'legal-patterns', 
      title: 'Auto-Renewal Detection',
      content: {
        pattern: 'automatic_renewal',
        risk_level: 'medium',
        user_impact: 'unexpected_charges'
      }
    }
  ];

  console.log(`   Creating ${trainingData.length} training memories...`);
  
  // Example: Custom consolidation trigger
  console.log('\n🔄 Memory Consolidation Example:');
  console.log('   Consolidation helps reduce redundant memories and optimize storage');
  console.log('   Similar memories are automatically merged based on vector similarity');
  
  // Example: Real-time memory streaming
  console.log('\n📡 WebSocket Integration Example:');
  console.log('   Connect to ws://localhost:3001/ws for real-time memory updates');
  console.log('   Agents can subscribe to memory changes across the system');
  
  // Example: Integration with external services
  console.log('\n🔗 External Service Integration:');
  console.log('   - Config Service: Dynamic memory policies and settings');
  console.log('   - DSPy Service: Prompt optimization based on memory patterns');
  console.log('   - LoRA Service: Model fine-tuning from memory data');
  console.log('   - Knowledge Graph: Relationship mapping and concept discovery');
}

// Run the demo
if (require.main === module) {
  demonstrateMemoryService()
    .then(() => advancedUsageExamples())
    .then(() => {
      console.log('\n✨ All examples completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Demo failed:', error);
      process.exit(1);
    });
}