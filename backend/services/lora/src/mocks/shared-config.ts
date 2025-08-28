export const config = {
  cors: {
    origins: ['http://localhost:3000']
  },
  services: {
    lora: {
      port: 8007,
      host: '0.0.0.0'
    }
  },
  environment: 'development'
};