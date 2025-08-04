# Gotenberg Document Conversion Service

This directory contains the Docker-based document conversion service used to convert Word documents to PDF format for analysis with Claude's API.

## Important Notes

- **This directory is NOT part of the npm package** - it's excluded via `.npmignore`
- This is a separate service that should be deployed independently
- The Zendesk MCP server communicates with this service via HTTP API

## Contents

- `ConvertPLAN.md` - Complete implementation plan and instructions
- `docker-compose.yml` - Development Docker Compose configuration
- `docker-compose.prod.yml` - Production Docker Compose with Nginx
- `api-gateway/` - Node.js API gateway for authentication
- `setup.sh` - Automated setup script
- `test-conversion.sh` - Test script for the service

## Quick Start

### 1. Generate and Update API Keys
```bash
# Generate keys and automatically update api-keys.json
./setup.sh generate-keys -u

# Or generate keys and update manually
./setup.sh generate-keys
# Then edit api-keys.json with the generated keys
```

### 2. Start the Service
```bash
./setup.sh
```

### 3. Test the Service
```bash
./test-conversion.sh
```

### 4. Configure Zendesk MCP Server
Add to your `.env` file:
```env
GOTENBERG_API_URL=http://localhost:3000
GOTENBERG_API_KEY=your-secret-api-key-here
```

## Production Deployment

For production with HTTPS:
```bash
# Use the production compose file
docker-compose -f docker-compose.prod.yml up -d
```

See `ConvertPLAN.md` for detailed SSL setup instructions.

## Why Separate?

1. The conversion service is optional - not all users may need Word-to-PDF conversion
2. It requires Docker, which not all environments may have
3. It can be deployed once and shared across multiple MCP server instances
4. Keeps the npm package lightweight and focused on the core MCP functionality