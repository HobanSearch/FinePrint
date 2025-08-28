/**
 * Custom date serializer for Jest snapshots
 * Provides consistent date formatting in test snapshots
 */

import { NewPlugin, Config, Printer, Refs } from 'pretty-format';

/**
 * Checks if a value is a Date object
 */
const test = (val: any): val is Date => {
  return val instanceof Date;
};

/**
 * Serializes Date objects for consistent snapshot formatting
 */
const serialize = (
  val: Date,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string => {
  // Check if the date is valid
  if (isNaN(val.getTime())) {
    return 'Invalid Date';
  }
  
  // For test snapshots, we want consistent formatting
  // Use ISO string but make it more readable
  const isoString = val.toISOString();
  
  // Format: YYYY-MM-DD HH:mm:ss.sssZ
  const formatted = isoString
    .replace('T', ' ')
    .replace(/\.(\d{3})Z$/, '.$1Z');
  
  return `Date("${formatted}")`;
};

/**
 * Jest snapshot serializer for Date objects
 */
const dateSerializer: NewPlugin = {
  test,
  serialize,
};

export default dateSerializer;