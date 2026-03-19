import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../services/auth-service.service';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';

@Component({
  selector: 'ngx-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit {
  currentLanguage: string;
  userMenu: Array<{ title: string; click?: () => void }> = [];
  isAuthenticated$: Observable<boolean>;
  

  constructor(public authService: AuthService, private translate: TranslateService) {
    this.currentLanguage = this.getCookie('language') || 'en';
    this.isAuthenticated$ = this.authService.isAuthenticated$;
    
  }

  async ngOnInit(): Promise<void> {
    

  this.currentLanguage = this.translate.currentLang || 'en';

  this.translate.onLangChange.subscribe(event => {
    this.currentLanguage = event.lang;
  });


  }

  switchLanguage(lang: string) {
  this.currentLanguage = lang;
  this.translate.use(lang);
  //document.cookie = `language=${lang}; path=/`;
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