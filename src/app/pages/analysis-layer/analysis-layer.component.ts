import { Component, OnDestroy, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from "@angular/forms";
import { ApiService } from "../../services/api.service";
import { MapService } from "../../services/map.service";
import { TranslateService } from "@ngx-translate/core";
import { ActivatedRoute, Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { Field, SelectOption, Analysis } from '../shared/layer-models';
import { getLabel, normalizeLabel, cleanFormData, getCityCoordinates } from '../shared/layer-utils';
import { Subscription } from 'rxjs';

@Component({
  selector: "ngx-analysis-layer",
  templateUrl: "./analysis-layer.component.html",
  styleUrls: ["./analysis-layer.component.scss"],
})
export class AnalysisLayerComponent implements OnInit, OnDestroy {
  loading = false;
  isSubmitting = false;
  submitMessage: string = '';

  selectedAnalysisControl = new FormControl('', Validators.required);
  analysisForms: { [key: string]: FormGroup } = {};
  analyses: Analysis[] = [];
  polygonLabelsByAnalysis: { [analysisId: string]: string[] } = {};
  allPolygonLabels: string[] = [];
  polygonFieldsByAnalysis: { [analysisId: string]: { name: string, label: any, tooltip: any }[] } = {};
  
  queryDetails = {
    id: "",
    city: "",
    layers: [],
  };

  centerCityFromApi: any = [];
  private routeSubscription?: Subscription;
  private selectedAnalysisSubscription?: Subscription;
  private selectedPolygonLabelSubscription?: Subscription;
  selectedPolygonLabel: string = '';

  constructor(
    private apiServices: ApiService,
    private formBuilder: FormBuilder,
    private translate: TranslateService,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private mapService: MapService
  ) { }

  /**
   * Normalizes labels coming from the analysis configuration file.
   * @see normalizeLabel in shared/layer-utils
   */
  normalizeLabel(label: any): any { return normalizeLabel(label); }

  /**
   * Loads the analysis definitions from `formAnalysis.json` and builds
   * one reactive form for each available analysis.
   *
   * Polygon fields are used only to feed map label options and are excluded
   * from form rendering and form controls.
   */
  loadAnalysisFromFile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<Analysis[]>('assets/formAnalysis.json').subscribe({
        next: (data) => {
          this.analysisForms = {};
          this.polygonLabelsByAnalysis = {};
          this.allPolygonLabels = [];
          this.polygonFieldsByAnalysis = {};

          this.analyses = data.map(analysis => {
            const polygonLabels: string[] = [];

            if (!this.polygonFieldsByAnalysis[analysis.id]) {
              this.polygonFieldsByAnalysis[analysis.id] = [];
            }

            analysis.fields.forEach((field: Field) => {
              if (field.type === 'polygon') {
                const polygonName = String(field.name || '').trim();
                if (polygonName && polygonLabels.indexOf(polygonName) === -1) {
                  polygonLabels.push(polygonName);
                  this.polygonFieldsByAnalysis[analysis.id].push({
                    name: polygonName,
                    label: field.label ?? field.name,
                    tooltip: field.tooltip,
                  });
                }
                return;
              }

              field.label = field.label ? this.normalizeLabel(field.label) : this.normalizeLabel(field.name);

              if (field.type === 'select' && field.options) {
                field.options = field.options.map(opt => {
                  if (typeof opt === 'string') {
                    return { value: opt, label: this.normalizeLabel(opt) };
                  }
                  return { value: opt.value, label: this.normalizeLabel(opt.label || opt.value) };
                });
              }

              if (field.type === 'group' && field.fields) {
                field.fields.forEach(subField => {
                  subField.label = subField.label ? this.normalizeLabel(subField.label) : this.normalizeLabel(subField.name);
                });
              }
            });

            this.polygonLabelsByAnalysis[analysis.id] = polygonLabels;
            this.allPolygonLabels = Array.from(new Set([...this.allPolygonLabels, ...polygonLabels]));

            analysis.fields = analysis.fields.filter((field: Field) => field.type !== 'polygon');

            return analysis;
          });

          this.analyses.forEach(analysis => {
            const controls: any = {};
            analysis.fields.forEach(field => {
              if (field.type === 'group' && field.fields) {
                const groupControls: any = {};
                field.fields.forEach(subField => {
                  groupControls[subField.name] = new FormControl('', Validators.required);
                });
                controls[field.name] = this.formBuilder.group(groupControls);
              } else if (field.type === 'select' && field.multiple) {
                controls[field.name] = new FormControl([], Validators.required);
              } else if (field.type === 'select' && !field.multiple) {
                controls[field.name] = new FormControl('', Validators.required);
              } else if (field.type === 'number') {
                controls[field.name] = new FormControl(null, Validators.required);
              }
              else {
                controls[field.name] = new FormControl('', Validators.required);
              }
            });

            this.analysisForms[analysis.id] = this.formBuilder.group(controls);
          });

          const selectedAnalysisId = this.selectedAnalysisControl.value;
          const labelsForMap = selectedAnalysisId
            ? (this.polygonLabelsByAnalysis[selectedAnalysisId] || [])
            : [];
          this.mapService.setAvailableLabels(labelsForMap);
          resolve();
        },
        error: (err) => {
          console.error(err);
          reject(err);
        }
      });
    });
  }

  get selectedAnalysis(): Analysis | undefined {
    const selectedName = this.selectedAnalysisControl.value;
    return this.analyses.find(a => a.id === selectedName);
  }

  /** Returns the polygon fields (with label and tooltip) for the currently selected analysis. */
  get currentPolygonFields(): { name: string, label: any, tooltip: any }[] {
    const selectedId = this.selectedAnalysisControl.value;
    const selectedLabel = String(this.selectedPolygonLabel || '').trim();

    if (!selectedId || !this.polygonFieldsByAnalysis[selectedId] || !selectedLabel) {
      return [];
    }

    return this.polygonFieldsByAnalysis[selectedId].filter((field) => {
      const fieldName = String(field.name || '').trim();
      return fieldName === selectedLabel && !!field.tooltip;
    });
  }

  /** Whether selected analysis has polygon fields configured. */
  get hasPolygonFieldsForSelectedAnalysis(): boolean {
    const selectedId = this.selectedAnalysisControl.value;
    return !!selectedId && !!this.polygonFieldsByAnalysis[selectedId] && this.polygonFieldsByAnalysis[selectedId].length > 0;
  }

  isStepValid(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) return false;

    if (!this.hasUnlabeledPolygonForAnalysis()) {
      return false;
    }

    if (this.isPolygonRequiredForAnalysis(selectedName) && !this.hasLabeledPolygonForAnalysis()) {
      return false;
    }

    const form = this.analysisForms[selectedName];
    return form?.valid ?? false;
  }

  private isPolygonRequiredForAnalysis(analysisId: string): boolean {
    return !!analysisId && (this.polygonLabelsByAnalysis[analysisId] || []).length > 0;
  }

  private getLabeledPolygonsForAnalysis(analysisId: string): { label: string; coordinates: [number, number][] }[] {
    const allowedLabels = new Set((this.polygonLabelsByAnalysis[analysisId] || []).map(label => String(label || '').trim()));
    return this.mapService.extractLabeledPolygonsForAnalysis().filter(item => allowedLabels.has(String(item.label || '').trim()));
  }

  private hasLabeledPolygonForAnalysis(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) {
      return false;
    }

    if (!this.isPolygonRequiredForAnalysis(selectedName)) {
      return true;
    }

    return this.getLabeledPolygonsForAnalysis(selectedName).length > 0;
  }

  private getUnlabeledPolygonsForAnalysis(): [number, number][][] {
    return this.mapService.extractUnlabeledPolygonsForAnalysis();
  }

  private hasUnlabeledPolygonForAnalysis(): boolean {
    return this.getUnlabeledPolygonsForAnalysis().length > 0;
  }

  private buildPolygonFields(labeledPolygons: { label: string; coordinates: [number, number][] }[]): any {
    return labeledPolygons.reduce((acc: any, item: { label: string; coordinates: [number, number][] }) => {
      const baseLabel = (item.label || '').trim();
      if (!baseLabel) {
        return acc;
      }

      let fieldName = baseLabel;
      let duplicateIndex = 2;
      while (Object.prototype.hasOwnProperty.call(acc, fieldName)) {
        fieldName = `${baseLabel}_${duplicateIndex}`;
        duplicateIndex++;
      }

      acc[fieldName] = item.coordinates;
      return acc;
    }, {});
  }

  private buildPayload(
    analysis: Analysis,
    formData: any,
    labeledPolygons: { label: string; coordinates: [number, number][] }[],
    unlabeledPolygons: [number, number][][]
  ): any {
    const polygonFields = this.buildPolygonFields(labeledPolygons);
    const singlePolygon = unlabeledPolygons.length > 0 ? unlabeledPolygons[0] : null;

    return {
      ...(singlePolygon ? { polygon: singlePolygon } : {}),
      mode: analysis.mode,
      ...cleanFormData(formData),
      ...polygonFields
    };
  }

  /** @see getLabel in shared/layer-utils */
  getLabel(value: any): string { return getLabel(value, this.translate); }

  /**
   * Updates the array value of a multi-select field when a checkbox is toggled.
   */
  onMultiSelectChange(analysisName: string, fieldName: string, value: string, checked: boolean) {
    const control = this.analysisForms[analysisName].get(fieldName);
    const current: string[] = control.value || [];

    if (checked) {
      control.setValue([...current, value]);
    } else {
      control.setValue(current.filter(v => v !== value));
    }
  }

  /**
   * Builds and submits the analysis payload.
   *
   * The payload contains:
    * - `polygon`: the coordinates of the first unlabeled polygon
   * - all cleaned form fields
   * - one extra field per labeled polygon, using its label as key
   */
  async submitAnalysis() {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) {
      alert("Please select an analysis!");
      return;
    }

    const labeledPolygons = this.getLabeledPolygonsForAnalysis(selectedName);
    const unlabeledPolygons = this.getUnlabeledPolygonsForAnalysis();

    if (unlabeledPolygons.length === 0) {
      alert("This analysis requires one unlabeled polygon.");
      return;
    }

    if (this.isPolygonRequiredForAnalysis(selectedName) && labeledPolygons.length === 0) {
      alert("This analysis requires at least one labeled polygon.");
      return;
    }

    const analysis = this.analyses.find(a => a.id === selectedName);
    if (!analysis) return;

    const formData = this.analysisForms[selectedName].value;

    const payload = this.buildPayload(analysis, formData, labeledPolygons, unlabeledPolygons);

    this.isSubmitting = true;
    this.submitMessage = '';

    try {
      const result: any = await this.apiServices.submitAnalysis(
        analysis.url || 'http://localhost:9090/analyze_polygon',
        payload
      );

      this.submitMessage = `Analysis ${selectedName} submitted successfully!`;
    } catch (err: any) {
      this.submitMessage = `Error submitting ${selectedName}: ${err.message}`;
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Initializes the editable map and loads the stored project layers.
   */
  private initMap(loadStoredLayers: boolean = true): void {
    const selectedAnalysisId = this.selectedAnalysisControl.value;
    const labelsForMap = selectedAnalysisId
      ? (this.polygonLabelsByAnalysis[selectedAnalysisId] || [])
      : [];

    this.mapService.initializeMap("map", this.centerCityFromApi, 12, undefined, {
      enableInMapLabelEditor: true,
      showLabelTooltips: true,
      availableLabels: labelsForMap,
    });

    if (loadStoredLayers && this.apiServices.storedLayers.length > 0) {
      this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
        addToEditableLayers: true,
        addToMap: false,
        enableLabelEditing: false,
      });

      this.mapService.fitBounds();
    }

    this.apiServices.storedLayers = [];
  }

  private async initializeFromSelectedCity(city: string): Promise<void> {
    this.queryDetails.id = '';
    this.queryDetails.city = city;
    this.centerCityFromApi = getCityCoordinates(city);
    this.apiServices.storedLayers = [];

    await this.loadAnalysisFromFile();
    setTimeout(() => this.initMap(false), 100);
  }

  private async initializeFromStoredProject(projectId: string): Promise<void> {
    this.apiServices.storedLayers = [];

    const data: any = await this.apiServices.getDocument([projectId]);
    this.queryDetails.id = data.id;
    this.queryDetails.city = data.city;

    this.centerCityFromApi = getCityCoordinates(data.city);

    if (data.layers && data.layers.length > 0) {
      data.layers.forEach((layer: string) => {
        this.apiServices.storedLayers.push(JSON.parse(layer));
      });
    }

    await this.loadAnalysisFromFile();
    setTimeout(() => this.initMap(true), 100);
  }

  private async initializePage(cityFromQuery: string | null): Promise<void> {
    this.loading = true;
    this.submitMessage = '';

    try {
      if (cityFromQuery) {
        await this.initializeFromSelectedCity(cityFromQuery);
        this.loading = false;
        return;
      }

      const projectId = localStorage.getItem("projectId");
      if (!projectId) {
        console.error("No project ID found");
        this.loading = false;
        this.router.navigate(["/pages/available-options"]);
        return;
      }

      await this.initializeFromStoredProject(projectId);
      this.loading = false;
    } catch (error) {
      console.error("Failed to load project:", error);
      this.loading = false;
      this.router.navigate(["/pages/available-options"]);
    }
  }

  /**
   * Loads the current project, configures the map center from the city,
   * restores saved layers and finally loads the available analyses.
   */
  async ngOnInit() {
    this.selectedAnalysisSubscription = this.selectedAnalysisControl.valueChanges.subscribe((selectedAnalysisId: string) => {
      this.selectedPolygonLabel = '';
      const labelsForMap = selectedAnalysisId
        ? (this.polygonLabelsByAnalysis[selectedAnalysisId] || [])
        : [];
      this.mapService.setAvailableLabels(labelsForMap);
    });

    this.selectedPolygonLabelSubscription = this.mapService.selectedPolygonLabel$.subscribe((selectedLabel: string) => {
      this.selectedPolygonLabel = String(selectedLabel || '').trim();
    });

    this.routeSubscription = this.route.queryParamMap.subscribe(params => {
      this.initializePage(params.get('city'));
    });
  }

  ngOnDestroy(): void {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }
    if (this.selectedAnalysisSubscription) {
      this.selectedAnalysisSubscription.unsubscribe();
    }
    if (this.selectedPolygonLabelSubscription) {
      this.selectedPolygonLabelSubscription.unsubscribe();
    }
  }
}
