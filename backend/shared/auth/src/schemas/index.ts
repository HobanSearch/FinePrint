/**
 * Fine Print AI - Authentication Schemas
 * Zod schemas for request/response validation
 */

import { z } from 'zod';

// Authentication schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
  deviceInfo: z.object({
    deviceId: z.string(),
    name: z.string(),
    type: z.enum(['desktop', 'mobile', 'tablet']),
    os: z.string(),
    browser: z.string(),
    version: z.string()
  }),
  trustDevice: z.boolean().optional()
});

export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string().nullable(),
    role: z.string(),
    permissions: z.array(z.string()),
    emailVerified: z.boolean(),
    mfaEnabled: z.boolean(),
    lastLoginAt: z.date().nullable()
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    tokenType: z.string(),
    expiresIn: z.number()
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.date(),
    deviceTrusted: z.boolean()
  }),
  security: z.object({
    riskScore: z.number(),
    requiresMfa: z.boolean(),
    trustedDevice: z.boolean(),
    location: z.object({
      country: z.string(),
      region: z.string(),
      city: z.string()
    }).optional()
  })
});

// Export schema types
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;