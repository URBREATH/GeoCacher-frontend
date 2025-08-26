/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { Component, OnInit } from "@angular/core";
import { AnalyticsService } from "./@core/utils/analytics.service";
import { SeoService } from "./@core/utils/seo.service";
import { TranslateService, LangChangeEvent } from "@ngx-translate/core";
import { take } from "rxjs/operators";

@Component({
  selector: "ngx-app",
  template: "<router-outlet></router-outlet>",
})
export class AppComponent implements OnInit {
  languageInitial: string = "";
  constructor(
    private analytics: AnalyticsService,
    private seoService: SeoService,
    private translate: TranslateService
  ) {
    this.getCookie("language") !== ""
      ? (this.languageInitial = this.getCookie("language"))
      : (this.languageInitial = "en");
    window.addEventListener(
      "message",
      (event) => {
        //this.receiveMessage();

        if (event.data.hasOwnProperty("language")) {
          document.cookie = `language=${event.data.language}`;

          if (this.languageInitial !== this.getCookie("language")) {
            console.log(this.languageInitial);
            const language = this.getCookie("language") || "en";
            this.translate.use(language);
            this.translate.onLangChange.subscribe((event: LangChangeEvent) => {
              const langToUse = this.getCookie("language") || "en";
              this.translate.use(langToUse);
            });
          }
        }
      },
      false
    );
  }

  ngOnInit(): void {
    this.analytics.trackPageViews();
    this.seoService.trackCanonicalChanges();
    this.translate.use(
      this.getCookie("language") !== ""
        ? this.getCookie("language")
        : this.languageInitial
    );
  }

  getCookie(cname: string) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let cookiesArray = decodedCookie.split(";");
    for (let c of cookiesArray) {
      while (c.charAt(0) == " ") {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
  }
}
