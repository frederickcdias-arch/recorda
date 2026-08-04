#!/bin/sh
set -e

# Persistent volumes (e.g. a Railway volume mounted over /app/uploads) attach
# owned by root, overriding the chown baked into the image at build time.
# Re-chown here (still running as root) before dropping to the nodejs user.
mkdir -p "${UPLOADS_DIR:-/app/uploads}"
chown -R nodejs:nodejs "${UPLOADS_DIR:-/app/uploads}"

exec su-exec nodejs "$@"
