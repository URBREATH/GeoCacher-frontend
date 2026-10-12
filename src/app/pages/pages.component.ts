import { ChangeDetectorRef, Component, OnInit } from "@angular/core";

@Component({
  selector: "ngx-pages",
  styleUrls: ["pages.component.scss"],
  template: `
    <ngx-one-column-layout *ngIf="isEmbedded">
      <router-outlet></router-outlet>
    </ngx-one-column-layout>
    <ngx-main-layout *ngIf="!isEmbedded">
      <router-outlet></router-outlet>
    </ngx-main-layout>
  `,
})
export class PagesComponent implements OnInit {
  constructor(public cdr: ChangeDetectorRef) {}

  isEmbedded: boolean;

  ngOnInit() {
    // Determine embedded mode from URL (?embedded=true) or cookie fallback
    let isEmbedded = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('embedded');
      if (p !== null) {
        isEmbedded = String(p).toLowerCase() === 'true';
        document.cookie = `isEmbedded=${isEmbedded}; path=/`;
      } else {
        const cookieVal = this.getCookie('isEmbedded');
        if (cookieVal !== '') isEmbedded = cookieVal === 'true';
      }
    } catch {
      const cookieVal = this.getCookie('isEmbedded');
      if (cookieVal !== '') isEmbedded = cookieVal === 'true';
    }

    this.isEmbedded = isEmbedded;
    this.cdr.detectChanges();
  }

   getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || '';
    return '';
  }
}
