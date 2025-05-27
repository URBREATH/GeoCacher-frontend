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

  isStandAlone: boolean = true;

  ngOnInit() {
    this.cdr.detectChanges();
  }
}
