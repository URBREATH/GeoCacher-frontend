// src/app/services/auth-interceptor.service.ts
import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './auth-service.service';

@Injectable({ providedIn: 'root' })
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;

  constructor(private authService: AuthService) { }

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    return from(Promise.resolve(this.authService.getToken())).pipe(
      switchMap((token) => {
        if (token) {
          request = request.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
        }
        return next.handle(request);
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 401 && !this.isRefreshing) {
          this.isRefreshing = true;
          return from(this.authService.refreshAccessToken()).pipe(
            switchMap((newToken) => {
              this.isRefreshing = false;
              if (!newToken) return throwError(() => err);
              const retried = request.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next.handle(retried);
            }),
            catchError((refreshErr) => {
              this.isRefreshing = false;
              return throwError(() => refreshErr);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }
}