#!/bin/bash

# Gotenberg Service Setup Script

set -e

echo "🚀 Gotenberg Service Setup"
echo "========================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Generate API keys if requested
if [ "$1" == "generate-keys" ]; then
    echo ""
    echo "🔑 Generating secure API keys..."
    
    # Generate the keys
    PROD_KEY=$(openssl rand -hex 32)
    DEV_KEY=$(openssl rand -hex 32)
    BACKUP_KEY=$(openssl rand -hex 32)
    
    # Check if -u or --update flag is provided
    if [ "$2" == "-u" ] || [ "$2" == "--update" ]; then
        echo ""
        echo "📝 Updating api-keys.json..."
        
        # Create backup
        if [ -f "api-keys.json" ]; then
            cp api-keys.json api-keys.json.backup
            echo "📋 Created backup: api-keys.json.backup"
        fi
        
        # Update the JSON file
        cat > api-keys.json << EOF
{
  "production": {
    "key": "${PROD_KEY}",
    "name": "Production Key",
    "description": "Main production API key",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "lastUsed": null,
    "active": true
  },
  "development": {
    "key": "${DEV_KEY}",
    "name": "Development Key", 
    "description": "Development and testing API key",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "lastUsed": null,
    "active": true
  },
  "backup": {
    "key": "${BACKUP_KEY}",
    "name": "Backup Key",
    "description": "Emergency backup API key",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "lastUsed": null,
    "active": true
  }
}
EOF
        
        echo "✅ Successfully updated api-keys.json"
        echo ""
        echo "🔑 Your new API keys:"
        echo "  Production: ${PROD_KEY}"
        echo "  Development: ${DEV_KEY}"
        echo "  Backup: ${BACKUP_KEY}"
        echo ""
        echo "⚠️  Store these keys securely!"
        
    else
        echo ""
        echo "Production Key: ${PROD_KEY}"
        echo "Development Key: ${DEV_KEY}"
        echo "Backup Key: ${BACKUP_KEY}"
        echo ""
        echo "⚠️  Please update api-keys.json with these keys!"
        echo ""
        echo "💡 Tip: Use './setup.sh generate-keys -u' to update the JSON file automatically"
    fi
    
    exit 0
fi

# Check if api-keys.json has been updated
if grep -q "your-secret-api-key-here" api-keys.json; then
    echo ""
    echo "⚠️  WARNING: api-keys.json contains default keys!"
    echo "Please update with secure keys first."
    echo ""
    echo "Run: ./setup.sh generate-keys"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install npm dependencies for API gateway
echo ""
echo "📦 Installing API gateway dependencies..."
cd api-gateway
npm install
cd ..

# Build and start services
echo ""
echo "🐳 Starting Docker services..."
docker-compose up -d --build

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Test health endpoint
echo ""
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API Gateway is healthy!"
else
    echo "❌ API Gateway health check failed"
    echo "Check logs with: docker-compose logs api-gateway"
    exit 1
fi

# Show status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ Gotenberg service is ready!"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:3000/forms/libreoffice/convert \\"
echo "    -H 'X-API-Key: your-api-key' \\"
echo "    -F 'files=@document.docx' \\"
echo "    -o converted.pdf"
echo ""
echo "View logs:"
echo "  docker-compose logs -f"
echo ""