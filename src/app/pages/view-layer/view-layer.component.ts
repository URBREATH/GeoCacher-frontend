import { Component, OnInit, TemplateRef } from "@angular/core";
import * as L from "leaflet";
import { ApiService } from "../../services/api.service";
import { MapService } from "../../services/map.service";
import { TranslateService } from "@ngx-translate/core";
import { NbDialogService } from "@nebular/theme";
import { getCookie, switchLanguage, getCityCoordinates } from '../../shared/layer-utils';

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
    private mapService: MapService,
    private translate: TranslateService,
    private dialogService: NbDialogService
  ) {}

  centerCityFromApi: any = [];
  /**
   * Initializes the map.
   */
  private initMap(): void {
    this.map = this.mapService.initializeMapWithOverlays(
      "map",
      this.centerCityFromApi,
      this.markersOverlay,
      12
    );

    this.mapService.loadStoredLayers(this.apiServices.storedLayers, {
      addToEditableLayers: false,
      addToMap: true,
      enableLabelEditing: false,
    });

    this.fitMapToVisibleLayers();
  }

  /**
   * Fits the map to visible non-tile layers when available.
   */
  private fitMapToVisibleLayers(): void {
    if (!this.map) {
      return;
    }

    let combinedBounds: L.LatLngBounds | null = null;

    this.map.eachLayer((layer: any) => {
      if (layer === this.osm) {
        return;
      }

      if (typeof layer.getBounds === 'function') {
        const layerBounds = layer.getBounds();
        if (layerBounds && layerBounds.isValid && layerBounds.isValid()) {
          combinedBounds = combinedBounds ? combinedBounds.extend(layerBounds) : layerBounds;
        }
        return;
      }

      if (typeof layer.getLatLng === 'function') {
        const latLng = layer.getLatLng();
        if (latLng) {
          combinedBounds = combinedBounds
            ? combinedBounds.extend(latLng)
            : L.latLngBounds(latLng, latLng);
        }
      }
    });

    if (combinedBounds && combinedBounds.isValid()) {
      this.map.fitBounds(combinedBounds, { padding: [20, 20] });
    }
  }

  /**
   * Initializes the component.
   */
  async ngOnInit() {
    switchLanguage(getCookie("language"), this.translate);
      this.loading = false;
    this.apiServices.destroyCalls();
    let id = [];
    id.push(localStorage.getItem("projectId"));
    try {
      this.loading = true;
      this.apiServices.elements = {};
      this.apiServices.markers = {};
      this.apiServices.storedLayers = [];
      // Fetch data from the API.
      let data: any = await this.apiServices.getDocument(id);
      this.markersOverlay = this.apiServices.markers;
      data.layers.forEach((layer: string) =>
        this.apiServices.storedLayers.push(JSON.parse(layer))
      );
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
      this.centerCityFromApi = getCityCoordinates(data.city);
    } catch (error) {
      // Handle API call failure.
      this.loading = false;
      console.error("API call failed:", error);
    }

    // Initialize the map after fetching data.
    this.initMap();
  }
}
