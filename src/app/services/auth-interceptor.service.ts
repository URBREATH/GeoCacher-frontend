import { Injectable } from "@angular/core";
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from "@angular/common/http";
import { Observable, throwError, from } from "rxjs"; // ✅ from comes from 'rxjs', not 'rxjs/operators'
import { catchError, switchMap } from "rxjs/operators";
import { KeycloakService } from "./keycloak.service";

@Injectable({ providedIn: "root" })
export class KeycloakInterceptor implements HttpInterceptor {
  constructor(private keycloak: KeycloakService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    return from(this.keycloak.updateToken(30)).pipe(
      switchMap((token) => {
        if (token) {
          request = request.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
        }
        return next.handle(request);
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.keycloak.logout();
        }
        return throwError(() => err);
      })
    );
  }
}
