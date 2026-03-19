import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CreateLayerComponent } from "./create-layer.component";
import {
  NbCardModule,
  NbSpinnerModule,
  NbStepperModule,
  NbThemeModule,
  NbTooltipModule
} from "@nebular/theme";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

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
    FormsModule,
    ReactiveFormsModule
  ]
})
export class CreateLayerModule {}