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
    // carica token da localStorage
    this.serviceToken = localStorage.getItem(this.TOKEN_KEY) || undefined;
    this.refreshToken = localStorage.getItem(this.REFRESH_KEY) || undefined;

    this.authState.next(!!this.serviceToken);
  }

  /** Step 1: inizia login Keycloak */
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

  logout() {
    // Clear local tokens first
    this.serviceToken = undefined;
    this.refreshToken = undefined;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this.authState.next(false);

    // Construct Keycloak logout URL
    const redirectUri = encodeURIComponent(window.location.origin); // where to go after logout
    const keycloakLogoutUrl = `${environment.keycloakUrl}/realms/${environment.keycloakRealm}/protocol/openid-connect/logout?redirect_uri=${redirectUri}`;

    // Redirect the user
    window.location.href = keycloakLogoutUrl;
  }

  /** Step 2: scambia code con token */
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

  getToken(): string | undefined {
    return this.serviceToken;
  }
}