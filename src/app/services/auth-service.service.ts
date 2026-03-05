// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  scope?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'accessToken';
  private readonly REFRESH_KEY = 'refreshToken';

  private _authenticated$ = new BehaviorSubject<boolean>(false);
  public authenticated$ = this._authenticated$.asObservable();

  constructor(private http: HttpClient) {
    // Initialize state from localStorage
    const token = localStorage.getItem(this.TOKEN_KEY);
    this._authenticated$.next(!!token);
  }

  /** Start login: get Keycloak URL from backend and redirect browser */
  async login() {
    try {
      const res: { loginUrl: string } = await this.http
        .get<{ loginUrl: string }>(`${environment.base_url}/api/auth/login-url`)
        .toPromise();

      window.location.href = res.loginUrl;
    } catch (err) {
      console.error('Failed to get login URL', err);
      throw err;
    }
  }

  /** Exchange the authorization code from Keycloak for tokens */
  async exchangeCode(code: string) {
    try {
      const body = new URLSearchParams();
      body.set('code', code);

      const res: TokenResponse = await this.http
        .post<TokenResponse>(
          `${environment.base_url}/api/auth/token`,
          body.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        )
        .toPromise();

      this.setTokens(res.access_token, res.refresh_token);
      this._authenticated$.next(true);
    } catch (err) {
      console.error('Failed to exchange code for tokens', err);
      this._authenticated$.next(false);
      throw err;
    }
  }

  /** Save tokens in memory + localStorage */
  private setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    localStorage.setItem(this.TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(this.REFRESH_KEY, refreshToken);
    }
  }

  /** Get current access token */
  getToken(): string | null {
    return this.accessToken || localStorage.getItem(this.TOKEN_KEY);
  }

  /** Logout: clear tokens */
  logout() {
    this.accessToken = undefined;
    this.refreshToken = undefined;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this._authenticated$.next(false);
    // Optionally call backend logout endpoint here
  }

  /** Check if user is logged in */
  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private accessToken?: string;
  private refreshToken?: string;
}