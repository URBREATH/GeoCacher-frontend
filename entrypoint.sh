#!/bin/sh
# Path to the Nginx serving directory
ROOT_DIR=/usr/share/nginx/html

# Two approaches for environment configuration:
# 1. If env.template.js exists, use envsubst to replace placeholders
if [ -f "${ROOT_DIR}/env.template.js" ]; then
  echo "Using env.template.js to generate env.js"
  envsubst < ${ROOT_DIR}/env.template.js > ${ROOT_DIR}/env.js
# 2. Otherwise, use the set-env.sh script to modify the existing env.js
elif [ -f "/set-env.sh" ]; then
  echo "Using set-env.sh to update env.js"
  chmod +x /set-env.sh
  /set-env.sh
else
  echo "Warning: No environment configuration method found."
fi

# Start Nginx in foreground mode
nginx -g 'daemon off;'