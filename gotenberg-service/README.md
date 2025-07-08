# Gotenberg Document Conversion Service

This directory contains the Docker-based document conversion service used to convert Word documents to PDF format for analysis with Claude's API.

## Important Notes

- **This directory is NOT part of the npm package** - it's excluded via `.npmignore`
- This is a separate service that should be deployed independently
- The Zendesk MCP server communicates with this service via HTTP API

## Contents

- `ConvertPLAN.md` - Complete implementation plan and instructions
- Additional files will be added when implementing the service

## Quick Start

See `ConvertPLAN.md` for detailed setup instructions.

## Why Separate?

1. The conversion service is optional - not all users may need Word-to-PDF conversion
2. It requires Docker, which not all environments may have
3. It can be deployed once and shared across multiple MCP server instances
4. Keeps the npm package lightweight and focused on the core MCP functionality