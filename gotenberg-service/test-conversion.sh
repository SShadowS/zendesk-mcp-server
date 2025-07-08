#!/bin/bash

# Test script for Gotenberg conversion service

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-your-secret-api-key-here-1234567890abcdef}"

echo "🧪 Gotenberg Conversion Test"
echo "==========================="
echo "API URL: $API_URL"
echo ""

# Check if service is running
echo "1. Testing health endpoint..."
if curl -f "$API_URL/health" > /dev/null 2>&1; then
    echo "✅ Service is healthy"
else
    echo "❌ Service health check failed"
    exit 1
fi

# Test authentication
echo ""
echo "2. Testing authentication..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/forms/libreoffice/convert" -H "X-API-Key: invalid-key")
STATUS=$(echo "$RESPONSE" | tail -n 1)
if [ "$STATUS" = "401" ]; then
    echo "✅ Authentication working (rejected invalid key)"
else
    echo "❌ Authentication test failed (expected 401, got $STATUS)"
fi

# Create test document if it doesn't exist
if [ ! -f "test-document.docx" ]; then
    echo ""
    echo "3. Creating test document..."
    cat > test-document.txt << EOF
Test Document for Gotenberg Conversion

This is a simple test document to verify that the Gotenberg service
can successfully convert Word documents to PDF format.

Features to test:
- Basic text conversion
- Multiple paragraphs
- Special characters: © ® ™ € £ ¥
- Emojis: 😀 🚀 ✅ ❌

Date: $(date)
EOF
    echo "✅ Created test-document.txt (convert manually to .docx for full test)"
    TEST_FILE="test-document.txt"
else
    TEST_FILE="test-document.docx"
fi

# Test conversion
echo ""
echo "4. Testing document conversion..."
echo "   Converting: $TEST_FILE"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/forms/libreoffice/convert" \
  -H "X-API-Key: $API_KEY" \
  -F "files=@$TEST_FILE" \
  -o "test-output.pdf")

STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$STATUS" = "200" ]; then
    if [ -f "test-output.pdf" ] && [ -s "test-output.pdf" ]; then
        echo "✅ Conversion successful!"
        echo "   Output saved to: test-output.pdf"
        echo "   Size: $(ls -lh test-output.pdf | awk '{print $5}')"
    else
        echo "❌ Conversion failed - no output file"
    fi
else
    echo "❌ Conversion failed with status: $STATUS"
    echo "   Check logs: docker-compose logs api-gateway"
fi

# Test rate limiting
echo ""
echo "5. Testing rate limiting..."
echo "   Sending 3 rapid requests..."

for i in {1..3}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/forms/libreoffice/convert" \
      -H "X-API-Key: $API_KEY" \
      -F "files=@$TEST_FILE")
    echo "   Request $i: HTTP $STATUS"
    sleep 0.1
done

echo ""
echo "✅ Tests completed!"
echo ""
echo "To test with a real Word document:"
echo "  API_KEY=your-key ./test-conversion.sh"
echo ""