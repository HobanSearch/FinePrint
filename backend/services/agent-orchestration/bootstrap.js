const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Register the tsconfig paths with the compiled output structure
// Set the baseUrl to the dist directory since that's where compiled files are
tsConfigPaths.register({
  baseUrl: path.resolve(__dirname, './dist'),
  paths: {
    '@/*': ['./*'],
    '@/types/*': ['./types/*'],
    '@/services/*': ['./services/*'],
    '@/routes/*': ['./routes/*'],
    '@/utils/*': ['./utils/*'],
    '@/config/*': ['./config/*']
  }
});

// Now require the main application
require('./dist/index.js');