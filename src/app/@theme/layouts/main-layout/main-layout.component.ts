import { Component, OnInit } from '@angular/core';
import { KeycloakService } from '../../../services/keycloak.service';

@Component({
  selector: 'ngx-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit {
  currentLanguage: string;
  userMenu: Array<{ title: string; click?: () => void }> = [];
  userPictureOnly = false;

  constructor(public keycloakService: KeycloakService) {
    this.currentLanguage = this.getCookie('language') || 'en';
  }

  async ngOnInit(): Promise<void> {
    const authenticated = await this.keycloakService.init();
    if (this.keycloakService.isLoggedIn()) {
      this.userMenu = [
        { title: 'Profile', click: () => this.goToProfile() },
        { title: 'Logout', click: () => this.keycloakService.logout() }
      ];
    }
  }

  switchLanguage(language: string): void {
    this.currentLanguage = language;
    document.cookie = `language=${language}`;
    window.location.reload();
  }

  getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || '';
    return '';
  }

  toggleSidebar(): void {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed').toString());
    }
  }

  goToProfile(): void {
    // Navigate to profile page
    console.log('Navigate to profile page');
  }
}
