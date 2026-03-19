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
  private readonly supportedLangs = ["en", "it", "es", "fi", "nl"];
  constructor(
    private analytics: AnalyticsService,
    private seoService: SeoService,
    private translate: TranslateService
  ) {
    // Initialize language from cookie or default
    this.getCookie("language") !== ""
      ? (this.languageInitial = this.getCookie("language"))
      : (this.languageInitial = "en");

    // Declare supported languages and set default ASAP for initial render
    this.translate.addLangs(this.supportedLangs);
    this.translate.setDefaultLang("en");
    const initialLang = this.normalizeLang(
      this.getCookie("language") || this.languageInitial
    );
    this.translate.use(initialLang);

    // Read embedded flag from URL on load and persist to cookie
    try {
      const params = new URLSearchParams(window.location.search);
      const embeddedParam = params.get("embedded");
      if (embeddedParam !== null) {
        const isEmbedded = String(embeddedParam).toLowerCase() === "true";
        document.cookie = `isEmbedded=${isEmbedded}; path=/`;
      }
    } catch {}

  // Listen for SSO postMessage payloads: { embedded, sideMenu, serviceToken, refreshToken, language }
    window.addEventListener(
      "message",
      (event) => {
        const data: any = event?.data || {};

        // Language sync (supports both SSO payload and LANGUAGE_CHANGE messages)
        if (data && data.language) {
      const lang = this.normalizeLang(data.language);
      document.cookie = `language=${lang}; path=/`;
      this.translate.use(lang);
        }

        // Embedded flag and side menu state
        if (data && typeof data.embedded === "boolean") {
          document.cookie = `isEmbedded=${data.embedded}; path=/`;
        }
        if (data && typeof data.sideMenu === "string") {
          localStorage.setItem("sideMenuState", data.sideMenu);
        }

        // Tokens handling
        if (data && data.serviceToken) {
          const bearer = data.serviceToken.startsWith("Bearer ")
            ? data.serviceToken
            : `Bearer ${data.serviceToken}`;
          localStorage.setItem("token", bearer);
          try {
            const claims = this.decodeJwt(data.serviceToken);
            localStorage.setItem("tokenClaims", JSON.stringify(claims));
          } catch (e) {
            // ignore decode errors in dev
            // console.warn('JWT decode error', e);
          }
        }
        if (data && data.refreshToken) {
          localStorage.setItem("refreshToken", data.refreshToken);
        }
      },
      false
    );
  }

  ngOnInit(): void {
    this.analytics.trackPageViews();
    this.seoService.trackCanonicalChanges();
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

  private normalizeLang(lang?: string): string {
    const v = (lang || "en").toLowerCase();
    return this.supportedLangs.includes(v) ? v : "en";
  }

  private decodeJwt(token: string): any {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("Invalid JWT");
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
    return JSON.parse(jsonPayload);
  }
}
