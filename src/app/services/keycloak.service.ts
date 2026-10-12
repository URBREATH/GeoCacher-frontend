/*
import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment.prod';

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private keycloak: any;
  private _initPromise?: Promise<boolean>;

  private _authenticated$ = new BehaviorSubject<boolean>(false);
  public authenticated$ = this._authenticated$.asObservable();

  private _authenticated = false; // for old compatibility

  constructor() {
    const env = (window as any).env || {};
    this.keycloak = new (Keycloak as any)({
      url: env.keycloakUrl || environment.keycloakUrl,
      realm: env.keycloakRealm || environment.keycloakRealm,
      clientId: env.keycloakClientId || environment.keycloakClientId,
    });
  }

  init(): Promise<boolean> {
    if (this._initPromise) {
      console.log('Returning existing init promise');
      return this._initPromise;
    }

    if (this._authenticated) {
      console.log('Keycloak already initialized');
      return Promise.resolve(true);
    }

    this._initPromise = this.keycloak
      .init({
        onLoad: 'check-sso',
        checkLoginIframe: false,
        pkceMethod: 'S256',
        redirectUri: window.location.origin,
      })
      .then((authenticated: boolean) => {
        console.log('Keycloak init resolved. Authenticated:', authenticated);
        this._authenticated = authenticated;
        this._authenticated$.next(authenticated);
        return authenticated;
      })
      .catch((err: any) => {
        console.error('Keycloak init failed', err);
        this._authenticated = false;
        this._authenticated$.next(false);
        return false;
      });

    return this._initPromise;
  }

  login(): void {
    console.log('KeycloakService.login() called');
    this.keycloak.login({ redirectUri: window.location.origin + '/' });
  }

  logout(): void {
    console.log('KeycloakService.logout() called');
    this.keycloak.logout({ redirectUri: window.location.origin });
  }

  isLoggedIn(): boolean {
    return this._authenticated;
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

  getToken(): string | undefined {
    return this.keycloak.token;
  }

  getUsername(): string {
    return this.keycloak.tokenParsed?.preferred_username || '';
  }

  getRoles(): string[] {
    return this.keycloak.tokenParsed?.realm_access?.roles || [];
  }
}
  */