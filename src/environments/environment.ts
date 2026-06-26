/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  base_url: "https://geocacher-api-dev.urbreath.tech",
  keycloakUrl: 'https://keycloak-dev.urbreath.tech/auth',
  keycloakRealm: 'urbreath-auth',
  keycloakClientId: 'urbreath',
  analysisAvailableCities: ['Aarhus', 'Athens', 'Cluj-Napoca', 'Kajaani', 'Leuven', 'Madrid', 'Parma', 'Pilsen', 'Tallinn'],
  //base_url: "http://localhost:9090"
  
};
