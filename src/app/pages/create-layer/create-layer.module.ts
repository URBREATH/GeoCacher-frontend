import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CreateLayerComponent } from "./create-layer.component";
import {
  NbCardModule,
  NbSpinnerModule,
  NbStepperModule,
  NbThemeModule,
  NbTooltipModule,
  NbRadioModule
} from "@nebular/theme";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";

@NgModule({
  declarations: [
    CreateLayerComponent
  ],
  imports: [
    CommonModule,
    NbSpinnerModule,
    NbStepperModule,
    NbCardModule,
    NbThemeModule,
    NbTooltipModule,
    NbRadioModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule
  ]
})
export class CreateLayerModule {}