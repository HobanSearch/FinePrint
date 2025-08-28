import { z } from 'zod';

export const emailSchema = z.string().email();
export const urlSchema = z.string().url();
export const uuidSchema = z.string().uuid();

export const isValidEmail = (email: string): boolean => {
  return emailSchema.safeParse(email).success;
};

export const isValidUrl = (url: string): boolean => {
  return urlSchema.safeParse(url).success;
};

export const isValidUuid = (uuid: string): boolean => {
  return uuidSchema.safeParse(uuid).success;
};

export const sanitizeHtml = (html: string): string => {
  // Basic HTML sanitization - in production, use a library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
};