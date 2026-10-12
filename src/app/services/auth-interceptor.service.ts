import { Injectable } from "@angular/core";
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from "@angular/common/http";
import { Observable, throwError, from } from "rxjs";
import { catchError, switchMap } from "rxjs/operators";
import { AuthService } from "./auth-service.service";

@Injectable({ providedIn: "root" })
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const token = this.authService.getToken(); // get token from AuthService

    if (token) {
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }

    return next.handle(request).pipe(
      catchError((err) => {
        if (
          err instanceof HttpErrorResponse &&
          err.status === 401 &&
          !request.url.includes("/api/auth/") &&
          !request.url.includes("/ogcapi/")
        ) {
          return from(this.authService.refreshAccessToken()).pipe(
            switchMap((newToken) => {
              if (newToken) {
                const retryRequest = request.clone({
                  setHeaders: { Authorization: `Bearer ${newToken}` },
                });
                return next.handle(retryRequest);
              }

              this.authService.logout();
              return throwError(() => err);
            }),
            catchError(() => {
              this.authService.logout();
              return throwError(() => err);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }
}