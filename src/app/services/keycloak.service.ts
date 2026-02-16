// src/app/services/keycloak.service.ts
import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';
import { environment } from '../../environments/environment.prod';

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private keycloak: any;
  private _authenticated = false;
  private _initPromise?: Promise<boolean>;

  constructor() {
    // ✅ REQUIRED for your Keycloak version
    this.keycloak = new (Keycloak as any)({
      url: environment.keycloakUrl,
      realm: environment.keycloakRealm,
      clientId: environment.keycloakClientId,
    });
  }

  // Called by APP_INITIALIZER
  init(): Promise<boolean> {
  return this.keycloak
    .init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    })
    .then((authenticated: boolean) => {
      console.log('Keycloak authenticated:', authenticated);
      this._authenticated = authenticated;
      return authenticated; // ✅ return boolean
    })
    .catch((err: any) => {
      console.error('Keycloak init failed', err);
      return false; // or throw err if you want APP_INITIALIZER to fail
    });
}


  getToken(): string | undefined {
    return this.keycloak.token;
  }

  updateToken(minValidity = 30): Promise<string> {
    return this.keycloak
      .updateToken(minValidity)
      .then(() => this.keycloak.token)
      .catch(() => {
        console.warn('Token refresh failed');
        return '';
      });
  }

  login(): void {
    this.keycloak.login();
  }

  logout(): void {
    this.keycloak.logout();
  }

  getUsername(): string {
    return this.keycloak.tokenParsed?.preferred_username || 'Unknown';
  }

  getRoles(): string[] {
    return this.keycloak.tokenParsed?.realm_access?.roles || [];
  }

  isLoggedIn(): boolean {
    return this._authenticated;
  }
}
