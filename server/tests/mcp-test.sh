#!/bin/bash
# Simple MCP server test script

BASE_URL="http://localhost:3002"

echo "=== Testing MCP Server ==="
echo ""

# Health check
echo "1. Health Check:"
curl -s "$BASE_URL/health" | jq .
echo ""

# Well-known MCP
echo "2. Well-known MCP metadata:"
curl -s "$BASE_URL/.well-known/mcp" | jq .
echo ""

# Initialize session
echo "3. Initialize MCP session:"
RESPONSE=$(curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -D - \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}')

SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | awk '{print $2}' | tr -d '\r')
echo "Session ID: $SESSION_ID"
echo "$RESPONSE" | grep "data:" | sed 's/data: //' | jq .
echo ""

echo "=== MCP Server tests complete ==="
