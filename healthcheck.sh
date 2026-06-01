#!/bin/sh

# Health check script for nginx
# Returns 0 if healthy, 1 if unhealthy
# Uses wget (available in nginx:alpine) instead of curl.

# Check if nginx is running
if ! pgrep nginx > /dev/null; then
    exit 1
fi

# Check if the application is responding
# wget exits 0 on success, non-zero on failure; -q suppresses output.
if wget -q -O /dev/null http://localhost:3000/health; then
    exit 0
else
    exit 1
fi
