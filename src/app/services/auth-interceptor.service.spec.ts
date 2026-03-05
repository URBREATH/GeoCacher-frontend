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
  constructor(private authService: AuthService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Wrap token retrieval in a Promise in case you later implement refresh
    return from(Promise.resolve(this.authService.getToken())).pipe(
      switchMap((token) => {
        if (token) {
          request = request.clone({
            setHeaders: {
              Authorization: token, // already "Bearer ..." from AuthService
            },
          });
        }
        return next.handle(request);
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          // Optional: auto-logout on 401
          this.authService.logout();
        }
        return throwError(() => err);
      })
    );
  }
}