#!/bin/sh

# This script runs at container startup to replace environment variables in the env.js file
# It's designed to be run by the entrypoint.sh script in a Docker container

# Path to the generated env.js file

ENV_FILE=/usr/share/nginx/html/env.js

if [ -f "$ENV_FILE" ]; then

  echo "Applying runtime environment variables..."

  if [ ! -z "$API_URL" ]; then
    echo "Setting API_URL to $API_URL"
    sed -i "s|window.env.apiUrl = '.*'|window.env.apiUrl = '$API_URL'|g" $ENV_FILE
  fi

  if [ ! -z "$KEYCLOAK_URL" ]; then
    echo "Setting KEYCLOAK_URL to $KEYCLOAK_URL"
    sed -i "s|window.env.keycloakUrl = '.*'|window.env.keycloakUrl = '$KEYCLOAK_URL'|g" $ENV_FILE
  fi

  if [ ! -z "$KEYCLOAK_REALM" ]; then
    echo "Setting KEYCLOAK_REALM to $KEYCLOAK_REALM"
    sed -i "s|window.env.keycloakRealm = '.*'|window.env.keycloakRealm = '$KEYCLOAK_REALM'|g" $ENV_FILE
  fi

  if [ ! -z "$KEYCLOAK_CLIENT_ID" ]; then
    echo "Setting KEYCLOAK_CLIENT_ID to $KEYCLOAK_CLIENT_ID"
    sed -i "s|window.env.keycloakClientId = '.*'|window.env.keycloakClientId = '$KEYCLOAK_CLIENT_ID'|g" $ENV_FILE
  fi

  echo "Environment configuration updated."

else
  echo "Warning: $ENV_FILE not found."
fi
