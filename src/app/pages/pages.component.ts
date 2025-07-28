import { ChangeDetectorRef, Component, OnInit } from "@angular/core";

@Component({
  selector: "ngx-pages",
  styleUrls: ["pages.component.scss"],
  template: `
    <ngx-one-column-layout *ngIf="!isStandAlone">
      <router-outlet></router-outlet>
    </ngx-one-column-layout>
    <ngx-main-layout *ngIf="isStandAlone">
      <router-outlet></router-outlet>
    </ngx-main-layout>
  `,
})
export class PagesComponent implements OnInit {
  constructor(public cdr: ChangeDetectorRef) {}

  isStandAlone: boolean;

  ngOnInit() {

    this.isStandAlone = false; // Default value

    //set isStandAlone to false in the cookies
    // document.cookie = 'isStandAlone=false;'; // Set the cookie to false by default

    // //get the value of the variable isStandAlone from the cookies
    // const isStandAloneCookie = this.getCookie('isStandAlone');
    // this.isStandAlone = isStandAloneCookie === 'true'; // Convert the cookie value to boolean

    this.cdr.detectChanges();
  }

   getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || '';
    return '';
  }
}
