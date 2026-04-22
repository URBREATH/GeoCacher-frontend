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
import { TranslateService } from "@ngx-translate/core";
import { Router } from "@angular/router";
import { getCookie, switchLanguage } from '../shared/layer-utils';
import * as turf from '@turf/turf';
import { AnalysisAvailabilityService } from '../../services/analysis-availability.service';



@Component({
  selector: "ngx-create-layer",
  templateUrl: "./create-layer.component.html",
  styleUrls: ["./create-layer.component.scss"],
})
export class CreateLayerComponent implements OnInit {
  // Properties
  @Input() progress: number = 0;
  firstForm: FormGroup;
  filtersForm: FormGroup;
  saveForm: FormGroup;
  lastSimplified: number = 0;
  //hiding alerts by default
  hidingAlerts: boolean = true;
  //showing alert when not selecting a filter
  isFilterOn: boolean = false;

  //showing alert when not drawing shape
  isDrawn: boolean = false;
  //controlling the loading spinner
  loading = false;
  //alert when not selecting a city
  citySelected: boolean = true;

  //utility for clearing the map from previous instances that might have left traces
  public clearMap() {
    this.mapService.clearMap();
  }

  //store the data for filling the filters' form here
  public formData: any;

  //controls for saveForm
  nameInput: FormControl;
  descriptionInput: FormControl;
  autoUpdateCheckbox: FormControl;
  cronTimer: FormControl;

  //object in which to store the data input by the user
  queryDetails = {
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

  /**
   * Step 1 - radio options
   */
  options: { value: [[number, number], string]; label: string }[] = [];
  //option takes the value of one of the element of the array options - check the radio group in the html
  option: [[number, number], string] = [[0, 0], ""];

  // Getter to access the selected city from the reactive form
  get selectedCity(): [[number, number], string] {
    const formValue = this.firstForm?.get('cityOptions')?.value;
    return formValue || this.option || [[0, 0], ""];
  }

  get canStartAnalysisForSelectedCity(): boolean {
    const selectedCityName = String(this.queryDetails.city || this.selectedCity[1] || '').trim();
    return !!selectedCityName && this.analysisAvailabilityService.isAnalysisAvailable(selectedCityName);
  }

  constructor(
    private apiServices: ApiService,
    private translate: TranslateService,
    private router: Router,
    private formBuilder: FormBuilder,
    private mapService: MapService,
    private analysisAvailabilityService: AnalysisAvailabilityService
  ) { }

  /**
   * Loads cities from API endpoint
   */
  private async loadCities(): Promise<void> {
    try {
      this.loading = true;
      this.options = await this.apiServices.getCitiesFromApi();
      this.loading = false;
    } catch (error) {
      this.loading = false;
      console.error("Failed to load cities:", error);
      // Fallback to empty array or show error message
      this.options = [];
    }
  }

  /**
   * Step 2 map rendering
   */

  private initFiltersMap(): void {
    this.mapService.initializeMap("map", this.selectedCity[0], 14);

    this.enableLivePolygonMerge();

    this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
      addToEditableLayers: true,
      addToMap: false,
      enableLabelEditing: false,
    });

    console.log(this.apiServices.storedLayers);
    // segna che qualcosa è già stato disegnato
    this.isDrawn = this.apiServices.storedLayers.length > 0;
    this.lastSimplified = 0;

    // svuota l'array temporaneo dei layer
    this.apiServices.storedLayers = [];
  }

  /**
   * Dissolves polygon drawings immediately after each new draw.
   */
  private enableLivePolygonMerge(): void {
    const map = this.mapService.getMap();
    if (!map) {
      return;
    }

    map.on('draw:created', (e: any) => {
      const layer = e.layer;

      // Simplify polygons immediately when drawn
      if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) {
        const geoJson = layer.toGeoJSON();
        if (geoJson.geometry && geoJson.geometry.type === 'Polygon') {
          const originalVertexCount = this.countPolygonVertices(geoJson);
          try {
            const simplified = turf.simplify(geoJson, { tolerance: 0.0001, highQuality: false });
            const simplifiedVertexCount = this.countPolygonVertices(simplified);

            if (simplifiedVertexCount < originalVertexCount) {
              this.lastSimplified = this.showSimplificationWarning(originalVertexCount, simplifiedVertexCount);
            }

            const simplifiedLayer = L.geoJSON(simplified, {
              style: { color: '#3388ff', opacity: 0.5, weight: 4 }
            }).getLayers()[0] as L.Polygon;
            this.mapService.addEditableLayer(simplifiedLayer);
          } catch (error) {
            console.warn('Failed to simplify drawn polygon:', error);
            this.mapService.addEditableLayer(layer);
          }
        } else {
          this.mapService.addEditableLayer(layer);
        }
      } else {
        this.mapService.addEditableLayer(layer);
      }

      setTimeout(() => this.mergeEditablePolygonsNow(), 0);
    });
  }

  /**
   * Replaces all current polygon layers with their dissolved union.
   */
  private mergeEditablePolygonsNow(): void {
    const editableLayers = this.mapService.getEditableLayers();
    if (!editableLayers) {
      return;
    }

    const polygonLayers: any[] = [];
    const polygonFeatures: any[] = [];

    editableLayers.eachLayer((layer: any) => {
      if (!(layer instanceof L.Polygon) && !(layer instanceof L.Circle)) {
        return;
      }

      let feature: any;
      if (layer instanceof L.Circle) {
        // Convert circle to polygon
        const center = layer.getLatLng();
        const radius = layer.getRadius(); // in meters
        const radiusKm = radius / 1000; // convert to km for turf
        feature = turf.circle([center.lng, center.lat], radiusKm, { steps: 64 });
      } else {
        feature = layer.toGeoJSON();
      }

      if (!feature || !feature.geometry) {
        return;
      }

      const geometryType = String(feature.geometry.type || '');
      if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
        return;
      }

      polygonLayers.push(layer);
      polygonFeatures.push(feature);
    });

    if (polygonFeatures.length <= 1) {
      return;
    }

    let mergedFeature = polygonFeatures[0];
    for (let index = 1; index < polygonFeatures.length; index++) {
      const unionResult = turf.union(mergedFeature as any, polygonFeatures[index] as any);
      mergedFeature = unionResult || mergedFeature;
    }

    // Simplify the merged geometry to reduce point count
    const originalVertexCount = this.countPolygonVertices(mergedFeature);
    try {
      mergedFeature = turf.simplify(mergedFeature, { tolerance: 0.0001, highQuality: false });
      const simplifiedVertexCount = this.countPolygonVertices(mergedFeature);

      if (simplifiedVertexCount < originalVertexCount) {
        this.lastSimplified = this.showSimplificationWarning(originalVertexCount, simplifiedVertexCount);
      }
    } catch (error) {
      console.warn('Failed to simplify merged geometry:', error);
    }

    polygonLayers.forEach((layer: any) => {
      editableLayers.removeLayer(layer);
    });

    const mergedLayer = L.geoJSON(mergedFeature, {
      style: {
        color: '#3388ff',
        opacity: 0.5,
        weight: 4,
      },
    });

    mergedLayer.eachLayer((layer: any) => {
      this.mapService.addEditableLayer(layer);
    });

    this.checkDrawing();
  }
  /**
   * Checks if there are any drawings on the map and updates isDrawn flag
   */
  public checkDrawing(): void {
    const editableLayers = this.mapService.getEditableLayers();
    this.isDrawn = editableLayers && editableLayers.getLayers().length > 0;
    this.mapService.updateInfoControl(this.getTotalVertexCount(), this.lastSimplified);
  }

  /**
   * Gets total vertex count of all polygons in editable layers
   */
  private getTotalVertexCount(): number {
    const editableLayers = this.mapService.getEditableLayers();
    if (!editableLayers) return 0;

    let total = 0;
    editableLayers.eachLayer((layer: any) => {
      if (layer instanceof L.Polygon) {
        const geoJson = layer.toGeoJSON();
        total += this.countPolygonVertices(geoJson);
      }
    });
    return total;
  }

  /**
   * Counts total vertices in a polygon geometry
   */
  private countPolygonVertices(geoJson: any): number {
    if (!geoJson || !geoJson.geometry || geoJson.geometry.type !== 'Polygon') {
      return 0;
    }

    let count = 0;
    // Count vertices in all rings (outer + inner rings)
    geoJson.geometry.coordinates.forEach((ring: number[][]) => {
      count += ring.length;
    });
    return count;
  }

  /**
   * Shows a warning when polygon simplification reduces vertex count
   */
  private showSimplificationWarning(originalCount: number, simplifiedCount: number): number {
    const reduction = originalCount - simplifiedCount;
    const reductionPercent = Math.round((reduction / originalCount) * 100);

    if (reductionPercent > 10) { // Only show warning for significant reductions
      const message = this.translate.instant('polygon_simplified_warning',
        { original: originalCount, simplified: simplifiedCount, reduction: reductionPercent });
    }

    return reductionPercent > 0 ? reductionPercent : 0;
  }

  // Usage: call checkDrawing() to check if there are drawings on the map.

  /**
   * Checks inside the layers created by leaflet. If criteria are met,
   * stores them in an array.
   */
  saveDrawings() {
    const rawLayers = this.mapService.serializeDrawings();
    // Simplify geometries to reduce point count for Orion-LD
    this.apiServices.storedLayers = rawLayers.map((layer: any) => {
      if (layer && layer.geometry && (layer.geometry.type === 'Polygon' || layer.geometry.type === 'MultiPolygon')) {
        const originalVertexCount = this.countPolygonVertices(layer);
        try {
          const simplified = turf.simplify(layer, { tolerance: 0.0001, highQuality: false });
          const simplifiedVertexCount = this.countPolygonVertices(simplified);

          if (simplifiedVertexCount < originalVertexCount) {
            this.lastSimplified = this.showSimplificationWarning(originalVertexCount, simplifiedVertexCount);
          }

          return simplified;
        } catch (error) {
          console.warn('Failed to simplify geometry:', error);
          return layer;
        }
      }
      return layer;
    });
  }

  /**
   * Step3 map rendering
   */

  //store here the layers to be added to the map
  markersOverlay: any = {};

  //map for step3
  public initFinalMap(): void {
    this.mapService.initializeMapWithOverlays("map", this.selectedCity[0], this.markersOverlay, 14);

    const map = this.mapService.getMap();
    if (map) {
      this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
        addToEditableLayers: false,
        addToMap: true,
        enableLabelEditing: false,
      });
    }
  }


  ngOnInit() {
    switchLanguage(getCookie("language"), this.translate);

    // Load cities from API
    this.loadCities();

    //Form group and control for the radio selection in step 1
    this.firstForm = new FormGroup({
      cityOptions: new FormControl(null, Validators.required),
    });

    //Form group and control for the checkbox in step 2
    this.filtersForm = new FormGroup({
      filters: new FormControl(null),
    });

    //Form group and controls for saving name and description in the form in step 3
    //controls for name and description saving
    this.nameInput = new FormControl("", Validators.required);
    this.descriptionInput = new FormControl("");
    this.autoUpdateCheckbox = new FormControl(false);
    this.cronTimer = new FormControl(1);

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

    /*
    //OLD ICON: fill the icons array with entries from the iconUrls
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
  }

  /**
   * Stepper controls
   */

  @ViewChild("stepper")
  stepper: NbStepperComponent;
  changeEvent: NbStepChangeEvent;

  onStepChange(event: any) {
    // The event object contains information about the current step and previous step.
    // You can access them as follows:
    this.changeEvent = event;

    switch (this.stepper.selectedIndex) {
      //step 1
      case 0:
        //emptying filters everytime the city selection step renders
        this.filters = [];
        this.selectedFilter = [];
        this.filtersForm.reset();
        this.loading = false;
        this.apiServices.destroyCalls();
        this.filtersForm.reset();
        this.resetSubFilters();
        // Clear any stored layers from previous sessions
        this.apiServices.storedLayers = [];
        this.lastSimplified = 0;
        break;
      //step 2
      case 1:
        this.apiServices.cronMultipoint = [];
        this.apiServices.cronMultipolygon = [];
        this.apiServices.destroyCalls();
        this.queryDetails.polygons = [];
        this.queryDetails.circles = [];
        this.isDrawn = false;
        this.hidingAlerts = true;
        this.lastSimplified = 0;
        this.clearMap();
        setTimeout(() => this.initFiltersMap(), 300);
        break;
      //step 3
      case 2:
        this.clearMap();
        setTimeout(() => this.initFinalMap(), 300);
        break;
      //step 4 - Save
      case 3:
        // No map needed for save step
        break;
    }
  }

  //flag to show alert in case of empty layers
  public emptyLayers = false;
  //flag to count layers that have at least one result
  public filledLayers = 0;
  //function to check if our research has given any empty layer
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

  /**
   * functions called on step 1 submit (selecting region)
   */

  async onFirstSubmit() {
    this.citySelected = this.selectedCity[1].length > 0;

    if (!this.citySelected || this.firstForm.status === "INVALID") return;

    // Coordinates of the point we want to center the map inside the city
    const cityCoordinates = this.selectedCity[0];
    this.queryDetails.city = this.selectedCity[1];
    this.queryDetails.center = cityCoordinates;

    this.loading = true; // spinner on

    try {
      // fetch filters from API
      this.formData = await this.apiServices.getFilters(this.queryDetails.city);

      // reset filters array
      this.filters = [];

      // push main filter types for the selected city
      this.formData.controls.forEach((element: any) => {
        if (element.city === this.queryDetails.city) {
          this.filters.push(element.type);
        }
      });

      // go to next step
      this.stepper.next();
    } catch (error) {
      console.error("API call failed:", error);
    } finally {
      this.loading = false; // spinner off
    }
  }


  //filters fetched from API
  filters = [];

  //filters selected by the user
  selectedFilter = [];

  //
  subFilters = [];

  //
  selectedSubFilters = [];

  //called when changing the select
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

  imgSrc(icon: string) {
    // If it's a URL, use it directly
    if (icon.startsWith('http://') || icon.startsWith('https://')) {
      return icon;
    }

    // Otherwise, look up named icons
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
    //settimeout is not needed here, but is for matching the function in edit layer
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
   * function called on step 2 submit (selecting filters and drawing areas)
   */
  async onFiltersFormSubmit() {
    var layer: any;
    //empting markersOverlay and objects in ApiServices, so they are ready to receive new data
    this.markersOverlay = {};
    this.apiServices.markers = {};
    this.apiServices.elements = {};
    this.isDrawn && /* this.isFilterOn && */ this.saveDrawings();
    //for each area drawn by the user and stored inside saveDrawings
    for (layer of this.apiServices.storedLayers) {
      if (!layer.properties.radius) {
        //push a number inside the array so it knows at least one polygon has been created
        this.queryDetails.polygons.length < 1 &&
          this.queryDetails.polygons.push({
            type: layer.geometry.type || 'Polygon',
            coordinates: layer.geometry.coordinates,
            external: false,
          });
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

      // ✅ default filters
      const filter = this.queryDetails.filter || null;
      const subfilter = this.queryDetails.subFilters || [];

      if (this.queryDetails.circles.length !== 0 && subfilter.length > 0) {
        await this.apiServices.getPointRadiusData({
          city: this.queryDetails.city,
          filter: this.queryDetails.filter,
          subfilter: this.queryDetails.subFilters,
          multipoint: this.queryDetails.circles,
        });
      }
      if (this.queryDetails.polygons.length !== 0 && subfilter.length > 0) {
        // Make the API call with the prepared data
        await this.apiServices.getPolygonData({
          city: this.queryDetails.city,
          filter: this.queryDetails.filter,
          subfilter: this.queryDetails.subFilters,
        });
      }

      Object.entries(this.apiServices.markers).forEach((element: any) => {
        let filterName = element[0];
        this.markersOverlay[filterName]
          ? this.markersOverlay[filterName].addLayers(element[1].getLayers())
          : (this.markersOverlay[filterName] = element[1]);
      });

      if (this.queryDetails.subFilters.length === 0 || this.queryDetails.filter.length === 0) {
        this.apiServices.setProgress(100);
        this.progress = 100;          // ensure loading mask hides
        this.checkEmptyLayers();       // show map (empty if nothing returned)
      }

      this.loading = false;
      this.isDrawn
        // && this.isFilterOn
        ? this.stepper.next()
        : (this.hidingAlerts = false);
    } catch (error) {
      // Show a message in case of error
      this.loading = false;
      console.error("API call failed:", error);
    }
  }

  /**
   * Submit of step 3 - store drawn areas inside queryDetails
   */
  onThirdSubmit() {
    this.queryDetails.layers = [];
    this.apiServices.storedLayers.forEach((layer) => {
      this.queryDetails.layers.push(JSON.stringify(layer));
    });
  }

  /**
   * Step 4 submit
   */
  async onFourthSubmit(): Promise<string | void> {
    this.queryDetails.queryName = this.saveForm.value.nameInput;
    this.queryDetails.queryDescription = this.saveForm.value.descriptionInput;
    this.queryDetails.cronJob = this.saveForm.value.autoUpdateCheckbox;
    this.queryDetails.cronRepetition = this.saveForm.value.cronTimer;
    try {
      if (this.queryDetails.queryName.length !== 0) {
        // Make the API call with the prepared data
        const rawId = await this.apiServices.saveSearch(this.queryDetails);
        const newId: string = typeof rawId === 'string' ? rawId : String(rawId);

        if (this.queryDetails.cronJob === true) {
          let idAndRep = {
            id: newId,
            repeat: this.queryDetails.cronRepetition,
          };
          await this.apiServices.setCronJob(idAndRep);
        }

        // Return the new id to allow caller to navigate elsewhere
        return newId;
      }
    } catch (error) {
      this.loading = false;
      // Show a message in case of error
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
    saveAs(blob, `${this.selectedCity[1]}.geojson`);
  }

  async saveAndGoHome() {
    await this.onFourthSubmit(); // save the form
    // navigate to Home page (adjust route)
    this.router.navigate(['/home']);
  }

  async saveAndStartAnalysis() {
    const newId = await this.onFourthSubmit();
    if (!newId) {
      return;
    }

    localStorage.setItem('projectId', newId);
    this.router.navigate(['/pages/analysis-layer']);
  }
}
