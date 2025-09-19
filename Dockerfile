# --- STAGE 1: Build dell'applicazione ---
FROM node:18 AS builder
WORKDIR /app
# Copia solo i file necessari per l'installazione dei pacchetti
# È una best practice per sfruttare la cache di Docker
COPY package*.json ./
# Installa le dipendenze
RUN npm install --legacy-peer-deps
# Copia il resto del codice sorgente
COPY . .
# Copia il template nella cartella dell'app
# In questo modo sarà disponibile dopo la build
COPY src/env.template.js ./src/assets/env.template.js
COPY src/env.js ./src/assets/env.js
# Esegui una build di produzione generica.
# La configurazione specifica verrà inserita a runtime.
RUN npm run build:docker
# --- STAGE 2: Esecuzione con Nginx ---
FROM nginx:alpine
# Copia i file dell'applicazione compilata dallo stage 'builder'
# Il percorso è /app/dist come specificato in angular.json
COPY --from=builder /app/dist/ /usr/share/nginx/html/
# Assicurati che il template dell'ambiente sia disponibile nella root
COPY --from=builder /app/src/assets/env.template.js /usr/share/nginx/html/env.template.js
COPY --from=builder /app/src/assets/env.js /usr/share/nginx/html/env.js
# Copia lo script di avvio personalizzato
COPY entrypoint.sh /entrypoint.sh
COPY set-env.sh /set-env.sh
# Rendi gli script eseguibili all'interno del container
RUN chmod +x /entrypoint.sh
RUN chmod +x /set-env.sh
# Imposta l'entrypoint del container per eseguire il nostro script.
# Questo script si occuperà di creare env.js e poi di avviare Nginx.
ENTRYPOINT ["/entrypoint.sh"]
# Esponi la porta 80
EXPOSE 80