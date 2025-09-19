#!/bin/sh

# This script runs at container startup to replace environment variables in the env.js file
# It's designed to be run by the entrypoint.sh script in a Docker container

# Path to the generated env.js file
ENV_FILE=/usr/share/nginx/html/env.js

# Check if the env.js file exists
if [ -f "$ENV_FILE" ]; then
  # Replace the API_URL environment variable in the env.js file
  if [ ! -z "$API_URL" ]; then
    echo "Setting API_URL to $API_URL"
    # Use sed to replace the apiUrl value
    sed -i "s|apiUrl: '[^']*'|apiUrl: '$API_URL'|g" $ENV_FILE
  fi
  
  # Add more environment variable replacements here as needed
  
  echo "Environment configuration updated."
else
  echo "Warning: $ENV_FILE not found. Environment variables will not be applied."
fi