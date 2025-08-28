/**
 * Qdrant Vector Database Setup for Fine Print AI
 * Initializes collections, indexes, and search configurations
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const { v4: uuidv4 } = require('uuid');

// Initialize Qdrant client
const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

// Collection configurations for different embedding types
const COLLECTIONS = {
  // Document content embeddings for semantic search
  DOCUMENT_EMBEDDINGS: {
    name: 'document_embeddings',
    config: {
      vectors: {
        size: 1536, // OpenAI ada-002 embedding size
        distance: 'Cosine',
        on_disk: true, // Store vectors on disk for large collections
      },
      optimizers_config: {
        deleted_threshold: 0.2,
        vacuum_min_vector_number: 1000,
        default_segment_number: 4,
        max_segment_size: 20000,
        memmap_threshold: 100000,
        indexing_threshold: 10000,
        flush_interval_sec: 5,
        max_optimization_threads: 4,
      },
      // High-performance HNSW index configuration
      hnsw_config: {
        m: 32, // Higher M for better recall
        ef_construct: 256, // Higher ef_construct for better index quality
        full_scan_threshold: 10000,
        max_indexing_threads: 0, // Auto-detect CPU cores
        on_disk: false, // Keep HNSW index in memory for speed
        payload_m: 16,
      },
      // Quantization for memory efficiency
      quantization_config: {
        scalar: {
          type: 'int8',
          quantile: 0.99,
          always_ram: true,
        },
      },
      shard_number: 2, // Distribute across shards for better performance
      replication_factor: 1, // Increase for high availability
      write_consistency_factor: 1,
      on_disk_payload: true,
    },
  },

  // Pattern embeddings for similar issue detection
  PATTERN_EMBEDDINGS: {
    name: 'pattern_embeddings',
    config: {
      vectors: {
        size: 768, // Sentence transformer embedding size
        distance: 'Cosine',
        on_disk: true,
      },
      optimizers_config: {
        deleted_threshold: 0.2,
        vacuum_min_vector_number: 100,
        default_segment_number: 2,
        max_segment_size: 10000,
        memmap_threshold: 50000,
        indexing_threshold: 5000,
        flush_interval_sec: 5,
        max_optimization_threads: 2,
      },
      hnsw_config: {
        m: 24,
        ef_construct: 128,
        full_scan_threshold: 5000,
        max_indexing_threads: 0,
        on_disk: false,
        payload_m: 12,
      },
      quantization_config: {
        scalar: {
          type: 'int8',
          quantile: 0.99,
          always_ram: true,
        },
      },
      shard_number: 1,
      replication_factor: 1,
      write_consistency_factor: 1,
      on_disk_payload: true,
    },
  },

  // User interaction embeddings for personalization
  USER_EMBEDDINGS: {
    name: 'user_embeddings',
    config: {
      vectors: {
        size: 512, // Smaller embeddings for user profiles
        distance: 'Cosine',
        on_disk: true,
      },
      optimizers_config: {
        deleted_threshold: 0.3,
        vacuum_min_vector_number: 500,
        default_segment_number: 1,
        max_segment_size: 5000,
        memmap_threshold: 25000,
        indexing_threshold: 2500,
        flush_interval_sec: 10,
        max_optimization_threads: 1,
      },
      hnsw_config: {
        m: 16,
        ef_construct: 64,
        full_scan_threshold: 2500,
        max_indexing_threads: 0,
        on_disk: false,
        payload_m: 8,
      },
      shard_number: 1,
      replication_factor: 1,
      write_consistency_factor: 1,
      on_disk_payload: true,
    },
  },
};

/**
 * Initialize Qdrant collections for Fine Print AI
 */
async function initializeCollections() {
  console.log('🚀 Initializing Qdrant collections for Fine Print AI...');

  try {
    // Check Qdrant health
    const health = await client.api('cluster', {}).health();
    console.log('✅ Qdrant health check:', health.status);

    for (const [key, collection] of Object.entries(COLLECTIONS)) {
      console.log(`\n📦 Setting up collection: ${collection.name}`);

      try {
        // Check if collection already exists
        const existingCollections = await client.getCollections();
        const exists = existingCollections.collections.some(
          c => c.name === collection.name
        );

        if (exists) {
          console.log(`⚠️  Collection ${collection.name} already exists`);
          
          // Get collection info
          const info = await client.getCollection(collection.name);
          console.log(`📊 Collection stats:`, {
            vectors_count: info.vectors_count,
            indexed_vectors_count: info.indexed_vectors_count,
            segments_count: info.segments_count,
          });
          continue;
        }

        // Create collection
        await client.createCollection(collection.name, collection.config);
        console.log(`✅ Created collection: ${collection.name}`);

        // Create payload indexes for efficient filtering
        await createPayloadIndexes(collection.name);
        
      } catch (error) {
        console.error(`❌ Error setting up collection ${collection.name}:`, error);
      }
    }

    console.log('\n🎉 Qdrant initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Failed to initialize Qdrant:', error);
    throw error;
  }
}

/**
 * Create payload indexes for efficient filtering
 */
async function createPayloadIndexes(collectionName) {
  console.log(`🔍 Creating payload indexes for ${collectionName}`);

  const indexes = {
    document_embeddings: [
      { field_name: 'document_id', field_schema: 'keyword' },
      { field_name: 'user_id', field_schema: 'keyword' },
      { field_name: 'document_type', field_schema: 'keyword' },
      { field_name: 'language', field_schema: 'keyword' },
      { field_name: 'risk_score', field_schema: 'integer' },
      { field_name: 'created_at', field_schema: 'datetime' },
      { field_name: 'chunk_index', field_schema: 'integer' },
      { field_name: 'categories', field_schema: 'keyword' },
    ],
    pattern_embeddings: [
      { field_name: 'pattern_id', field_schema: 'keyword' },
      { field_name: 'category', field_schema: 'keyword' },
      { field_name: 'severity', field_schema: 'keyword' },
      { field_name: 'is_active', field_schema: 'bool' },
      { field_name: 'version', field_schema: 'integer' },
      { field_name: 'created_at', field_schema: 'datetime' },
    ],
    user_embeddings: [
      { field_name: 'user_id', field_schema: 'keyword' },
      { field_name: 'subscription_tier', field_schema: 'keyword' },
      { field_name: 'preferences', field_schema: 'keyword' },
      { field_name: 'last_updated', field_schema: 'datetime' },
    ],
  };

  const collectionIndexes = indexes[collectionName];
  if (!collectionIndexes) {
    console.log(`⚠️  No indexes defined for ${collectionName}`);
    return;
  }

  for (const index of collectionIndexes) {
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: index.field_name,
        field_schema: index.field_schema,
      });
      console.log(`✅ Created index on ${index.field_name} (${index.field_schema})`);
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log(`⚠️  Index on ${index.field_name} already exists`);
      } else {
        console.error(`❌ Failed to create index on ${index.field_name}:`, error);
      }
    }
  }
}

/**
 * Insert sample document embeddings for testing
 */
async function insertSampleData() {
  console.log('\n📝 Inserting sample data for testing...');

  const sampleDocuments = [
    {
      id: uuidv4(),
      vector: Array(1536).fill(0).map(() => Math.random() - 0.5),
      payload: {
        document_id: uuidv4(),
        user_id: uuidv4(),
        document_type: 'terms_of_service',
        language: 'en',
        risk_score: 85,
        created_at: new Date().toISOString(),
        chunk_index: 0,
        categories: ['data_collection', 'user_rights'],
        title: 'Sample Terms of Service Analysis',
        content_summary: 'This document contains concerning data collection clauses',
      },
    },
    {
      id: uuidv4(),
      vector: Array(1536).fill(0).map(() => Math.random() - 0.5),
      payload: {
        document_id: uuidv4(),
        user_id: uuidv4(),
        document_type: 'privacy_policy',
        language: 'en',
        risk_score: 62,
        created_at: new Date().toISOString(),
        chunk_index: 0,
        categories: ['privacy', 'data_sharing'],
        title: 'Sample Privacy Policy Analysis',
        content_summary: 'Privacy policy with moderate privacy concerns',
      },
    },
  ];

  const samplePatterns = [
    {
      id: uuidv4(),
      vector: Array(768).fill(0).map(() => Math.random() - 0.5),
      payload: {
        pattern_id: uuidv4(),
        category: 'data_collection',
        severity: 'high',
        is_active: true,
        version: 1,
        created_at: new Date().toISOString(),
        name: 'Broad Data Collection',
        description: 'Pattern detecting overly broad data collection clauses',
      },
    },
  ];

  try {
    // Insert document embeddings
    await client.upsert(COLLECTIONS.DOCUMENT_EMBEDDINGS.name, {
      wait: true,
      points: sampleDocuments,
    });
    console.log(`✅ Inserted ${sampleDocuments.length} sample document embeddings`);

    // Insert pattern embeddings
    await client.upsert(COLLECTIONS.PATTERN_EMBEDDINGS.name, {
      wait: true,
      points: samplePatterns,
    });
    console.log(`✅ Inserted ${samplePatterns.length} sample pattern embeddings`);

  } catch (error) {
    console.error('❌ Error inserting sample data:', error);
  }
}

/**
 * Test search functionality
 */
async function testSearch() {
  console.log('\n🔍 Testing search functionality...');

  try {
    // Test document similarity search
    const searchVector = Array(1536).fill(0).map(() => Math.random() - 0.5);
    
    const searchResults = await client.search(COLLECTIONS.DOCUMENT_EMBEDDINGS.name, {
      vector: searchVector,
      limit: 5,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          {
            key: 'document_type',
            match: { value: 'terms_of_service' }
          }
        ]
      }
    });

    console.log(`✅ Search returned ${searchResults.length} results`);
    searchResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Score: ${result.score.toFixed(4)}, Type: ${result.payload.document_type}`);
    });

    // Test pattern matching
    const patternVector = Array(768).fill(0).map(() => Math.random() - 0.5);
    
    const patternResults = await client.search(COLLECTIONS.PATTERN_EMBEDDINGS.name, {
      vector: patternVector,
      limit: 3,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          {
            key: 'is_active',
            match: { value: true }
          }
        ]
      }
    });

    console.log(`✅ Pattern search returned ${patternResults.length} results`);

  } catch (error) {
    console.error('❌ Error testing search:', error);
  }
}

/**
 * Performance optimization and monitoring
 */
async function optimizeCollections() {
  console.log('\n⚡ Optimizing collections for performance...');

  for (const collection of Object.values(COLLECTIONS)) {
    try {
      // Trigger optimization
      await client.updateCollection(collection.name, {
        optimizers_config: collection.config.optimizers_config,
      });

      console.log(`✅ Optimized collection: ${collection.name}`);
    } catch (error) {
      console.error(`❌ Error optimizing ${collection.name}:`, error);
    }
  }
}

/**
 * Get collection statistics
 */
async function getCollectionStats() {
  console.log('\n📊 Collection Statistics:');

  for (const collection of Object.values(COLLECTIONS)) {
    try {
      const info = await client.getCollection(collection.name);
      console.log(`\n${collection.name}:`);
      console.log(`  Vectors: ${info.vectors_count}`);
      console.log(`  Indexed: ${info.indexed_vectors_count}`);
      console.log(`  Segments: ${info.segments_count}`);
      console.log(`  Disk usage: ${info.disk_data_size || 'N/A'}`);
      console.log(`  RAM usage: ${info.ram_data_size || 'N/A'}`);
    } catch (error) {
      console.error(`❌ Error getting stats for ${collection.name}:`, error);
    }
  }
}

/**
 * Main setup function
 */
async function main() {
  try {
    await initializeCollections();
    await insertSampleData();
    await testSearch();
    await optimizeCollections();
    await getCollectionStats();
    
    console.log('\n🎉 Qdrant setup completed successfully!');
    console.log('\n📚 Usage examples:');
    console.log('  - Document similarity search');
    console.log('  - Pattern matching for legal issues');
    console.log('  - User preference-based recommendations');
    console.log('  - Semantic clustering of similar documents');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  main();
}

module.exports = {
  initializeCollections,
  insertSampleData,
  testSearch,
  optimizeCollections,
  getCollectionStats,
  COLLECTIONS,
  client,
};