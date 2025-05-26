import { Component } from "@angular/core";

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
export class PagesComponent {
  constructor() {
    // Constructor logic can be added here if needed
  }
  // You can add any additional methods or properties here if needed
  isStandAlone: boolean = true;
}
