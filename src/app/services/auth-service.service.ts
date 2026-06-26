// src/app/services/auth-service.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private serviceToken?: string;
  private refreshToken?: string;

  private readonly TOKEN_KEY = 'serviceToken';
  private readonly REFRESH_KEY = 'refreshToken';

  private authState = new BehaviorSubject<boolean>(false);
  isAuthenticated$ = this.authState.asObservable();

  constructor(private http: HttpClient) {
    // Consume any SSO payload buffered by env.js before Angular bootstrapped
    const sso = (window as any).__ssoPayload;
    if (sso && sso.serviceToken && sso.refreshToken) {
      const raw = sso.serviceToken.startsWith('Bearer ') ? sso.serviceToken.slice(7) : sso.serviceToken;
      localStorage.setItem(this.TOKEN_KEY, raw);
      localStorage.setItem(this.REFRESH_KEY, sso.refreshToken);
      (window as any).__ssoPayload = null;
    }

    this.serviceToken = localStorage.getItem(this.TOKEN_KEY) || undefined;
    this.refreshToken = localStorage.getItem(this.REFRESH_KEY) || undefined;

    this.authState.next(!!this.serviceToken);
  }

  /**
   * Inizia il login richiedendo l'URL di Keycloak al backend.
   * Successivamente reindirizza l'utente alla pagina di login.
   */
  async login() {
    try {
      const res: { loginUrl: string } = await this.http
        .get<{ loginUrl: string }>(`${environment.base_url}/api/auth/login-url`)
        .toPromise();

      window.location.href = res.loginUrl;
    } catch (err) {
      console.error('Failed to get login URL', err);
    }
  }

  /**
   * Rimuove i token locale e reindirizza al logout di Keycloak.
   * Questo termina la sessione anche sul server di autenticazione.
   */
  logout() {
    // Cancella i token locali prima del logout
    this.serviceToken = undefined;
    this.refreshToken = undefined;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this.authState.next(false);

    // Costruisce l'URL di logout di Keycloak e reindirizza
    const redirectUri = encodeURIComponent(window.location.origin);
    const keycloakLogoutUrl = `${environment.keycloakUrl}/realms/${environment.keycloakRealm}/protocol/openid-connect/logout?redirect_uri=${redirectUri}`;

    window.location.href = keycloakLogoutUrl;
  }

  /**
   * Scambia il codice di autorizzazione ricevuto da Keycloak con access e refresh token.
   * Salva i token in memoria e in localStorage per l'uso successivo.
   */
  async exchangeCode(code: string) {
    const body = new URLSearchParams();
    body.set('code', code);

    const res: TokenResponse = await this.http
      .post<TokenResponse>(
        `${environment.base_url}/api/auth/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      .toPromise();

    this.serviceToken = res.access_token;
    this.refreshToken = res.refresh_token;

    localStorage.setItem(this.TOKEN_KEY, this.serviceToken);
    localStorage.setItem(this.REFRESH_KEY, this.refreshToken);
    this.authState.next(true);
  }

  /**
   * Restituisce il token d'accesso corrente se presente.
   * Viene usato dall'interceptor per aggiungere l'header Authorization.
   */
  getToken(): string | undefined {
    return this.serviceToken;
  }

  /**
   * Imposta i token ricevuti tramite postMessage dal dashboard SSO.
   * Aggiorna sia la memoria che localStorage e notifica lo stato di autenticazione.
   */
  setTokensFromSSO(serviceToken: string | null, refreshToken: string): void {
    this.refreshToken = refreshToken;
    localStorage.setItem(this.REFRESH_KEY, refreshToken);

    if (serviceToken) {
      const rawToken = serviceToken.startsWith('Bearer ') ? serviceToken.slice(7) : serviceToken;
      this.serviceToken = rawToken;
      localStorage.setItem(this.TOKEN_KEY, rawToken);
      this.authState.next(true);
    }
    // If only refreshToken arrived, the interceptor will use it to fetch a fresh serviceToken on the first 401
  }

  /**
   * Richiama il backend per aggiornare l'access token usando il refresh token.
   * Se il refresh ha successo, aggiorna i token locali e ritorna il nuovo access token.
   * In caso di errore effettua il logout.
   */
  async refreshAccessToken(): Promise<string | null> {
    const refresh = this.refreshToken;
    if (!refresh) return null;

    try {
      const body = new URLSearchParams();
      body.set('refreshToken', refresh);

      const res: TokenResponse = await this.http
        .post<TokenResponse>(
          `${environment.base_url}/api/auth/refresh`,
          body.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        )
        .toPromise();

      this.serviceToken = res.access_token;
      this.refreshToken = res.refresh_token;
      localStorage.setItem(this.TOKEN_KEY, this.serviceToken);
      localStorage.setItem(this.REFRESH_KEY, this.refreshToken);
      this.authState.next(true);
      return this.serviceToken;
    } catch {
      return null;
    }
  }
}