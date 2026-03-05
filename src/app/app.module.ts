/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { NgModule, APP_INITIALIZER } from "@angular/core";
import { HttpClientModule ,HttpClient} from "@angular/common/http";
import { CoreModule } from "./@core/core.module";
import { ThemeModule } from "./@theme/theme.module";
import { AppComponent } from "./app.component";
import { AppRoutingModule } from "./app-routing.module";
import { TranslateHttpLoader } from "@ngx-translate/http-loader";
import { TranslateLoader, TranslateModule, TranslateService } from "@ngx-translate/core";
import {
  NbChatModule,
  NbDatepickerModule,
  NbDialogModule,
  NbMenuModule,
  NbSidebarModule,
  NbToastrModule,
  NbWindowModule,
} from "@nebular/theme";
import { KeycloakService } from './services/keycloak.service';
import { HTTP_INTERCEPTORS } from "@angular/common/http";
import { KeycloakInterceptor } from "./services/auth-interceptor.service";
import { LoginComponent } from "./services/login/LoginComponent";
import { AuthInterceptor } from "./services/auth-interceptor.service.spec";

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}

// Initialize translations before app bootstrap to avoid flashing keys
export function initTranslateFactory(translate: TranslateService) {
  return () => {
    const supported = ["en", "it", "es", "fi", "nl"];
    translate.addLangs(supported);
    translate.setDefaultLang("en");
    const cookieLangMatch = document?.cookie?.match(/(?:^|; )language=([^;]+)/);
    const cookieLang = (cookieLangMatch && decodeURIComponent(cookieLangMatch[1]) || '').toLowerCase();
    const initial = supported.includes(cookieLang) ? cookieLang : "en";
  return translate.use(initial).toPromise();
  };
}

/** Initialize Keycloak prima del bootstrap */
/*export function initializeKeycloak(keycloak: KeycloakService) {
  return () => keycloak.init(); // options already inside KeycloakService
}*/

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    AppRoutingModule,
    NbSidebarModule.forRoot(),
    NbMenuModule.forRoot(),
    NbDatepickerModule.forRoot(),
    NbDialogModule.forRoot(),
    NbWindowModule.forRoot(),
    NbToastrModule.forRoot(),
    NbChatModule.forRoot({
      messageGoogleMapKey: "AIzaSyA_wNuCzia92MAmdLRzmqitRGvCF7wCZPY",
    }),
    CoreModule.forRoot(),
    ThemeModule.forRoot(),
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
  bootstrap: [AppComponent, LoginComponent],
  providers: [
    /*KeycloakService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeKeycloak,
      multi: true,
      deps: [KeycloakService],
    },*/
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initTranslateFactory,
      deps: [TranslateService],
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: KeycloakInterceptor,
      multi: true,
    }
  ]
})
export class AppModule {}
