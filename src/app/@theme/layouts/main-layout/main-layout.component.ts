import { Component, OnInit } from '@angular/core';
import { KeycloakService } from '../../../services/keycloak.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'ngx-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit {
  currentLanguage: string;
  userMenu: Array<{ title: string; click?: () => void }> = [];
  isAuthenticated$: Observable<boolean>;

  constructor(/*public keycloakService: KeycloakService*/) {
    this.currentLanguage = this.getCookie('language') || 'en';
    //this.isAuthenticated$ = this.keycloakService.authenticated$;
  }

  async ngOnInit(): Promise<void> {
    /*
    console.log('MainLayoutComponent initializing...');

    // Initialize Keycloak (this sets up the BehaviorSubject)
    //await this.keycloakService.init();

    // Subscribe to the real-time authentication status
    this.keycloakService.authenticated$.subscribe(isAuth => {
      console.log('Real-time auth status:', isAuth);

      if (isAuth) {
        this.userMenu = [
          { title: 'Profile', click: () => this.goToProfile() },
          { title: 'Logout', click: () => this.keycloakService.logout() },
        ];
      } else {
        this.userMenu = [];
      }
    });
    */
  }

  switchLanguage(language: string): void {
    this.currentLanguage = language;
    document.cookie = `language=${language}`;
    window.location.reload();
  }

  getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop()?.split(';').shift() || '' : '';
  }

  toggleSidebar(): void {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed').toString());
    }
  }

  goToProfile(): void {
    console.log('Navigate to profile page');
  }
}