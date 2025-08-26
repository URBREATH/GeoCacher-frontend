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
      let data: any = await this.apiServices.getSearch(id);
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
        case "Helsinki":
          this.centerCityFromApi = [60.1699, 24.9384];
          break;
        case "Santander":
          this.centerCityFromApi = [43.462776, -3.805];
          break;
        case "Flanders":
          this.centerCityFromApi = [51.0501, 3.7303];
          break;
        case "ghent-lez":
          this.centerCityFromApi = [51.0501, 3.7303];
          break;
        case "leuven":
          this.centerCityFromApi = [50.8823, 4.7138];
          break;
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
