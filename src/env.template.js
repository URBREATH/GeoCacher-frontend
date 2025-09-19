// src/env.template.js
(function(window) {
  window.env = window.env || {};

  // Aggiungi qui le variabili che il tuo frontend deve conoscere
  window.env.apiUrl = '${API_URL}';
})(this);