#!/bin/bash

# Fine Print AI - Docker Compose Convenience Script
# This script allows running docker-compose commands from the project root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/infrastructure/docker"

# Change to the docker directory and run docker-compose with all passed arguments
cd "$DOCKER_DIR"
exec docker-compose "$@"