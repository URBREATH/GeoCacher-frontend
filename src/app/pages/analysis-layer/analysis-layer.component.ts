import { Component, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from "@angular/forms";
import { ApiService } from "../../services/api.service";
import { MapService } from "../../services/map.service";
import { TranslateService } from "@ngx-translate/core";
import { Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";

interface Field {
  label: string;
  name: string;
  type: string;
  options?: SelectOption[];
  fields?: Field[];
  multiple?: boolean;
  tooltip?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface Analysis {
  id: string;
  name: string;
  url: string;
  mode: 'preset' | 'custom';
  fields: Field[];
}

@Component({
  selector: "ngx-analysis-layer",
  templateUrl: "./analysis-layer.component.html",
  styleUrls: ["./analysis-layer.component.scss"],
})
export class AnalysisLayerComponent implements OnInit {
  loading = false;
  isSubmitting = false;
  submitMessage: string = '';

  selectedAnalysisControl = new FormControl('', Validators.required);
  analysisForms: { [key: string]: FormGroup } = {};
  analyses: Analysis[] = [];
  
  queryDetails = {
    id: "",
    city: "",
    layers: [],
  };

  centerCityFromApi: any = [];

  constructor(
    private apiServices: ApiService,
    private formBuilder: FormBuilder,
    private translate: TranslateService,
    private router: Router,
    private http: HttpClient,
    private mapService: MapService
  ) { }

  normalizeLabel(label: any) {
    if (typeof label === 'object') {
      return label;
    }

    return label
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  loadAnalysisFromFile(): void {
    this.http.get<Analysis[]>('assets/formAnalysis.json').subscribe({
      next: (data) => {
        this.analyses = data.map(analysis => {
          analysis.fields.forEach(field => {
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
              controls[field.name] = new FormControl([]);
            } else if (field.type === 'select' && !field.multiple) {
              controls[field.name] = new FormControl('');
            } else if (field.type === 'number') {
              controls[field.name] = new FormControl(null, Validators.required);
            }
            else {
              controls[field.name] = new FormControl('', Validators.required);
            }
          });

          this.analysisForms[analysis.id] = this.formBuilder.group(controls);
        });
      },
      error: (err) => console.error(err)
    });
  }

  get selectedAnalysis(): Analysis | undefined {
    const selectedName = this.selectedAnalysisControl.value;
    return this.analyses.find(a => a.id === selectedName);
  }

  isStepValid(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) return false;
    const form = this.analysisForms[selectedName];
    return form?.valid ?? false;
  }

  getLabel(value: any): string {
    if (!value) return '';

    const lang = this.translate.currentLang || 'en';

    if (typeof value === 'string') {
      return value;
    }

    return value[lang] || value['en'] || Object.values(value)[0];
  }

  onMultiSelectChange(analysisName: string, fieldName: string, value: string, checked: boolean) {
    const control = this.analysisForms[analysisName].get(fieldName);
    const current: string[] = control.value || [];

    if (checked) {
      control.setValue([...current, value]);
    } else {
      control.setValue(current.filter(v => v !== value));
    }
  }

  async submitAnalysis() {
    const polygons = this.mapService.extractPolygonsForAnalysis();

    if (polygons.length === 0) {
      alert("No polygons drawn!");
      return;
    }

    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) {
      alert("Please select an analysis!");
      return;
    }

    const analysis = this.analyses.find(a => a.id === selectedName);
    if (!analysis) return;

    const formData = this.analysisForms[selectedName].value;

    const cleanFormData = (data: any): any => {
      const result: any = {};
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (key === 'id') return;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = cleanFormData(value);
        } else if (!isNaN(value) && value !== '') {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      });
      return result;
    };

    const payload = {
      polygon: polygons[0],
      mode: analysis.mode,
      ...cleanFormData(formData)
    };

    this.isSubmitting = true;
    this.submitMessage = '';

    try {
      const result: any = await this.http.post(
        analysis.url || 'http://localhost:9090/analyze_polygon',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      ).toPromise();

      this.submitMessage = `Analysis ${selectedName} submitted successfully!`;
    } catch (err: any) {
      this.submitMessage = `Error submitting ${selectedName}: ${err.message}`;
    } finally {
      this.isSubmitting = false;
    }
  }

  private initMap(): void {
    this.mapService.initializeMap("map", this.centerCityFromApi, 12, undefined, {
      enableInMapLabelEditor: true,
      showLabelTooltips: true,
    });

    this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
      addToEditableLayers: true,
      addToMap: false,
      enableLabelEditing: false,
    });

    this.apiServices.storedLayers = [];
  }

  async ngOnInit() {
    this.loading = true;

    try {
      // Get project ID from localStorage
      const projectId = localStorage.getItem("projectId");
      if (!projectId) {
        console.error("No project ID found");
        this.router.navigate(["/pages/available-options"]);
        return;
      }

      // Fetch project data
      const data: any = await this.apiServices.getDocument([projectId]);
      this.queryDetails.id = data.id;
      this.queryDetails.city = data.city;

      // Set map center based on city
      switch (data.city) {
        case "Aarhus":
          this.centerCityFromApi = [56.1629, 10.2039];
          break;
        case "Athens":
          this.centerCityFromApi = [37.9755, 23.7348];
          break;
        case "Cluj-Napoca":
          this.centerCityFromApi = [46.7712, 23.6236];
          break;
        case "Kajaani":
          this.centerCityFromApi = [64.2279, 27.7284];
          break;
        case "Leuven":
          this.centerCityFromApi = [50.8823, 4.7138];
          break;
        case "Madrid":
          this.centerCityFromApi = [40.4165, -3.7026];
          break;
        case "Parma":
          this.centerCityFromApi = [44.8015, 10.3279];
          break;
        case "Pilsen":
          this.centerCityFromApi = [49.7384, 13.3736];
          break;
        case "Tallinn":
          this.centerCityFromApi = [59.437, 24.7536];
          break;
        default:
          this.centerCityFromApi = [50.8823, 4.7138];
      }

      // Load project layers
      if (data.layers && data.layers.length > 0) {
        data.layers.forEach((layer: string) => {
          this.apiServices.storedLayers.push(JSON.parse(layer));
        });
      }

      // Initialize map
      setTimeout(() => this.initMap(), 100);

      // Load analysis
      this.loadAnalysisFromFile();

      this.loading = false;
    } catch (error) {
      console.error("Failed to load project:", error);
      this.loading = false;
      this.router.navigate(["/pages/available-options"]);
    }
  }
}
