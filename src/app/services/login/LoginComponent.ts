// src/app/components/login/login.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth-service.service';

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
    const code = this.route.snapshot.queryParamMap.get('code');

    if (code) {
      this.authService.exchangeCode(code).then(() => {
        // Login completato, reindirizza alla home o route originale
        this.router.navigate(['/']);
      });
    } else {
      // Nessun code: opzionale, puoi ridirigere alla home o chiedere login
      this.router.navigate(['/']);
    }
  }
}