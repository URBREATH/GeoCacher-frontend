import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'ngx-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit {
  currentLanguage: string;

  constructor() {
    this.currentLanguage = this.getCookie('language') || 'en';
  }

  ngOnInit(): void {
  }

  switchLanguage(language: string): void {
    // Implement your language switching logic here
    // You should have a service that handles translations
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
      
      // Save state to localStorage so it persists between page loads
      const isCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
    }
  }
}