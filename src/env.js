// Simple script to load environment variables
// This script checks if window.env exists and initializes it with default values if not
(function(window) {
  // Initialize the environment object if it doesn't exist
  window.env = window.env || {};

  // Set default values for all required environment variables
  // These will be used if the corresponding variables are not defined elsewhere
  var defaults = {
    apiUrl: 'https://geocacher-api-dev.urbreath.tech',
    //apiUrl: 'http://localhost:9090'
    // Add other environment variables here as needed
  };

  // Apply defaults for any missing properties
  for (var key in defaults) {
    if (!window.env.hasOwnProperty(key)) {
      window.env[key] = defaults[key];
    }
  }

  // Log the configuration when in development mode
  if (window.location.hostname === 'localhost') {
    console.log('Environment configuration:', window.env);
  }

  // Early postMessage listener: captures SSO tokens sent by the parent dashboard
  // before Angular has bootstrapped. Buffered into window.__ssoPayload so that
  // AuthService can consume them on init.
  window.__ssoPayload = null;
  window.addEventListener('message', function(event) {
    var data = event && event.data;
    if (data && data.refreshToken) {
      var serviceToken = data.serviceToken || data.accessToken || data.token || data.access_token || null;
      window.__ssoPayload = { serviceToken: serviceToken, refreshToken: data.refreshToken };
    }
  });
})(this);