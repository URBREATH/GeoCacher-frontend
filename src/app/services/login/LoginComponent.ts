// src/app/components/login/login.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth-service.service';

@Component({
  selector: 'app-login',
  template: `<p>Logging in...</p>`,
})
export class LoginComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // Prende il code dalla query string
    const code = this.route.snapshot.queryParamMap.get('code');

    if (code) {
      console.log('Found code:', code);

      // Invia il code al backend per ottenere il token
      this.authService.exchangeCode(code).then(() => {
        console.log('Got token:', this.authService.getToken());

        // Rimuove il code dalla URL
        window.history.replaceState({}, document.title, '/');

        // Reindirizza alla home o dashboard
        this.router.navigate(['/']);
      }).catch(err => {
        console.error('Failed to exchange code', err);
      });
    } else {
      console.log('No code in URL, redirecting to Keycloak login');
      // Inizia il login Keycloak se non c’è code
      this.authService.login();
    }
  }
}