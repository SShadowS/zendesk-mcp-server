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
    echo ""
    echo "Production Key: $(openssl rand -hex 32)"
    echo "Development Key: $(openssl rand -hex 32)"
    echo "Backup Key: $(openssl rand -hex 32)"
    echo ""
    echo "⚠️  Please update api-keys.json with these keys!"
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