#!/bin/bash

# Multi-Server Test Script
# This script demonstrates the multi-server functionality

echo "=== Multi-Server Setup Test ==="
echo ""

# Get today's day
DAY=$(date +%d)
echo "Today's day: $DAY"
echo ""

# Test 1: Check health endpoint
echo "1. Checking server health..."
curl -s http://localhost:3000/health | python3 -m json.tool | grep -A 10 "servers"
echo ""

# Test 2: Try to login to server 1234
echo "2. Testing login to server 1234 (password: ${DAY}1234)..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${DAY}1234\"}" \
  -c cookies_1234.txt)

if echo "$RESPONSE" | grep -q "success"; then
  echo "✓ Successfully logged into server 1234"
else
  echo "✗ Failed to login to server 1234"
  echo "Response: $RESPONSE"
fi
echo ""

# Test 3: Try to login to server 5678
echo "3. Testing login to server 5678 (password: ${DAY}5678)..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${DAY}5678\"}" \
  -c cookies_5678.txt)

if echo "$RESPONSE" | grep -q "success"; then
  echo "✓ Successfully logged into server 5678"
else
  echo "✗ Failed to login to server 5678"
  echo "Response: $RESPONSE"
fi
echo ""

# Test 4: Try invalid server
echo "4. Testing invalid server (password: ${DAY}0000)..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${DAY}0000\"}")

if echo "$RESPONSE" | grep -q "error"; then
  echo "✓ Correctly rejected invalid server"
else
  echo "✗ Should have rejected invalid server"
fi
echo ""

# Test 5: Send message to server 1234
echo "5. Sending test message to server 1234..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -b cookies_1234.txt \
  -d "{\"content\": \"Test message for server 1234\"}")

if echo "$RESPONSE" | grep -q "success"; then
  echo "✓ Message sent to server 1234"
else
  echo "✗ Failed to send message"
fi
echo ""

# Test 6: Send message to server 5678
echo "6. Sending test message to server 5678..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -b cookies_5678.txt \
  -d "{\"content\": \"Test message for server 5678\"}")

if echo "$RESPONSE" | grep -q "success"; then
  echo "✓ Message sent to server 5678"
else
  echo "✗ Failed to send message"
fi
echo ""

# Test 7: Verify messages are isolated
echo "7. Verifying message isolation..."
MESSAGES_1234=$(curl -s http://localhost:3000/api/messages -b cookies_1234.txt)
MESSAGES_5678=$(curl -s http://localhost:3000/api/messages -b cookies_5678.txt)

if echo "$MESSAGES_1234" | grep -q "server 1234" && ! echo "$MESSAGES_1234" | grep -q "server 5678"; then
  echo "✓ Server 1234 only sees its own messages"
else
  echo "✗ Message isolation may be broken"
fi

if echo "$MESSAGES_5678" | grep -q "server 5678" && ! echo "$MESSAGES_5678" | grep -q "server 1234"; then
  echo "✓ Server 5678 only sees its own messages"
else
  echo "✗ Message isolation may be broken"
fi
echo ""

# Cleanup
rm -f cookies_1234.txt cookies_5678.txt

echo "=== Test Complete ==="
echo ""
echo "Summary:"
echo "- Three servers configured: 1234, 5678, 9999"
echo "- Each server has isolated message and media tables"
echo "- Password format: ${DAY}XXXX (where XXXX is the server ID)"
echo "- Frontend works dynamically with any server"
