/**
 * Custom error serializer for Jest snapshots
 * Provides consistent error formatting in test snapshots
 */

import { NewPlugin, Config, Printer, Refs } from 'pretty-format';

interface SerializableError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  statusCode?: number;
  details?: any;
}

/**
 * Checks if a value is an Error object or error-like object
 */
const test = (val: any): val is Error | SerializableError => {
  return (
    val &&
    (val instanceof Error ||
      (typeof val === 'object' &&
        typeof val.name === 'string' &&
        typeof val.message === 'string'))
  );
};

/**
 * Serializes error objects for consistent snapshot formatting
 */
const serialize = (
  val: Error | SerializableError,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string => {
  const error = val as any;
  
  // Create a clean error representation
  const errorObj: any = {
    name: error.name || 'Error',
    message: error.message || '',
  };

  // Add common error properties if they exist
  if (error.code !== undefined) {
    errorObj.code = error.code;
  }
  
  if (error.statusCode !== undefined) {
    errorObj.statusCode = error.statusCode;
  }
  
  if (error.details !== undefined) {
    errorObj.details = error.details;
  }

  // Add sanitized stack trace for development
  if (error.stack && !process.env.CI) {
    // Clean up stack trace for consistent snapshots
    const stackLines = error.stack.split('\n');
    const relevantStack = stackLines
      .filter((line: string) => 
        line.includes('at ') && 
        !line.includes('node_modules') &&
        !line.includes('jest') &&
        !line.includes('supertest')
      )
      .slice(0, 3) // Only show top 3 relevant stack frames
      .map((line: string) => line.replace(process.cwd(), '').trim());
    
    if (relevantStack.length > 0) {
      errorObj.stack = relevantStack;
    }
  }
  
  // Use the default object printer for the cleaned error object
  return printer(errorObj, config, indentation, depth, refs);
};

/**
 * Jest snapshot serializer for Error objects
 */
const errorSerializer: NewPlugin = {
  test,
  serialize,
};

export default errorSerializer;