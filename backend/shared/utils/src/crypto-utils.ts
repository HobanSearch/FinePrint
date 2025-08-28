import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const generateUuid = (): string => {
  return uuidv4();
};

export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const hashString = (input: string, algorithm: string = 'sha256'): string => {
  return crypto.createHash(algorithm).update(input).digest('hex');
};

export const generateApiKey = (): string => {
  return `fp_${generateToken(24)}`;
};

export const maskString = (input: string, visibleChars: number = 4): string => {
  if (input.length <= visibleChars) return input;
  const masked = '*'.repeat(input.length - visibleChars);
  return input.slice(0, visibleChars) + masked;
};