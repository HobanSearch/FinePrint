#!/bin/bash

# Create initial migration for privacy scoring schema
npx prisma migrate dev --name init_privacy_scoring_schema

echo "Migration created successfully!"