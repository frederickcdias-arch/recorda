#!/bin/sh

# Health check script for nginx
# Returns 0 if healthy, 1 if unhealthy

# Check if nginx is running
if ! pgrep nginx > /dev/null; then
    exit 1
fi

# Check if the application is responding
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ "$response" = "200" ]; then
    exit 0
else
    exit 1
fi
