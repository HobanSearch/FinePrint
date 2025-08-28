const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Add support for shared backend types
config.resolver.alias = {
  '@shared': path.resolve(__dirname, '../backend/shared/types/src'),
  '@': path.resolve(__dirname, './src')
}

// Configure source map generation for better debugging
config.resolver.platforms = ['ios', 'android', 'native', 'web']

// Add SVG support
config.transformer.assetExts.push('svg')

// Increase Metro's memory limit
config.maxWorkers = 4

module.exports = config