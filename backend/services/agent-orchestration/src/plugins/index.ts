import { FastifyInstance } from 'fastify';
import { Logger } from '../utils/logger';

const logger = Logger.child({ component: 'plugins' });

export async function setupPlugins(server: FastifyInstance): Promise<void> {
  logger.info('Setting up additional plugins...');
  
  // Add any additional plugins here
  // For example: custom authentication, validation, etc.
  
  logger.info('Additional plugins setup completed');
}