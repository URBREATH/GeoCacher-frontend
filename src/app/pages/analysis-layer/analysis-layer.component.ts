import { Component, OnDestroy, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from "@angular/forms";
import { ApiService } from "../../services/api.service";
import { MapService } from "../../services/map.service";
import { AuthService } from "../../services/auth-service.service";
import { TranslateService } from "@ngx-translate/core";
import { ActivatedRoute, Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { Field, SelectOption, Analysis } from '../../shared/layer-models';
import { getLabel, normalizeLabel, getCityCoordinates } from '../../shared/layer-utils';
import { Subscription } from 'rxjs';
import { HttpHeaders } from '@angular/common/http';
import { NbToastrService } from '@nebular/theme';
import { AnalysisAvailabilityService } from '../../services/analysis-availability.service';

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
  processes: any[] = [];
  polygonLabelsByAnalysis: { [analysisId: string]: string[] } = {};
  allPolygonLabels: string[] = [];
  polygonFieldsByAnalysis: { [analysisId: string]: { name: string, label: any, tooltip: any }[] } = {};
  polygonArrayFieldsByAnalysis: { [analysisId: string]: string[] } = {};
  hasStudyAreaField: { [analysisId: string]: boolean } = {};
  hasPolygonField: { [analysisId: string]: boolean } = {};
  hasBoundingBoxField: { [analysisId: string]: boolean } = {};
  hasCanopyInputField: { [analysisId: string]: boolean } = {};
  hasCityField: { [analysisId: string]: boolean } = {};
  supportedCitiesByAnalysis: { [analysisId: string]: string[] } = {};
  measureLabels: string[] = [];
  measures: { [web_name: string]: number } = {};
  
  queryDetails = {
    id: "",
    city: "",
    layers: [],
  };

  centerCityFromApi: any = [];
  showCitySelector: boolean = false;
  availableCities: string[] = [];
  selectedCityControl = new FormControl('', Validators.required);
  private routeSubscription?: Subscription;
  private selectedAnalysisSubscription?: Subscription;
  private selectedPolygonLabelSubscription?: Subscription;
  selectedPolygonLabel: string = '';
  private isMapInitialized: boolean = false;
  private shouldLoadStoredLayersOnMapInit: boolean = false;
  private projectLayers: any[] = [];
  private isFromProject: boolean = false;

  constructor(
    private apiServices: ApiService,
    private formBuilder: FormBuilder,
    private translate: TranslateService,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private mapService: MapService,
    private authService: AuthService,
    private toastr: NbToastrService,
    private analysisAvailabilityService: AnalysisAvailabilityService
  ) {
    this.availableCities = this.analysisAvailabilityService.getAvailableAnalysisCities().slice().sort((a, b) => a.localeCompare(b));
  }

  /**
   * Normalizes labels coming from the analysis configuration file.
   * @see normalizeLabel in shared/layer-utils
   */
  normalizeLabel(label: any): any { return normalizeLabel(label); }

  /** Fetches processes from the proxy manager endpoint. */
  private async fetchProcessesFromProxy(): Promise<any[]> {
    try {
      await this.authService.refreshAccessToken();
    } catch (e) {
      console.error('Failed to refresh token:', e);
    }

    return new Promise((resolve) => {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${this.authService.getToken()}`
      });
      this.http.get<any>('https://proxy-manager-dev.urbreath.tech/ogcapi/processes', { headers }).subscribe({
        next: (data) => {
          const processes = Array.isArray(data?.processes) ? data.processes : [];
          resolve(processes);
        },
        error: (err: any) => {
          console.error('Error fetching processes from proxy:', err?.error?.message || err.message);
          resolve([]);
        }
      });
    });
  }

  /** Loads processes from proxy endpoint. */
  private loadProcesses(): Promise<void> {
    return this.fetchProcessesFromProxy()
      .then((processes) => {
        this.processes = processes;
      });
  }

  /** Loads measure labels from local JSON asset. */
  private loadMeasureLabels(): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<any>('assets/measures.json').subscribe({
        next: (data) => {
          this.measures = {};
          this.measureLabels = (data?.list_measures || [])
            .map((measure: any) => {
              if (measure.web_name && measure.id) {
                this.measures[measure.web_name] = measure.id;
              }
              return measure.web_name;
            })
            .filter((name: any) => !!name);
          resolve();
        },
        error: (err: any) => {
          console.error('Error loading measures:', err);
          this.measureLabels = [];
          this.measures = {};
          resolve();
        }
      });
    });
  }


  /** Fetches analysis definition from proxy manager by id. */
  private async fetchAnalysisFromProxy(id: string): Promise<any> {
    try {
      await this.authService.refreshAccessToken();
    } catch (e) {
      console.error('Failed to refresh token:', e);
    }

    return new Promise((resolve) => {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${this.authService.getToken()}`
      });
      this.http.get<any>(`https://proxy-manager-dev.urbreath.tech/ogcapi/processes/${id}`, { headers }).subscribe({
        next: (data) => {
          resolve(data);
        },
        error: (err) => {
          console.error(`Error fetching analysis ${id} from proxy:`, err);
          resolve(null);
        }
      });
    });
  }

  /** Converts raw analysis data into Analysis[] based on its format. */
  private parseAnalysisData(data: any): Analysis[] {
    if (Array.isArray(data)) {
      return data;
    } else if (data?.processes && Array.isArray(data.processes)) {
      return this.convertSchemaToAnalysis(data);
    } else if (data?.id && data?.inputs) {
      return [this.convertOGCProcessToAnalysis(data)];
    } else {
      return this.convertSchemaToAnalysis(data);
    }
  }

  /**
   * Loads analysis definitions from proxy endpoint.
   * Supports:
   * - OGC process object with `inputs`
   * - Schema format with `processes` array
   * - Direct array of Analysis objects
   */
  loadAnalysisFromSchema(id: string): Promise<void> {
    return this.fetchAnalysisFromProxy(id)
      .then((data) => {
        if (!data) {
          this.initializeAnalyses([]);
          return;
        }
        const analyses = this.parseAnalysisData(data);
        this.initializeAnalyses(analyses);
      });
  }

  /** Initializes component state from loaded analyses and builds reactive forms. */
  private initializeAnalyses(data: Analysis[]): void {
    this.analysisForms = {};
    this.polygonLabelsByAnalysis = {};
    this.allPolygonLabels = [];
    this.polygonFieldsByAnalysis = {};
    this.polygonArrayFieldsByAnalysis = {};
    this.hasStudyAreaField = {};
    this.hasPolygonField = {};
    this.hasBoundingBoxField = {};
    this.hasCanopyInputField = {};
    this.hasCityField = {};
    this.supportedCitiesByAnalysis = {};

    this.analyses = data.map(analysis => {
      const polygonLabels: string[] = [];

      if (!this.polygonFieldsByAnalysis[analysis.id]) {
        this.polygonFieldsByAnalysis[analysis.id] = [];
      }

      analysis.fields.forEach((field: Field) => {
        if (field.type === 'polygon') {
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

      // Track polygon array fields
      this.polygonArrayFieldsByAnalysis[analysis.id] = analysis.polygonArrayFields || [];

      // Track which special fields exist before filtering
      this.hasStudyAreaField[analysis.id] = analysis.fields.some(f => f.name === 'study_area');
      this.hasPolygonField[analysis.id] = analysis.fields.some(f => f.name === 'polygon');
      this.hasBoundingBoxField[analysis.id] = analysis.fields.some(f => f.name === 'bounding_box');
      this.hasCanopyInputField[analysis.id] = analysis.fields.some(f => f.name === 'canopy_input');
      this.hasCityField[analysis.id] = analysis.fields.some(f => f.name === 'city') || !!(analysis.fixedValues?.['city']);
      this.supportedCitiesByAnalysis[analysis.id] = analysis.supportedCities || [];

      // Filter out polygon, study_area, bounding_box, canopy_input, city, measures, and other automatic fields
      const polygonArrayFieldNames = analysis.polygonArrayFields || [];
      analysis.fields = analysis.fields.filter((field: Field) =>
        field.type !== 'polygon' &&
        field.name !== 'polygon' &&
        field.name !== 'study_area' &&
        field.name !== 'bounding_box' &&
        field.name !== 'canopy_input' &&
        field.name !== 'city' &&
        !polygonArrayFieldNames.includes(field.name)
      );

      return analysis;
    });

    this.analyses.forEach(analysis => {
      const controls: any = {};
      analysis.fields.forEach(field => {
        const isRequired = field.minOccurs !== 0 && field.minOccurs !== undefined;

        if (field.type === 'group' && field.fields) {
          const groupControls: any = {};
          field.fields.forEach(subField => {
            const isSubRequired = subField.minOccurs !== 0 && subField.minOccurs !== undefined;
            const validators = [];
            let defaultValue: any = null;
            if (isSubRequired) validators.push(Validators.required);
            if (subField.type === 'number') {
              if (subField.min !== undefined) {
                validators.push(Validators.min(subField.min));
                if (subField.min === 0) defaultValue = null;
              }
              if (subField.max !== undefined) validators.push(Validators.max(subField.max));
            } else {
              defaultValue = '';
            }
            groupControls[subField.name] = new FormControl(defaultValue, validators);
          });
          controls[field.name] = this.formBuilder.group(groupControls);
        } else if (field.type === 'percentage' && field.options) {
          const percentageControls: any = {};
          field.options.forEach((opt: any) => {
            percentageControls[opt.value] = new FormControl(0);
          });
          controls[field.name] = this.formBuilder.group(percentageControls);
        } else if (field.type === 'select' && field.multiple) {
          const validators = isRequired ? [Validators.required] : [];
          controls[field.name] = new FormControl([], validators);
        } else if (field.type === 'select' && !field.multiple) {
          const validators = isRequired ? [Validators.required] : [];
          controls[field.name] = new FormControl('', validators);
        } else if (field.type === 'number') {
          const validators = [];
          if (isRequired) validators.push(Validators.required);
          let defaultValue: any = null;
          if (field.min !== undefined) {
            validators.push(Validators.min(field.min));
            if (field.min === 0) defaultValue = 0;
          }
          if (field.max !== undefined) validators.push(Validators.max(field.max));
          controls[field.name] = new FormControl(defaultValue, validators);
        }
        else {
          const validators = isRequired ? [Validators.required] : [];
          controls[field.name] = new FormControl('', validators);
        }
      });

      this.analysisForms[analysis.id] = this.formBuilder.group(controls);
    });

    const selectedAnalysisId = this.selectedAnalysisControl.value;
    const labelsForMap = selectedAnalysisId
      ? (this.polygonLabelsByAnalysis[selectedAnalysisId] || [])
      : [];
    this.mapService.setAvailableLabels(labelsForMap);
  }

  /** Converts schema content into `Analysis[]` using `processes[].additionalParameters`. */
  private convertSchemaToAnalysis(schema: any): Analysis[] {
    const processes: any[] = Array.isArray(schema?.processes) ? schema.processes : [];
    return processes
      .map((process: any) => this.convertProcessToAnalysis(process))
      .filter((analysis: Analysis) => !!analysis.id);
  }

  /** Converts a process entry (`processes[]`) into an `Analysis` object. */
  private convertProcessToAnalysis(process: any): Analysis {
    const params = process?.additionalParameters || {};

    return {
      id: String(process?.id ?? params?.id ?? ''),
      name: params?.name ?? process?.title ?? '',
      url: params?.url ?? '',
      mode: (params?.mode ?? 'preset') as 'preset' | 'custom',
      fields: this.normalizeRawFields(params?.fields),
    };
  }

  /** Converts an OGC process object (with `inputs` property) into an `Analysis` object. */
  private convertOGCProcessToAnalysis(process: any): Analysis {
    const inputs = process?.inputs || {};
    const fields: Field[] = [];
    const fixedValues: { [key: string]: any } = {};
    const polygonArrayFields: string[] = [];
    let supportedCities: string[] = [];


    Object.keys(inputs).forEach(key => {
      const input = inputs[key];
      const schema = input?.schema || {};

      const isGeoJsonGeometry = schema.format === 'geojson-geometry' ||
        (Array.isArray(schema.allOf) && schema.allOf.some((item: any) => item.format === 'geojson-geometry'));

      // polygon: { type: "object", properties: { type: { const: "Polygon" }, coordinates: ... } }
      const isPolygonGeometry = schema.type === 'object' &&
        schema.properties?.type?.const === 'Polygon' &&
        schema.properties?.coordinates;

      // study_area: { type: "object", properties: { type: { const: "Feature" }, geometry: ..., properties: ... } }
      const isGeoJsonFeature = schema.type === 'object' &&
        schema.properties?.type?.const === 'Feature' &&
        schema.properties?.geometry;

      // bounding_box / canopy_input: FeatureCollection
      const isFeatureCollection = schema.type === 'object' &&
        schema.properties?.type?.const === 'FeatureCollection' &&
        schema.properties?.features;

      const isPolygonField = isGeoJsonGeometry || isPolygonGeometry || isGeoJsonFeature || isFeatureCollection;

      if (isPolygonField) {
        fields.push({
          name: key,
          label: input?.title ?? key,
          type: 'polygon',
          tooltip: input?.description,
          minOccurs: input?.minOccurs,
        });
        return;
      }

      const enumValues = schema?.enum || schema?.items?.enum || [];
      if (enumValues.length === 1) {
        fixedValues[key] = enumValues[0];
        return;
      }
      // city with a fixed enum is a process constraint, not user-selectable — treat as fixed
      if (key === 'city' && enumValues.length > 0) {
        fixedValues[key] = enumValues[0];
        supportedCities = enumValues;
        return;
      }

      const minOccurs = input?.minOccurs;

      // Check if this is an array of GeoJSON Features (polygon array field)
      if (schema.type === 'array' && schema.items?.type === 'object') {
        const itemProps = schema.items?.properties || {};
        const isGeoJsonFeatureArray =
          schema.items?.required?.includes('type') &&
          schema.items?.required?.includes('geometry') &&
          itemProps.type?.const === 'Feature' &&
          itemProps.geometry?.properties?.type?.const === 'Polygon';

        if (isGeoJsonFeatureArray) {
          polygonArrayFields.push(key);
          return;
        }
      }

      if (schema.type === 'object' && schema.properties) {
        const allPropsAreNumbers = Object.values(schema.properties).every(
          (prop: any) => prop.type === 'number' || prop.type === 'integer'
        );
        const allPropsHaveMinMax = Object.values(schema.properties).every(
          (prop: any) => (prop.minimum !== undefined || prop.maximum !== undefined)
        );

        if (allPropsAreNumbers && allPropsHaveMinMax) {
          const options = Object.keys(schema.properties).map(propKey => ({
            value: propKey,
            label: propKey
          }));

          fields.push({
            name: key,
            label: input?.title ?? key,
            type: 'percentage',
            tooltip: input?.description,
            options,
            minOccurs: input?.minOccurs,
          });
          return;
        }

        const requiredSubFields: string[] = Array.isArray(schema.required) ? schema.required : [];
        const subFields: Field[] = [];
        Object.keys(schema.properties).forEach(propKey => {
          const prop = schema.properties[propKey];
          const subField: Field = {
            name: propKey,
            label: prop?.title ?? propKey,
            type: this.getFieldTypeFromOGCSchema(prop),
            tooltip: prop?.description,
            minOccurs: requiredSubFields.includes(propKey) ? 1 : 0,
          };

          if (prop.type === 'number' || prop.type === 'integer') {
            if (prop.minimum !== undefined) subField.min = prop.minimum;
            if (prop.maximum !== undefined) subField.max = prop.maximum;
            if (prop.format) subField.format = prop.format;
            else if (prop.type === 'integer') subField.format = 'integer';
          }

          subFields.push(subField);
        });

        fields.push({
          name: key,
          label: input?.title ?? key,
          type: 'group',
          tooltip: input?.description,
          fields: subFields,
          minOccurs,
        });
        return;
      }

      let field: Field = {
        name: key,
        label: input?.title ?? key,
        type: this.getFieldTypeFromOGCSchema(schema),
        tooltip: input?.description,
        minOccurs,
      };

      if (schema.type === 'number' || schema.type === 'integer') {
        if (schema.minimum !== undefined) field.min = schema.minimum;
        if (schema.maximum !== undefined) field.max = schema.maximum;
        if (schema.format) field.format = schema.format;
        else if (schema.type === 'integer') field.format = 'integer';
      }

      if (schema.type === 'percentage' && enumValues.length > 0) {
        field.options = enumValues.map((value: string) => ({
          value,
          label: value
        }));
        field.type = 'percentage';
      } else if (enumValues.length > 0) {
        field.options = enumValues.map((value: string) => ({
          value,
          label: value
        }));
        field.type = 'select';

        if (schema.type === 'array' || input?.maxOccurs > 1) {
          field.multiple = true;
        }
      }

      field.minOccurs = minOccurs;
      fields.push(field);
    });


    return {
      id: String(process?.id ?? ''),
      name: process?.title ?? '',
      url: process?.url ?? '',
      mode: 'preset',
      fields,
      ...(Object.keys(fixedValues).length > 0 ? { fixedValues } : {}),
      ...(polygonArrayFields.length > 0 ? { polygonArrayFields } : {}),
      ...(supportedCities.length > 0 ? { supportedCities } : {}),
    };
  }

  /** Determines field type from OGC schema. */
  private getFieldTypeFromOGCSchema(schema: any): string {
    if (!schema) return 'text';
    if (schema.type === 'percentage') return 'percentage';
    if (schema.type === 'string') return 'text';
    if (schema.type === 'number' || schema.type === 'integer') return 'number';
    if (schema.type === 'array') return 'select';
    return 'text';
  }

  /** Normalizes raw field objects from `additionalParameters.fields`. */
  private normalizeRawFields(rawFields: any): Field[] {
    const fields: any[] = Array.isArray(rawFields) ? rawFields : [];

    return fields.map((rawField: any) => {
      const normalizedField: any = {
        label: rawField?.label ?? rawField?.name ?? '',
        name: String(rawField?.name ?? ''),
        type: String(rawField?.type ?? ''),
      };

      if (Object.prototype.hasOwnProperty.call(rawField || {}, 'multiple')) {
        normalizedField.multiple = !!rawField.multiple;
      }

      if (Object.prototype.hasOwnProperty.call(rawField || {}, 'tooltip')) {
        normalizedField.tooltip = rawField.tooltip;
      }

      if (Array.isArray(rawField?.options)) {
        normalizedField.options = this.normalizeRawOptions(rawField.options);
      }

      if (Array.isArray(rawField?.fields)) {
        normalizedField.fields = this.normalizeRawFields(rawField.fields);
      }

      return normalizedField as Field;
    });
  }

  /** Normalizes select options from raw format into `SelectOption[]`. */
  private normalizeRawOptions(rawOptions: any[]): SelectOption[] {
    return rawOptions
      .map((option: any) => {
        if (typeof option === 'string') {
          return { value: option, label: option } as unknown as SelectOption;
        }

        const value = String(option?.value ?? '');
        return {
          value,
          label: option?.label ?? value,
        } as unknown as SelectOption;
      })
      .filter((option: SelectOption) => String((option as any)?.value ?? '').trim().length > 0);
  }

  /** Returns true if the selected analysis does not support the current city. */
  get isCityUnsupported(): boolean {
    const selectedId = this.selectedAnalysisControl.value;
    if (!selectedId) return false;
    const supported = this.supportedCitiesByAnalysis[selectedId];
    if (!supported || supported.length === 0) return false;
    return !supported.includes(this.queryDetails.city);
  }

  /** Returns the analysis currently selected in the dropdown. */
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

  /** Whether drawing tools should be displayed (polygon array fields like measures or canopy_input exist). */
  get shouldShowDrawingTools(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) return false;

    const analysis = this.selectedAnalysis;
    if (!analysis) return false;

    const hasPolygonArrayFields = (analysis.polygonArrayFields || []).length > 0;
    const hasCanopyInput = this.hasCanopyInputField[selectedName] || false;
    return hasPolygonArrayFields || hasCanopyInput;
  }

  /** Validates that percentage fields sum to 100. */
  private arePercentagesValid(analysisId: string): boolean {
    const form = this.analysisForms[analysisId];
    const analysis = this.analyses.find(a => a.id === analysisId);

    if (!form || !analysis) {
      return true;
    }

    for (const field of analysis.fields) {
      if (field.type === 'percentage') {
        const groupControl = form.get(field.name);
        if (groupControl) {
          const groupValue = groupControl.value;
          const sum = Object.values(groupValue || {}).reduce((acc: number, val: any) => {
            const numVal = Number(val) || 0;
            return acc + numVal;
          }, 0);

          if (sum !== 100) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /** Validates the current analysis step before enabling submission. */
  isStepValid(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) return false;

    const hasCanopyInput = this.hasCanopyInputField[selectedName] || false;
    const analysis = this.analyses.find(a => a.id === selectedName);
    const hasPolygonArrayFields = !!(analysis?.polygonArrayFields?.length);

    if (hasCanopyInput) {
      if (this.getLabeledPolygonsForAnalysis(selectedName).length === 0) return false;
    } else {
      if (this.getUnlabeledPolygonsForAnalysis().length === 0) return false;
      if (hasPolygonArrayFields && this.getLabeledPolygonsForAnalysis(selectedName).length === 0) return false;
    }

    if (!this.arePercentagesValid(selectedName)) {
      console.log('[isStepValid] percentages invalid');
      return false;
    }

    const form = this.analysisForms[selectedName];
    if (!form?.valid) {
      const invalidControls: any = {};
      Object.keys(form?.controls || {}).forEach(k => {
        const ctrl = form.get(k);
        if (ctrl?.invalid) invalidControls[k] = ctrl.errors;
      });
      console.log('[isStepValid] form invalid, controls:', invalidControls);
    }
    return form?.valid ?? false;
  }

  /** Determines if new polygons can be drawn based on polygon array fields or canopy_input. */
  private canDrawNewPolygons(analysisId: string): boolean {
    const analysis = this.analyses.find(a => a.id === analysisId);
    const hasPolygonArrayFields = !!(analysis && (analysis.polygonArrayFields || []).length > 0);
    const hasCanopyInput = !!this.hasCanopyInputField[analysisId];
    return hasPolygonArrayFields || hasCanopyInput;
  }

  /** Returns labeled polygons matching the allowed labels for an analysis. */
  private getLabeledPolygonsForAnalysis(analysisId: string): { label: string; coordinates: [number, number][] }[] {
    const analysis = this.analyses.find(a => a.id === analysisId);
    const allLabeledPolygons = this.mapService.extractLabeledPolygonsForAnalysis();

    // For canopy_input or polygon array fields, accept all labeled polygons (no whitelist)
    if (this.hasCanopyInputField[analysisId] || (analysis?.polygonArrayFields && analysis.polygonArrayFields.length > 0)) {
      return allLabeledPolygons;
    }

    const allowedLabels = new Set((this.polygonLabelsByAnalysis[analysisId] || []).map(label => String(label || '').trim()));
    return allLabeledPolygons.filter(item => allowedLabels.has(String(item.label || '').trim()));
  }

  /** Returns unlabeled polygons drawn by the user. */
  private getUnlabeledPolygonsForAnalysis(): [number, number][][] {
    return this.mapService.extractUnlabeledPolygonsForAnalysis();
  }

  /** @see getLabel in shared/layer-utils */
  getLabel(value: any): string { return getLabel(value, this.translate); }

  /** Calculates the sum of percentage values for a percentage field. */
  getPercentageSum(analysisId: string, fieldName: string): number {
    const form = this.analysisForms[analysisId];
    if (!form) return 0;

    const groupControl = form.get(fieldName);
    if (!groupControl) return 0;

    const groupValue = groupControl.value;
    return (Object.values(groupValue || {}) as any[]).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0);
  }

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

  /** Composes the final request payload for analysis submission. */
  private buildPayload(
    analysis: Analysis,
    formData: any,
    labeledPolygons: { label: string; coordinates: [number, number][] }[],
    unlabeledPolygons: [number, number][][]
  ): any {
    const inputs: any = {};
    const singlePolygon = unlabeledPolygons.length > 0 ? unlabeledPolygons[0] : null;

    const polygonGeometry = singlePolygon ? {
      type: 'Polygon',
      coordinates: [singlePolygon]
    } : null;

    const studyAreaFeature = polygonGeometry ? {
      type: 'Feature',
      geometry: polygonGeometry,
      properties: {
        name: `${this.queryDetails.city} Study Area`
      }
    } : null;

    const boundingBoxFeatureCollection = polygonGeometry ? {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: polygonGeometry,
        properties: {
          name: `${this.queryDetails.city} Bounding Box`
        }
      }]
    } : null;

    const canopyInputFeatureCollection = labeledPolygons.length > 0 ? {
      type: 'FeatureCollection',
      features: labeledPolygons.map(poly => {
        const heightValue = Number(poly.label);
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [poly.coordinates]
          },
          properties: {
            height: !isNaN(heightValue) ? heightValue : 0
          }
        };
      })
    } : null;

    // Process form fields
    Object.keys(formData).forEach(key => {
      const value = formData[key];
      const field = analysis.fields.find(f => f.name === key);

      if (field?.type === 'polygon') {
        if (key === 'study_area' && studyAreaFeature) {
          inputs[key] = { value: studyAreaFeature };
        } else if (key === 'bounding_box' && boundingBoxFeatureCollection) {
          inputs[key] = { value: boundingBoxFeatureCollection };
        } else if (key === 'canopy_input' && canopyInputFeatureCollection) {
          inputs[key] = { value: canopyInputFeatureCollection };
        } else if (polygonGeometry) {
          inputs[key] = { value: polygonGeometry };
        }
        return;
      }

      const percentageField = field?.type === 'percentage';

      if (percentageField && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // For percentage fields, filter out zero values but keep as object with numeric values
        const filteredValue: any = {};
        Object.keys(value).forEach(k => {
          const numVal = Number(value[k]) || 0;
          if (numVal > 0) {
            filteredValue[k] = numVal;
          }
        });
        if (Object.keys(filteredValue).length > 0) {
          inputs[key] = { value: filteredValue };
        }
        return;
      }

      // Handle group fields (like weather with nested properties)
      if (field?.type === 'group' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const groupValue: any = {};
        Object.keys(value).forEach(k => {
          let numVal = value[k];
          if (field.fields) {
            const subField = field.fields.find(f => f.name === k);
            if (subField?.type === 'number' || subField?.type === 'integer') {
              numVal = subField?.format === 'integer' ? parseInt(numVal, 10) : parseFloat(numVal);
              if (isNaN(numVal) || numVal === null) return;
            }
          }
          if (numVal !== null && numVal !== undefined && numVal !== '') {
            groupValue[k] = numVal;
          }
        });
        if (Object.keys(groupValue).length > 0) {
          inputs[key] = { value: groupValue };
        }
        return;
      }

      // Only include non-empty values
      if (value !== '' && value !== null && value !== undefined) {
        // Convert numeric strings to numbers
        let processedValue = value;
        if (field?.type === 'number' || field?.type === 'integer') {
          processedValue = field?.format === 'integer' ? parseInt(value, 10) : parseFloat(value);
        }
        inputs[key] = { value: processedValue };
      } else if (field?.minOccurs === 0 || field?.minOccurs === undefined) {
        // Skip optional fields (minOccurs: 0) if empty
        return;
      }
    });

    // Fill study_area if the analysis originally had it
    if (!inputs['study_area'] && studyAreaFeature && this.hasStudyAreaField[analysis.id]) {
      inputs['study_area'] = { value: studyAreaFeature };
    }

    // Fill polygon if the analysis originally had it and it wasn't already filled
    if (!inputs['polygon'] && polygonGeometry && this.hasPolygonField[analysis.id]) {
      inputs['polygon'] = { value: polygonGeometry };
    }

    // Fill bounding_box if the analysis originally had it and it wasn't already filled
    if (!inputs['bounding_box'] && boundingBoxFeatureCollection && this.hasBoundingBoxField[analysis.id]) {
      inputs['bounding_box'] = { value: boundingBoxFeatureCollection };
    }

    // Fill canopy_input if the analysis originally had it and it wasn't already filled
    if (!inputs['canopy_input'] && canopyInputFeatureCollection && this.hasCanopyInputField[analysis.id]) {
      inputs['canopy_input'] = { value: canopyInputFeatureCollection };
    }

    // Fill polygon array fields with labeled polygons
    if (analysis.polygonArrayFields) {
      analysis.polygonArrayFields.forEach(fieldName => {
        if (!inputs[fieldName] && labeledPolygons.length > 0) {
          const polygonArray = labeledPolygons.map(labeledPoly => ({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [labeledPoly.coordinates]
            },
            properties: {
              selected_measure: this.measures[labeledPoly.label] || labeledPoly.label
            }
          }));
          inputs[fieldName] = { value: polygonArray };
        }
      });
    }

    // Handle fixed values from analysis definition
    if (analysis.fixedValues) {
      Object.keys(analysis.fixedValues).forEach(key => {
        inputs[key] = { value: analysis.fixedValues[key] };
      });
    }

    // For processes where city is a free string (no enum), fill from user-selected city
    if (this.hasCityField[analysis.id] && !inputs['city'] && this.queryDetails.city) {
      inputs['city'] = { value: this.queryDetails.city };
    }

    return {
      inputs,
      response: 'document',
      externalTool: 'geocacher',
      trackingData: {
        city: this.queryDetails.city
      }
    };
  }

  /** Submits analysis payload to appropriate endpoint. */
  async submitAnalysis() {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) {
      this.toastr.danger("Please select an analysis!", "Error");
      return;
    }

    const hasCanopyInput = this.hasCanopyInputField[selectedName] || false;
    const unlabeledPolygons = this.getUnlabeledPolygonsForAnalysis();

    if (!hasCanopyInput && unlabeledPolygons.length === 0) {
      this.toastr.warning("This analysis requires one unlabeled polygon.", "Warning");
      return;
    }

    const analysis = this.analyses.find(a => a.id === selectedName);
    if (!analysis) return;

    const labeledPolygons = this.getLabeledPolygonsForAnalysis(selectedName);
    const formData = this.analysisForms[selectedName].value;
    const payload = this.buildPayload(analysis, formData, labeledPolygons, unlabeledPolygons);

    console.log('Submitting payload:', JSON.stringify(payload, null, 2));

    this.isSubmitting = true;
    this.submitMessage = '';

    try {
      await this.authService.refreshAccessToken();
    } catch (e) {
      console.error('Failed to refresh token:', e);
    }

    try {
      const executionUrl = `https://proxy-manager-dev.urbreath.tech/ogcapi/processes/${selectedName}/execution`;

      const headers = new HttpHeaders()
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${this.authService.getToken()}`);

      const response = await new Promise<any>((resolve, reject) => {
        this.http.post<any>(executionUrl, payload, { headers }).subscribe({
          next: (res) => {
            console.log('Analysis submitted successfully:', res);
            resolve(res);
          },
          error: (err) => reject(err)
        });
      });

      const jobId = response?.jobID || response?.job_id || response?.id || null;
      this.submitMessage = `Analysis ${analysis.name} submitted successfully!${jobId ? ` Job ID: ${jobId}` : ''}`;
    } catch (err: any) {
      const errorMessage = err?.error?.message || err?.message || 'Unknown error';
      const errorDetails = err?.error ? JSON.stringify(err.error, null, 2) : '';
      this.submitMessage = `Error submitting ${analysis.name}: ${errorMessage}`;
      console.error('Submission error:', err);
      console.error('Error details:', errorDetails);
      console.error('Payload sent:', JSON.stringify(payload, null, 2));
      console.error('Analysis fields:', JSON.stringify(analysis.fields, null, 2));
      console.error('hasStudyAreaField:', this.hasStudyAreaField[analysis.id]);
      console.error('hasPolygonField:', this.hasPolygonField[analysis.id]);
      console.error('hasBoundingBoxField:', this.hasBoundingBoxField[analysis.id]);
    } finally {
      this.isSubmitting = false;
    }
  }

  /** Updates map drawing tools visibility based on current analysis, resetting map content per context. */
  private updateMapDrawingTools(): void {
    if (!this.isMapInitialized) return;

    this.mapService.clearMap();
    this.initMap(false);

    if (this.isFromProject && this.projectLayers.length > 0) {
      // From project: restore only the original project polygon, discard anything the user drew
      this.mapService.loadStoredLayers(this.projectLayers, {
        addToEditableLayers: true,
        addToMap: true,
        enableLabelEditing: false,
      });
    }
    // From start analysis: map stays empty — user draws from scratch for each analysis
  }

  /**
   * Initializes the editable map and loads the stored project layers.
   */
  private initMap(loadStoredLayers: boolean = true): void {
    const selectedAnalysisId = this.selectedAnalysisControl.value;
    const analysis = this.selectedAnalysis;

    // Use measure labels if analysis has polygon array fields, otherwise use polygon labels
    let labelsForMap: string[] = [];
    if (selectedAnalysisId) {
      if (analysis?.polygonArrayFields && analysis.polygonArrayFields.length > 0) {
        labelsForMap = this.measureLabels;
      } else {
        labelsForMap = this.polygonLabelsByAnalysis[selectedAnalysisId] || [];
      }
    }

    const needsPolygonInput = !!selectedAnalysisId && (
      this.hasStudyAreaField[selectedAnalysisId] ||
      this.hasPolygonField[selectedAnalysisId] ||
      this.hasBoundingBoxField[selectedAnalysisId]
    );
    const needsLabeledPolygons = !!selectedAnalysisId && this.canDrawNewPolygons(selectedAnalysisId);
    const allowDrawing = needsPolygonInput || needsLabeledPolygons;
    const needsLabels = needsLabeledPolygons;

    const useNumericInput = !!selectedAnalysisId && !!this.hasCanopyInputField[selectedAnalysisId];
    this.mapService.initializeMap("map", this.centerCityFromApi, 12, undefined, {
      enableInMapLabelEditor: needsLabels,
      showLabelTooltips: needsLabels,
      availableLabels: needsLabels ? labelsForMap : [],
      disableDrawing: !allowDrawing,
      useNumericInput,
    });

    if (loadStoredLayers && this.apiServices.storedLayers.length > 0) {
      this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
        addToEditableLayers: true,
        addToMap: true,
        enableLabelEditing: false,
      });

      this.mapService.fitBounds();
    }

    this.apiServices.storedLayers = [];
    this.isMapInitialized = true;
  }

  /** Initializes analysis page state when a city is provided in query params. */
  private async initializeFromSelectedCity(city: string, id: string): Promise<void> {
    this.queryDetails.id = '';
    this.queryDetails.city = city;
    this.centerCityFromApi = getCityCoordinates(city);
    this.apiServices.storedLayers = [];
    this.projectLayers = [];
    this.isFromProject = false;
    this.isMapInitialized = false;
    this.shouldLoadStoredLayersOnMapInit = false;

    await Promise.all([this.loadProcesses(), this.loadMeasureLabels()]);
  }

  /** Initializes analysis page state from a saved project. */
  private async initializeFromStoredProject(projectId: string): Promise<void> {
    this.apiServices.storedLayers = [];
    this.projectLayers = [];
    this.isFromProject = true;
    this.isMapInitialized = false;
    this.shouldLoadStoredLayersOnMapInit = true;

    const data: any = await this.apiServices.getDocument([projectId]);
    this.queryDetails.id = data.id;
    this.queryDetails.city = data.city;

    this.centerCityFromApi = getCityCoordinates(data.city);

    if (data.layers && data.layers.length > 0) {
      data.layers.forEach((layer: string) => {
        const parsed = JSON.parse(layer);
        this.apiServices.storedLayers.push(parsed);
        this.projectLayers.push(parsed);
      });
    }

    await Promise.all([this.loadProcesses(), this.loadMeasureLabels()]);
  }

  /** Orchestrates page initialization based on query params or saved project id. */
  private async initializePage(cityFromQuery: string | null, idFromQuery: string | null): Promise<void> {
    this.loading = true;

    try {
      if (cityFromQuery) {
        this.showCitySelector = false;
        await this.initializeFromSelectedCity(cityFromQuery, idFromQuery || '');
        this.loading = false;
        return;
      }

      const projectId = localStorage.getItem("projectId");
      if (projectId) {
        this.showCitySelector = false;
        await this.initializeFromStoredProject(projectId);
        this.loading = false;
        return;
      }

      localStorage.removeItem("projectId");
      this.showCitySelector = true;
      this.loading = false;
    } catch (error) {
      console.error("Failed to load project:", error);
      localStorage.removeItem("projectId");
      this.loading = false;
      this.showCitySelector = true;
    }
  }

  onCitySelected(): void {
    const city = this.selectedCityControl.value;
    if (city) {
      this.apiServices.storedLayers = [];
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { city },
        queryParamsHandling: 'merge',
      });
    }
  }

  /**
   * Loads the current project, configures the map center from the city,
   * restores saved layers and finally loads the available analyses.
   */
  async ngOnInit() {
    this.selectedAnalysisSubscription = this.selectedAnalysisControl.valueChanges.subscribe(async (selectedAnalysisId: string) => {
      this.selectedPolygonLabel = '';
      this.submitMessage = '';
      if (selectedAnalysisId) {
        await this.loadAnalysisFromSchema(selectedAnalysisId);
      }
      if (selectedAnalysisId && !this.isMapInitialized) {
        setTimeout(() => {
          this.initMap(this.shouldLoadStoredLayersOnMapInit);
          setTimeout(() => this.mapService.invalidateSize(), 200);
        }, 100);
      } else if (selectedAnalysisId && this.isMapInitialized) {
        this.updateMapDrawingTools();
      }
    });

    this.selectedPolygonLabelSubscription = this.mapService.selectedPolygonLabel$.subscribe((selectedLabel: string) => {
      this.selectedPolygonLabel = String(selectedLabel || '').trim();
    });

    this.routeSubscription = this.route.queryParamMap.subscribe(params => {
      this.initializePage(params.get('city'), params.get('id'));
    });
  }

  /** Releases subscriptions created during component initialization. */
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
