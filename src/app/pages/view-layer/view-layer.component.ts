import { Component, OnInit, TemplateRef } from "@angular/core";
import * as L from "leaflet";
import "../../../../node_modules/leaflet-draw/dist/leaflet.draw-src.js";
import { ApiService } from "../../services/api.service";
import { TranslateService } from "@ngx-translate/core";
import { NbDialogService } from "@nebular/theme";

@Component({
  selector: "ngx-view-layer",
  templateUrl: "./view-layer.component.html",
  styleUrls: ["./view-layer.component.scss"],
})
export class ViewLayerComponent implements OnInit {
  // Define map and markersOverlay as class properties with appropriate types.
  private map: L.Map;
  private markersOverlay: { [key: string]: L.Layer } = {};
  //controls spinner
  loading: boolean = false;

  // Define the OpenStreetMap (osm) layer.
  private osm: L.TileLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a> | &copy; <a href='https://www.flaticon.com/authors/smashingstocks'>smashingstocks - Flaticon</a>",
    }
  );

  title: string;
  description: string;
  creation: string;
  lastUpdate: string;
  cronID: string = "";
  cronJob: any;
  updateTime: string;
  onIDRA: boolean;

  constructor(
    private apiServices: ApiService,
    private translate: TranslateService,
    private dialogService: NbDialogService
  ) {}

  centerCityFromApi: any = [];
  /**
   * Initializes the map.
   */
  private initMap(): void {
    this.map = L.map("map", {
      center: this.centerCityFromApi,
      zoom: 12,
      layers: [this.osm],
    });

    // Layer control lets you select which layers you want to see.
    L.control.layers(null, this.markersOverlay).addTo(this.map);

    // Add each overlay to the map.
    for (const key in this.markersOverlay) {
      if (this.markersOverlay.hasOwnProperty(key)) {
        this.markersOverlay[key].addTo(this.map);
      }
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

  /**
   * Initializes the component.
   */
  async ngOnInit() {
    this.switchLanguage(this?.getCookie("language"));
    this.loading = false;
    this.apiServices.destroyCalls();
    let id = [];
    id.push(localStorage.getItem("projectId"));
    try {
      this.loading = true;
      this.apiServices.elements = {};
      this.apiServices.markers = {};
      // Fetch data from the API.
      let data: any = await this.apiServices.getDocument(id);
      this.markersOverlay = this.apiServices.markers;
      data.cron_id === null ? (this.cronID = "") : (this.cronID = data.cron_id);
      this.cronID === ""
        ? null
        : (this.cronJob = await this.apiServices.getCron(this.cronID));
      switch (this.cronJob?.repeat) {
        case 1:
          this.updateTime = "1 hr";
          break;
        case 12:
          this.updateTime = "12 hrs";
          break;
        case 24:
          this.updateTime = "24 hrs";
          break;
        case 168:
          this.updateTime = "1 week";
          break;
        default:
          this.updateTime = "";
      }
      this.lastUpdate = this.cronJob?.data_last_execution;
      this.title = data.name;
      this.description = data.description;
      this.creation = data.dateCreation;
      this.loading = false;
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
    } catch (error) {
      // Handle API call failure.
      this.loading = false;
      console.error("API call failed:", error);
    }

    // Initialize the map after fetching data.
    this.initMap();
  }
}
