import { Injectable } from '@angular/core';
import { NbDialogService } from '@nebular/theme';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment.prod';
import { DialogComponent } from '../pages/dialog/dialog.component';
import { ApiCronService, ApiProjectService, ApiSearchService, MarkerFactoryService } from './api';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  public baseUrl = (window.env && window.env.apiUrl) || environment.base_url;

  public iconUrls = {
    default:'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg',
    bench: 'https://cdn-icons-png.flaticon.com/512/5962/5962925.png',
    bin: 'https://cdn-icons-png.flaticon.com/512/5733/5733606.png',
    caution: 'https://cdn-icons-png.flaticon.com/512/5087/5087907.png',
    cone: 'https://cdn-icons-png.flaticon.com/512/7899/7899459.png',
    danger: 'https://cdn-icons-png.flaticon.com/512/6069/6069788.png ',
    escalators: 'https://cdn-icons-png.flaticon.com/512/5761/5761074.png',
    flowers: 'https://cdn-icons-png.flaticon.com/512/8650/8650660.png',
    hazard: 'https://cdn-icons-png.flaticon.com/512/5732/5732835.png',
    heart: 'https://cdn-icons-png.flaticon.com/512/5750/5750255.png',
    hospital: 'https://cdn-icons-png.flaticon.com/512/5029/5029099.png',
    hydrant: 'https://cdn-icons-png.flaticon.com/512/6269/6269344.png',
    leaf: 'https://cdn-icons-png.flaticon.com/512/7672/7672367.png',
    litter: 'https://cdn-icons-png.flaticon.com/512/5013/5013751.png',
    park: 'https://cdn-icons-png.flaticon.com/512/5739/5739461.png',
    road: 'https://cdn-icons-png.flaticon.com/512/6015/6015923.png',
    tap: 'https://cdn-icons-png.flaticon.com/512/6017/6017725.png',
    train: 'https://cdn-icons-png.flaticon.com/512/8325/8325690.png',
    tree: 'https://cdn-icons-png.flaticon.com/512/6015/6015592.png',
    toilet: 'https://cdn-icons-png.flaticon.com/512/6217/6217476.png',
    visibility: 'https://cdn-icons-png.flaticon.com/512/5444/5444292.png',
  };

  clusterOptions = {
    disableClusteringAtZoom: 19,
  };

  public storedLayers = [];
  elements = {};
  markers = {};
  polygons = {};
  allProjects = [];

  nominalProgress = 0;
  totalProgress = 0;
  private progressSource = new BehaviorSubject<number>(0);
  progress$ = this.progressSource.asObservable();

  cronMultipoint = [];
  cronMultipolygon = [];

  protected ngUnsubscribe: Subject<void> = new Subject<void>();

  constructor(
    private dialogService: NbDialogService,
    private markerFactory: MarkerFactoryService,
    private apiSearchService: ApiSearchService,
    private apiProjectService: ApiProjectService,
    private apiCronService: ApiCronService
  ) {}

  /**
   * Updates the shared progress stream used by UI progress bars.
    * @param value Progress percentage.
   */
  setProgress(value: number) {
    this.progressSource.next(value);
  }

  /**
   * Cancels and resets all in-flight request subscriptions.
   */
  public destroyCalls(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
    this.ngUnsubscribe = new Subject<void>();
  }

  /**
   * Submits an analysis payload.
    * @param url Target endpoint URL.
    * @param payload Request body.
    * @returns Promise resolved with analysis response.
   */
  public submitAnalysis(url: string, payload: any): Promise<any> {
    return this.apiSearchService.submitAnalysis(url, payload, this.ngUnsubscribe);
  }

  /**
   * Returns available city options for query setup.
    * @returns Promise resolved with city options.
   */
  async getCitiesFromApi(): Promise<{ value: [[number, number], string]; label: string }[]> {
    return this.apiSearchService.getCitiesFromApi();
  }

  /**
   * Stores a returned feature and creates its map layer.
    * @param element Feature payload.
    * @param filter Selected filter tuple.
   */
  saveElement(element: any, filter: any) {
    const label = filter[0];

    let iconUrl: string;
    if (Array.isArray(filter[1])) {
      iconUrl = filter[1][2] || 'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg';
    } else {
      iconUrl = filter[1] || 'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg';
    }

    if (!this.elements[label]) {
      this.elements[label] = [];
    }

    this.elements[label].push(element);
    this.createMarker(element, label, iconUrl);
  }

  /**
   * Lists all filter labels currently present in the elements map.
    * @returns Array of label keys.
   */
  getElements() {
    return Object.getOwnPropertyNames(this.elements);
  }

  /**
   * Resolves a filter icon key into an absolute icon URL.
    * @param icon Icon key or URL.
    * @returns Resolved icon URL.
   */
  imgSrc(icon: string) {
    return this.markerFactory.resolveIconSource(icon, this.iconUrls);
  }

  /**
   * Creates and adds a marker/polygon/polyline for a feature.
    * @param element Feature payload.
    * @param label Feature label.
    * @param icon Icon key or URL.
   */
  createMarker(element: any, label: string, icon: string) {
    this.markerFactory.createAndAddLayer(
      element,
      icon,
      this.iconUrls,
      this.markers[label],
      (selectedElement: any) => this.openMarkerInfo(selectedElement)
    );
  }

  /**
   * Opens the detailed info dialog for a selected feature.
    * @param element Feature payload.
   */
  openMarkerInfo(element: any) {
    this.dialogService.open(DialogComponent, {
      context: {
        title: 'Detailed info:',
        body: {
          type: element.properties.type,
          agency_responsible: element.properties?.agency_responsible,
          description: element.properties?.description,
          location: `${element.properties.location?.coordinates[0]}, ${element.properties.location?.coordinates[1]} `,
          requested_at: element.properties.requested_datetime?.value,
          update: element.properties.updated_datetime?.value,
          service_code: element.properties?.service_code,
          service_name: element.properties.service_name?.value,
          status: element.properties?.status,
          status_notes: element.properties?.status_notes,
        },
      },
    });
  }

  /**
   * Retrieves configured filters for a city.
    * @param city Selected city.
    * @param testData Optional mock input for tests.
    * @returns Promise resolved with filter controls.
   */
  public async getFilters(city: string, testData?: any): Promise<any> {
    return this.apiSearchService.getFilters(city, this.ngUnsubscribe, testData);
  }

  /**
   * Loads filter configuration from local JSON assets.
    * @returns Promise resolved with filter JSON.
   */
  public getFiltersFromJson(): Promise<any> {
    return this.apiSearchService.getFiltersFromJson();
  }

  /**
   * Executes polygon-based search against backend services.
    * @param body Search body.
    * @returns Promise resolved with search result.
   */
  public getPolygonData(body: { city: string; filter: string[]; subfilter: any }) {
    return this.apiSearchService.getPolygonData(body, this.buildSearchContext());
  }

  /**
   * Executes point+radius based search against backend services.
    * @param body Search body.
    * @returns Promise resolved with search result.
   */
  public getPointRadiusData(body: any): any {
    return this.apiSearchService.getPointRadiusData(body, this.buildSearchContext());
  }

  /**
   * Saves a new project document.
    * @param queryDetails Project payload.
    * @returns Promise resolved with save response.
   */
  public async saveSearch(queryDetails: any) {
    return this.apiProjectService.saveSearch(queryDetails, this.buildProjectContext());
  }

  /**
   * Updates an existing project document.
    * @param queryDetails Project payload.
    * @returns Promise resolved with update response.
   */
  public async updateSearch(queryDetails: any) {
    return this.apiProjectService.updateSearch(queryDetails, this.buildProjectContext());
  }

  /**
   * Loads a project by id and restores overlays.
    * @param id Project id array.
    * @returns Promise resolved with project data.
   */
  public getDocument(id: string[]) {
    return this.apiProjectService.getDocument(id, this.buildProjectContext());
  }

  /**
   * Retrieves all projects for listing pages.
    * @returns Promise resolved with project summaries.
   */
  public getAll() {
    return this.apiProjectService.getAll(this.buildProjectContext());
  }

  /**
   * Creates a cron schedule for a project.
    * @param idAndRep Document id + repeat config.
    * @returns Promise resolved with backend response.
   */
  public setCronJob(idAndRep: any) {
    return this.apiCronService.setCronJob(idAndRep, this.cronMultipolygon, this.cronMultipoint, this.ngUnsubscribe);
  }

  /**
   * Updates an existing cron schedule for a project.
    * @param idAndRep Document id + repeat config.
    * @returns Promise resolved with backend response.
   */
  public updateCronJobs(idAndRep: any) {
    return this.apiCronService.updateCronJobs(idAndRep, this.cronMultipolygon, this.cronMultipoint, this.ngUnsubscribe);
  }

  /**
   * Retrieves cron details for a project.
    * @param id Cron id.
    * @returns Promise resolved with cron data.
   */
  public getCron(id: string) {
    return this.apiCronService.getCron(id);
  }

  /**
   * Deletes a cron schedule by id.
    * @param id Cron id.
    * @returns Promise resolved when deletion completes.
   */
  public deleteCron(id: string) {
    return this.apiCronService.deleteCron(id);
  }

  /**
   * Deletes a project document by id.
    * @param id Project id.
    * @returns Promise resolved when deletion completes.
   */
  public deleteEntry(id: string) {
    return this.apiProjectService.deleteEntry(id);
  }

  /**
   * Sends project data to IDRA.
    * @param id Project id.
    * @returns Promise resolved with IDRA response.
   */
  public async sendToIdra(id: string) {
    return this.apiProjectService.sendToIdra(id);
  }

  /**
   * Builds the shared state/context object consumed by ApiSearchService.
    * @returns Mutable search context object.
   */
  private buildSearchContext() {
    return {
      storedLayers: this.storedLayers,
      markers: this.markers,
      elements: this.elements,
      clusterOptions: this.clusterOptions,
      cronMultipoint: this.cronMultipoint,
      cronMultipolygon: this.cronMultipolygon,
      ngUnsubscribe: this.ngUnsubscribe,
      setProgress: (value: number) => this.setProgress(value),
      saveElement: (element: any, filter: any) => this.saveElement(element, filter),
      setNominalProgress: (value: number) => {
        this.nominalProgress = value;
      },
      getNominalProgress: () => this.nominalProgress,
      setTotalProgress: (value: number) => {
        this.totalProgress = value;
      },
      getTotalProgress: () => this.totalProgress,
    };
  }

  /**
   * Builds the shared state/context object consumed by ApiProjectService.
    * @returns Mutable project context object.
   */
  private buildProjectContext() {
    return {
      elements: this.elements,
      markers: this.markers,
      allProjects: this.allProjects,
      clusterOptions: this.clusterOptions,
      ngUnsubscribe: this.ngUnsubscribe,
      saveElement: (element: any, filter: any) => this.saveElement(element, filter),
    };
  }
}
