import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import {
  NbCardModule,
  NbCheckboxModule,
  NbMenuModule,
  NbRadioModule,
  NbSelectModule,
  NbStepperModule,
  NbLayoutModule,
  NbSidebarModule,
  NbIconModule,
  NbButton,
  NbButtonModule,
  NbTooltipModule,
} from "@nebular/theme";
import { TranslateModule } from "@ngx-translate/core";
import { HttpClientModule } from "@angular/common/http";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import { ThemeModule } from "../@theme/theme.module";
import { PagesComponent } from "./pages.component";
import { PagesRoutingModule } from "./pages-routing.module";
import { MiscellaneousModule } from "./miscellaneous/miscellaneous.module";
import { HomeModule } from "./home/home.component.module";
import { AvailableOptionsComponent } from "./available-options/available-options.component";
import { ViewLayerComponent } from "./view-layer/view-layer.component";
import { EditLayerComponent } from "./edit-layer/edit-layer.component";
import { AnalysisLayerComponent } from "./analysis-layer/analysis-layer.component";
import { AuthService } from "../services/auth-service.service";
import { HTTP_INTERCEPTORS } from "@angular/common/http";
import { DialogComponent } from './dialog/dialog.component';
import { MainLayoutComponent } from '../@theme/layouts/main-layout/main-layout.component';
import { RouterModule } from "@angular/router";
import { CommonModule } from "@angular/common";

// Translation loader is configured in AppModule; here we only import TranslateModule

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    NbLayoutModule,
    NbSidebarModule.forRoot(), // Important for sidebar to work
    NbCardModule,
    NbCheckboxModule,
    NbIconModule,
    NbRadioModule,
    NbTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    NbStepperModule,
    PagesRoutingModule,
    ThemeModule,
    NbMenuModule,
    MiscellaneousModule,
    HomeModule,
    NbSelectModule,
    NbButtonModule,
    HttpClientModule,
    TranslateModule,
  ],
  declarations: [
    PagesComponent,
    AvailableOptionsComponent,
    ViewLayerComponent,
    EditLayerComponent,
    AnalysisLayerComponent,
    DialogComponent,
    MainLayoutComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PagesModule { }
