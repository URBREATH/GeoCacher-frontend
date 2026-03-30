import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth-service.service';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { NavigationStart, Router } from '@angular/router';
import { ApiService } from '../../../services/api.service';
import { AnalysisAvailabilityService } from '../../../services/analysis-availability.service';

@Component({
  selector: 'ngx-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit {
  currentLanguage: string;
  userMenu: Array<{ title: string; click?: () => void }> = [];
  isAuthenticated$: Observable<boolean>;
  showAnalysisCitySelection: boolean = false;
  analysisCities: string[] = [];
  

  constructor(
    public authService: AuthService,
    private translate: TranslateService,
    private router: Router,
    private apiServices: ApiService,
    private analysisAvailabilityService: AnalysisAvailabilityService
  ) {
    this.currentLanguage = this.getCookie('language') || 'en';
    this.isAuthenticated$ = this.authService.isAuthenticated$;
    this.analysisCities = this.analysisAvailabilityService.getAvailableAnalysisCities().slice().sort((a, b) => a.localeCompare(b));
    
  }

  async ngOnInit(): Promise<void> {
    this.currentLanguage = this.translate.currentLang || 'en';

    this.translate.onLangChange.subscribe(event => {
      this.currentLanguage = event.lang;
    });

    this.router.events
      .pipe(filter(e => e instanceof NavigationStart))
      .subscribe(() => {
        this.showAnalysisCitySelection = false;
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

  toggleAnalysisCitySelection(event?: Event): void {
    if (event) {
      event.preventDefault();
    }

    this.showAnalysisCitySelection = !this.showAnalysisCitySelection;
  }

  navigateToAnalysisForCity(city: string): void {
    this.apiServices.storedLayers = [];
    this.showAnalysisCitySelection = false;
    this.router.navigate(['/pages/analysis-layer'], {
      queryParams: { city },
    });
  }
}