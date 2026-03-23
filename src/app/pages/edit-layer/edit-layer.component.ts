import { Component, Input, OnInit, ViewChild } from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from "@angular/forms";

import * as L from "leaflet";
import { NbStepChangeEvent, NbStepperComponent } from "@nebular/theme";
import { ApiService } from "../../services/api.service";
import { MapService } from "../../services/map.service";
import { __await } from "tslib";
import { saveAs } from "file-saver";
import { Router } from "@angular/router";
import { TranslateService } from "@ngx-translate/core";
import { HttpClient } from "@angular/common/http";

interface Field {
  label: string;
  name: string;
  type: string;                // 'select', 'number', 'group', etc.
  options?: SelectOption[];          // for select fields
  fields?: Field[];            // for group fields
  multiple?: boolean;          // optional, true for multi-select fields
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
  selector: "ngx-edit-layer",
  templateUrl: "./edit-layer.component.html",
  styleUrls: ["./edit-layer.component.scss"],
})
export class EditLayerComponent implements OnInit {
  /**
   * Variables
   */
  //hiding alerts by default
  hidingAlerts: boolean = true;

  //showing alert when not selecting a filter
  isFilterOn: boolean = false;

  //showing alert when not drawing shape
  isDrawn: boolean = false;
  //alert when not selecting a city
  citySelected: boolean = false;
  //controlling the loading spinner
  loading = false;
  //areas - these are not shown atm
  areas: any[] = [
    { id: 1, display: "Alppila" },
    { id: 2, display: "Ruoholahti" },
    { id: 3, display: "Lauttasaari" },
  ];

  //utility for clearing the map from previous instances that might have left traces
  public clearMap() {
    this.mapService.clearMap();
  }

  //here is stored the data related to the project's cronJob
  cronJob: any = {
    id: null,
  };

  /*step 4 analyses*/
  // Component
  selectedAnalyses: { [key: string]: boolean } = {};
  analysisUrls: { [key: string]: string } = {};
  analysisForms: { [key: string]: FormGroup } = {};
  selectedAnalysesForm: FormGroup = this.formBuilder.group({});
  selectedAnalysisControl = new FormControl('', Validators.required);
  analyses: Analysis[] = [];

  //contols progress of the loading bar
  @Input() progress: number = 0;

  //forms declaration
  filtersForm: FormGroup;
  saveForm: FormGroup;

  //controls for saveForm
  nameInput: FormControl;
  descriptionInput: FormControl;
  autoUpdateCheckbox: FormControl;
  cronTimer: FormControl;

  //object in which to store the data input by the user
  queryDetails = {
    id: "",
    //this will only host one element if the user created at least one polygon
    polygons: [],
    circles: [],
    city: "",
    center: [],
    filter: [],
    subFilters: [],
    queryName: "",
    queryDescription: "",
    layers: [],
    cronJob: false,
    cronRepetition: 0,
    onIDRA: false,
  };
  //circles will host the following object for each element:
  //circles:[
  // Object({
  //         point: {
  //           latitude: layer.geometry.coordinates[1],
  //           longitude: layer.geometry.coordinates[0],
  //         },
  //         radius: layer.properties.radius,
  //         external: false,
  //       })
  // ]

  //get and store here the coordinates in which to point the center of the map
  centerCityFromApi: any = [];

  constructor(
    private apiServices: ApiService,
    private formBuilder: FormBuilder,
    private translate: TranslateService,
    private router: Router,
    private http: HttpClient,
    private mapService: MapService
  ) { }

  /**
   * Step 1 map rendering
   */
  //map for step 1
  private initFiltersMap(): void {
    const drawOptions = {
      position: "topright",
      draw: {
        polyline: false,
        marker: false,
        rectangle: { showArea: false },
        circlemarker: false,
      },
    };

    this.mapService.initializeMap("map", this.centerCityFromApi, 12, drawOptions);
    this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
      addToEditableLayers: true,
      addToMap: false,
      enableLabelEditing: true,
    });

    console.log(this.apiServices.storedLayers);
    // segna che qualcosa è già stato disegnato
    this.isDrawn = this.apiServices.storedLayers.length > 0;

    // svuota l'array temporaneo dei layer
    this.apiServices.storedLayers = [];
  }

  /**
   * Check if the number  of layers is higher than 3.
   * In a map without any other kind of layers (eg: markers, circlemarkers),
   * it confirms the presence of drawings created by the user
   */
  checkDrawing() {
    //the settimout is to make sue that leaflet has added/removed the layers before we are counting them
    setTimeout(() => {
      this.isDrawn = this.mapService.hasUserDrawings();
    }, 100);
  }

  // Usage: call checkDrawing() to check if there are drawings on the map.

  /**
   * Checks inside the layers created by leaflet. If criteria are met,
   * stores them in an array.
   */
  saveDrawings() {
    this.apiServices.storedLayers = this.mapService.serializeDrawings();
  }

  /**
   * Step3 map rendering
   */

  //store here the layers to be added to the map
  overlayMaps: any = {};

  //map for step3
  public initFinalMap(): void {
    this.mapService.initializeMapWithOverlays("map", this.centerCityFromApi, this.overlayMaps, 12);
  }

  // utils: normalize labels (space instead of _, capitalize first letters)
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
            // normalize field label
            field.label = field.label ? this.normalizeLabel(field.label) : this.normalizeLabel(field.name);

            // normalize options
            if (field.type === 'select' && field.options) {
              field.options = field.options.map(opt => {
                if (typeof opt === 'string') {
                  return { value: opt, label: this.normalizeLabel(opt) };
                }
                return { value: opt.value, label: this.normalizeLabel(opt.label || opt.value) };
              });
            }

            // handle grouped fields
            if (field.type === 'group' && field.fields) {
              field.fields.forEach(subField => {
                subField.label = subField.label ? this.normalizeLabel(subField.label) : this.normalizeLabel(subField.name);
              });
            }
          });

          return analysis;
        });

        // initialize forms
        this.analyses.forEach(analysis => {
          this.selectedAnalysesForm.addControl(analysis.id, new FormControl(false));
          this.analysisUrls[analysis.id] = analysis.url;

          const controls: any = {};
          analysis.fields.forEach(field => {
            if (field.type === 'group' && field.fields) {
              const groupControls: any = {};
              field.fields.forEach(subField => {
                groupControls[subField.name] = new FormControl('', Validators.required);
              });
              controls[field.name] = this.formBuilder.group(groupControls);
            } else if (field.type === 'select' && field.multiple) {
              controls[field.name] = new FormControl([]); // multi-select
            } else if (field.type === 'select' && !field.multiple) {
              controls[field.name] = new FormControl(''); // single-select
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

  // get selected analysis
  get selectedAnalysis(): Analysis | undefined {
    const selectedName = this.selectedAnalysisControl.value;
    return this.analyses.find(a => a.id === selectedName);
  }

  // step valido
  isStepValid(): boolean {
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) return false; // no analysis selected
    const form = this.analysisForms[selectedName];
    return form?.valid ?? false;
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

  isSubmitting = false;       // stato di caricamento
  submitMessage: string = ''; // messaggio finale da mostrare

  async submitAnalysis() {
    // 1️⃣ Build polygons from editableLayers
    const polygons = this.mapService.extractPolygonCoordinatesForAnalysis('latlng');

    if (polygons.length === 0) {
      alert("No polygons drawn!");
      return;
    }

    // 2️⃣ Get the selected analysis
    const selectedName = this.selectedAnalysisControl.value;
    if (!selectedName) {
      alert("Please select an analysis!");
      return;
    }

    const analysis = this.analyses.find(a => a.id === selectedName);
    if (!analysis) return;

    const formData = this.analysisForms[selectedName].value;

    // Optional: clean nested objects
    const cleanFormData = (data: any): any => {
      const result: any = {};
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (key === 'id') return;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = cleanFormData(value); // recurse
        } else if (!isNaN(value) && value !== '') {
          result[key] = Number(value); // convert numeric strings
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

    // 3️⃣ Submit
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

  switchLanguage(language: string) {
    // Provide default language if language is empty or undefined
    const selectedLanguage = language || 'en';
    document.cookie = `language=${selectedLanguage}`;
    this.translate.use(selectedLanguage);
  }

  getLabel(value: any): string {
    if (!value) return '';

    const lang = this.translate.currentLang || 'en';

    if (typeof value === 'string') {
      return value;
    }

    return value[lang] || value['en'] || Object.values(value)[0];
  }

  public formData: any;
  async ngOnInit() {
    this.switchLanguage(this?.getCookie("language"));

    //initialize filtersForm as FormGroup
    this.filtersForm = new FormGroup({
      filters: new FormControl(null),
    });

    //controls for name and description saving
    this.nameInput = new FormControl("");
    this.descriptionInput = new FormControl("");
    this.autoUpdateCheckbox = new FormControl(false);
    this.cronTimer = new FormControl(1);

    //Form builder for saving name and description in step 3
    this.saveForm = this.formBuilder.group({
      nameInput: this.nameInput,
      descriptionInput: this.descriptionInput,
      autoUpdateCheckbox: this.autoUpdateCheckbox,
      cronTimer: this.cronTimer,
    });

    //subscribe to the value of the apiServices.progress$
    //this way progress will update anytime progress$ changes
    this.apiServices.progress$.subscribe((value) => {
      value < 100
        ? (this.progress = Math.ceil(value))
        : (this.progress = Math.floor(value));
      if (value >= 99) {
        this.checkEmptyLayers();
      }
    });

    //store here the data received by the http request
    let data: any;
    //initialize the array in which to store the id of the project you are fetching
    //the push it in the array  from localStorage
    let id = [];
    id.push(localStorage.getItem("projectId"));

    try {
      //sets the spinner on
      this.loading = true;
      //fetch the project
      data = await this.apiServices.getDocument(id);
      console.log(data);
      
      //save all the relevant info of the project in queryDetails first
      this.queryDetails.id = data.id;
      this.queryDetails.queryName = data.name;
      this.queryDetails.city = data.city;
      this.queryDetails.queryDescription = data.description;
      this.queryDetails.onIDRA = data.onIDRA;
      
      //ask for the filters for the selected city (now that we have it)
      this.formData = await this.apiServices.getFilters(this.queryDetails.city);
      //pushing fetch results in this.filters
      this.formData.controls.forEach((element: any) => {
        if (element.city === data.city) {
          this.filters.push(element.type);
        }
      });

      //if there is an active cronJob on this project, set the values in the saving form accordingly
      if (data.cron_id !== null) {
        this.cronJob = await this.apiServices.getCron(data.cron_id);
        this.saveForm.controls.autoUpdateCheckbox.setValue(true);
        this.saveForm.controls.cronTimer.setValue(this.cronJob.repeat);
      }
      //if a cronJob is associated with current project, stores it in cronJobs
      data.cron_id !== null
        ? (this.cronJob = await this.apiServices.getCron(data.cron_id))
        : null;

      //sets the spinner of
      this.loading = false;

      //sets center of the map according to the city of the project
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
          // Safe fallback to a valid center (Leuven)
          this.centerCityFromApi = [50.8823, 4.7138];
      }

      this.onSelectChange(data.filter[0]);

      let obj = {
        filters: new FormControl(this.selectedFilter[0]),
      };
      this.subFilters.forEach((element) =>
        element.values.forEach((element) => {
          obj[element.label] = new FormControl(
            Object.keys(this.apiServices.elements).includes(element.label)
          );
          obj[element.label + "_select"] = new FormControl({
            value: element.icon,
            disabled: true,
          });
        })
      );

      this.filtersForm = new FormGroup(obj);

      //compares the data of the select and the filters created by the user, returning the icon to be put in each select
      function userSelectedIcon(filter, value) {
        let temp: string;
        for (let sf of data.subfilter) {
          if (sf[0] === filter && sf[1] == value) {
            temp = sf[2];
          }
        }
        return temp;
      }

      this.subFilters.forEach((element) => {
        element.values.forEach((el) => {
          //this part is for ticking the checkboxes that have already been selected by the user
          if (Object.keys(this.apiServices.elements).includes(el.label)) {
            let label = el.label;
            let userIcon = userSelectedIcon(element.output_value, el.value);
            this.onCheckboxChange(
              label,
              element.output_value,
              el.value,
              userIcon
            );
            //sets the icon to the one selected by the user
            //a bit of settimeout is required to let the html component load
            setTimeout(() => {
              let img = document.getElementById(el.label + "_img");
              img.setAttribute("src", this.imgSrc(userIcon));
            }, 10);
          }
        });
      });

      //then set isFilter on, as we already have filters applied
      this.selectedSubFilters.length === 0
        ? (this.isFilterOn = false)
        : (this.isFilterOn = true);

      //push all the layers drawn by the user in storedLayers
      data.layers.forEach((e) =>
        this.apiServices.storedLayers.push(JSON.parse(e))
      );

      //clear the map and initialize it
      this.clearMap();
      this.initFiltersMap();
    } catch (error) {
      //set spinner of even if it is an error
      this.loading = false;

      // Show a message in case of error
      console.error("API call failed:", error);
    }

    /*OLD ICON:
    //fill the icons array with entries from the iconUrls
    Object.entries(this.apiServices.iconUrls).forEach((el) =>
      this.icons.push(
        Object({
          name: el[0],
          url: el[1],
        })
      )
    );
    */
    Object.entries(this.apiServices.iconUrls).forEach((el) =>
      this.icons.push({
        name: el[0],  // e.g., "hospital"
        url: el[1],   // e.g., "https://api.iconify.design/lucide/hospital.svg"
      })
    );

    //analyses loading from json
    this.loadAnalysisFromFile();

    this.analyses.forEach((analysis) => {
      this.selectedAnalyses[analysis.name] = false;

      const controls: { [key: string]: FormControl } = {};
      analysis.fields.forEach((field) => {
        controls[field.name] = new FormControl('', Validators.required);
      });
      this.analysisForms[analysis.name] = this.formBuilder.group(controls);
    });
  }

  /**
   * Stepper controls
   */

  @ViewChild("stepper")
  stepper: NbStepperComponent;
  changeEvent: NbStepChangeEvent;

  //
  dynamicUrl(): string {
    return this.loading
      ? this.apiServices.storedLayers.length > 0
        ? "/pages/edit-layer"
        : "/pages/view-layer"
      : "/pages/view-layer";
  }

  //cleans all processes if going back while loading
  onAbort() {
    this.apiServices.destroyCalls();
    this.loading = false;
  }

  async onStepChange(event: any) {
    // The event object contains information about the current step and previous step.
    // You can access them as follows:
    this.changeEvent = event;

    switch (this.stepper.selectedIndex) {
      //step 1
      case 0:
        this.apiServices.cronMultipoint = [];
        this.apiServices.cronMultipolygon = [];
        this.apiServices.destroyCalls();
        this.queryDetails.polygons = [];
        this.queryDetails.circles = [];
        this.hidingAlerts = true;
        this.checkDrawing();
        this.clearMap();
        setTimeout(() => this.initFiltersMap(), 300);
        break;
      //step 2
      case 1:
        this.clearMap();
        setTimeout(() => this.initFinalMap(), 300);
        break;
      //step 3
      case 2:
        this.nameInput.setValue(this.queryDetails.queryName);
        this.descriptionInput.setValue(this.queryDetails.queryDescription);
        break;
      //step 4 - analyses
      case 3:
        //do nothing
        break;
    }
  }

  //flag to show alert in case of empty layers
  public emptyLayers = false;
  //flag to count layers that have at least one result
  public filledLayers = 0;
  checkEmptyLayers() {
    this.filledLayers = 0;
    this.emptyLayers = false;
    Object.entries(this.apiServices.elements).forEach((element: any) => {
      if (element[1].length === 0) {
        this.emptyLayers = true;
      }
      if (element[1].length > 0) {
        this.filledLayers += 1;
      }
    });
  }

  //filters fetched from JSON
  filters = [];

  //filters selected by the user
  selectedFilter = [];

  //
  subFilters = [];

  //
  selectedSubFilters = [];

  //called everytime the user checks a box
  //event = array of selected filters
  onSelectChange(filter: any) {
    this.resetSubFilters();
    this.selectedFilter = [filter];
    this.checkAndSetFilter();

    this.formData.controls.forEach((element: any) => {
      if (element.city === this.queryDetails.city) {
        if (element.type === filter) {
          this.subFilters = [];
          element.filters.forEach((el) => this.subFilters.push(el));
        }
      }
    });
    this.setFormGroup(this.subFilters);
  }

  setFormGroup(subFilters) {
    let obj = {
      filters: new FormControl(this.selectedFilter[0]),
    };
    subFilters.forEach((element) =>
      element.values.forEach((element) => {
        obj[element.label] = new FormControl(
          this.selectedSubFilters.forEach((subFilter) => {
            subFilter[0] === element.label;
          })
        );
        obj[element.label + "_select"] = new FormControl({
          value: element.icon,
          disabled: true,
        });
      })
    );
    this.filtersForm = new FormGroup(obj);
  }

  icons = [];

  imgSrc(icon) {
    return this.apiServices.iconUrls[icon] || this.apiServices.iconUrls.default;
  }

  //called when the user changes value in the icon select
  changeIcon(newIcon, label, value, filter) {
    //subfilter - without icon
    const sf: any = [label, [filter, value]];

    //check selected subfilters array for sf
    const index = this.selectedSubFilters.findIndex((element) =>
      areSubFiltersEqual(element, sf)
    );

    //prettier-ignore
    function areSubFiltersEqual([label1, [filter1, value1]], [label2, [filter2, value2]]) {
      return label1 === label2 && filter1 === filter2 && value1 === value2;
    }

    //point to the icon's value's position in the subfilter array and change it with the new icon
    this.selectedSubFilters[index][1][2] = newIcon;

    //update queryDetails
    this.queryDetails.subFilters = this.selectedSubFilters;
    this.checkAndSetSubFilters();

    let img = document.getElementById(label + "_img");
    img.setAttribute("src", this.imgSrc(newIcon));
  }

  //called when the user changes value in the checkbox
  onCheckboxChange(label, filter, value, icon) {
    //subfilter - without icon
    const sf = [label, [filter, value]];

    // Check if the subFilter already exists (index will be -1 if it doesn't)
    const index = this.selectedSubFilters.findIndex((element) =>
      areSubFiltersEqual(element, sf)
    );

    //set the option to the same name as icon
    let iconSelect = this.filtersForm.controls[label + "_select"];
    iconSelect.setValue(icon);
    iconSelect.status === "DISABLED"
      ? iconSelect.enable()
      : iconSelect.disable();
    //set matching icon
    //settimeout is needed as this function is also called in onInit
    setTimeout(() => {
      let img = document.getElementById(label + "_img");
      img.setAttribute("src", this.imgSrc(icon));
    }, 10);

    function areSubFiltersEqual(subFilter1, subFilter2) {
      const [label1, [filter1, value1]] = subFilter1;
      const [label2, [filter2, value2]] = subFilter2;
      return label1 === label2 && filter1 === filter2 && value1 === value2;
    }

    if (index !== -1) {
      // Remove the existing subFilter
      this.selectedSubFilters.splice(index, 1);
    } else {
      //Add icon to the new subfilter
      sf[1][2] = icon;
      // Add the new subFilter
      this.selectedSubFilters.push(sf);
    }

    this.queryDetails.subFilters = this.selectedSubFilters;
    this.checkAndSetSubFilters();
  }

  //utility to set isFilter on if there are filters already selected
  checkAndSetFilter() {
    this.queryDetails.filter = [];

    this.queryDetails.filter = this.selectedFilter;
  }

  checkAndSetSubFilters() {
    this.queryDetails.subFilters = [];
    this.selectedSubFilters.length === 0
      ? (this.isFilterOn = false)
      : (this.isFilterOn = true);

    this.queryDetails.subFilters = this.selectedSubFilters;
  }

  resetSubFilters() {
    this.subFilters = [];
    this.selectedSubFilters = [];
    this.queryDetails.subFilters = [];

    this.selectedSubFilters.length === 0
      ? (this.isFilterOn = false)
      : (this.isFilterOn = true);
  }

  /**
   * function called on step 1 submit (selecting filters and drawing areas)
   */
  async onFiltersFormSubmit() {
    var layer: any;
    //empting overlayMaps and objects in ApiServices, so they are ready to receive new data
    this.overlayMaps = {};
    this.apiServices.markers = {};
    this.apiServices.elements = {};
    this.isDrawn && this.isFilterOn && this.saveDrawings();
    //for each area drawn by the user and stored inside saveDrawings
    for (layer of this.apiServices.storedLayers) {
      // For polygons, layer._latlngs[i] is an array of LatLngs objects
      if (!layer.properties.radius) {
        //push a number inside the array so it knows at least one polygon has been created
        this.queryDetails.polygons.length < 1 &&
          this.queryDetails.polygons.push(1);
      } else {
        this.queryDetails.circles.push(
          Object({
            point: {
              latitude: layer.geometry.coordinates[1],
              longitude: layer.geometry.coordinates[0],
            },
            radius: layer.properties.radius,
            external: false,
          })
        );
      }
    }
    try {
      this.loading = true;

      this.apiServices.totalProgress = 0;
      if (this.queryDetails.circles.length !== 0) {
        await this.apiServices.getPointRadiusData({
          city: this.queryDetails.city,
          filter: this.queryDetails.filter,
          subfilter: this.queryDetails.subFilters,
          multipoint: this.queryDetails.circles,
        });
      }
      if (this.queryDetails.polygons.length !== 0) {
        // Make the API call with the prepared data
        await this.apiServices.getPolygonData({
          city: this.queryDetails.city,
          filter: this.queryDetails.filter,
          subfilter: this.queryDetails.subFilters,
        });
      }

      Object.entries(this.apiServices.markers).forEach((element: any) => {
        let filterName = element[0];
        this.overlayMaps[filterName]
          ? this.overlayMaps[filterName].addLayers(element[1].getLayers())
          : (this.overlayMaps[filterName] = element[1]);
      });

      if (this.queryDetails.subFilters.length === 0 || this.queryDetails.filter.length === 0) {
        this.apiServices.setProgress(100);
        this.progress = 100;          // ensure loading mask hides
        this.checkEmptyLayers();       // show map (empty if nothing returned)
      }

      this.loading = false;
      this.isDrawn && this.isFilterOn
        ? this.stepper.next()
        : (this.hidingAlerts = false);
    } catch (error) {
      // Show a message in case of error
      this.loading = false;
      console.error("API call failed:", error);
    }
  }

  /**
   * Submit of step 3 - store drawn areas inside queryDetails,
   * stores in queryDetails the name and description written in the form
   * then calls the update function
   */
  async onThirdSubmit() {
    this.queryDetails.layers = [];
    this.apiServices.storedLayers.forEach((layer) => {
      this.queryDetails.layers.push(JSON.stringify(layer));
    });
    this.queryDetails.queryName = this.saveForm.value.nameInput;
    this.queryDetails.queryDescription = this.saveForm.value.descriptionInput;
    this.queryDetails.cronJob = this.saveForm.value.autoUpdateCheckbox;
    this.queryDetails.cronRepetition = this.saveForm.value.cronTimer;
    try {
      if (this.queryDetails.queryName.length !== 0) {
        // Make the API call with the prepared data
        await this.apiServices.updateSearch(this.queryDetails);

        //if a cronJob is active
        if (this.cronJob.id !== null) {
          //but autoUpdate is not checked
          if (this.queryDetails.cronJob === false) {
            //it means that the active cronJob needs to be deleted
            await this.apiServices.deleteCron(this.queryDetails.id);
          } else {
            //store id and value of update repetitions
            let idAndRep = {
              id: this.queryDetails.id,
              repeat: this.queryDetails.cronRepetition,
            };
            //update the cronJob
            await this.apiServices.updateCronJobs(idAndRep);
          }
        } else {
          //if cronJob.id IS null
          if (this.queryDetails.cronJob !== false) {
            //store id and value of update repetitions
            let idAndRep = {
              id: this.queryDetails.id,
              repeat: this.queryDetails.cronRepetition,
            };
            //update the cronJob
            await this.apiServices.setCronJob(idAndRep);
          }
        }

        this.router.navigate(["pages/available-options"]);
      }
    } catch (error) {
      // Show a message in case of error
      this.router.navigate(["pages/available-options"]);
      console.error("API call failed:", error);
    }
  }

  /**
   * File importing and exporting
   */

  fileData = [];
  fileUpload(event) {
    if (event.target.files && event.target.files.length > 0) {
      let file = event.target.files[0];
      const fileExtension = file.name.split(".").pop();
      if (fileExtension !== "geojson") {
        file = "";
        this.fileData = [];
        alert("Please upload only .geojson files");
        return;
      } else {
        //leggo i dati dal file
        const reader = new FileReader();
        reader.onload = (e) => {
          this.fileData[0] = e.target.result as string;
          var geojsonLayer = JSON.parse(this.fileData[0]);
          this.apiServices.storedLayers.push(geojsonLayer);
          this.clearMap();
          setTimeout(() => this.initFiltersMap(), 100);
        };
        reader.readAsText(file);
      }
    }
  }

  saveFile() {
    this.saveDrawings();
    const geoJsonFile = { type: "FeatureCollection", features: [] };
    this.apiServices.storedLayers.forEach((feature) => {
      geoJsonFile.features.push(feature);
    });
    const blob = new Blob([JSON.stringify(geoJsonFile)], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, `${this.queryDetails.city}.geojson`);
  }
}
