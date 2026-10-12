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
  private readonly defaultIconUrl = 'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg';
  private readonly iconConfigUrl = 'https://raw.githubusercontent.com/OPSILab/Icon_config/main/noto_emoji.json';
  private iconConfigLoadPromise: Promise<void> | null = null;

  public iconUrls: { [key: string]: string } = {
    default: this.defaultIconUrl,
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
  ) {
    this.iconConfigLoadPromise = this.loadIconUrls();
  }

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

    const filterData = Array.isArray(filter[1]) ? filter[1] : [];
    const iconCandidate = Array.isArray(filter[1]) ? filterData[2] : filter[1];
    const valueCandidate = Array.isArray(filter[1]) ? filterData[1] : undefined;
    const iconUrl = this.resolveBestIcon(iconCandidate, label, valueCandidate);

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
    await this.ensureIconConfigLoaded();
    const data = await this.apiSearchService.getFilters(city, this.ngUnsubscribe, testData);
    this.normalizeFilterIcons(data);
    return data;
  }

  /**
   * Loads filter configuration from local JSON assets.
    * @returns Promise resolved with filter JSON.
   */
  public getFiltersFromJson(): Promise<any> {
    return this.ensureIconConfigLoaded().then(() => this.apiSearchService.getFiltersFromJson());
  }

  /**
   * Ensures icon configuration is loaded once before icon selection is rendered.
   */
  private async ensureIconConfigLoaded(): Promise<void> {
    if (!this.iconConfigLoadPromise) {
      this.iconConfigLoadPromise = this.loadIconUrls();
    }

    await this.iconConfigLoadPromise;
  }

  /**
   * Loads selectable icon URLs from the OPSILab icon configuration.
   */
  private async loadIconUrls(): Promise<void> {
    try {
      const response = await fetch(this.iconConfigUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load icon config: ${response.status}`);
      }

      const payload = await response.json();
      const normalized: { [key: string]: string } = {};

      if (payload && typeof payload === 'object') {
        Object.entries(payload).forEach(([key, value]) => {
          if (typeof value !== 'string') return;
          const trimmed = value.trim();
          if (!trimmed) return;
          normalized[key] = this.fixNotoEmojiUrl(trimmed);
        });
      }

      // Always use the known-good hardcoded default; the remote config's "default" entry
      // has been broken before (e.g. after the noto-emoji repo restructured its paths).
      normalized.default = this.defaultIconUrl;

      if (Object.keys(normalized).length > 0) {
        this.iconUrls = normalized;
      }
    } catch (error) {
      this.iconUrls = { default: this.defaultIconUrl };
      console.warn('Unable to load dynamic icon config. Using default icon only.', error);
    }
  }

  /**
   * Rewrites outdated googlefonts/noto-emoji raw URLs to their current path.
   * The upstream repo moved its SVGs from "svg/emoji_u*.svg" to "2D/svg/emoji_u*.svg"
   * on 2026-09-17; the OPSILab config was never updated to match.
   */
  private fixNotoEmojiUrl(url: string): string {
    return url.replace(
      /^(https:\/\/raw\.githubusercontent\.com\/googlefonts\/noto-emoji\/main\/)svg\//,
      '$12D/svg/'
    );
  }

  /**
   * Normalizes each filter value icon against the loaded icon map.
   */
  private normalizeFilterIcons(data: any): void {
    const controls = Array.isArray(data?.controls) ? data.controls : [];

    controls.forEach((control: any) => {
      const filters = Array.isArray(control?.filters) ? control.filters : [];
      filters.forEach((filter: any) => {
        const values = Array.isArray(filter?.values) ? filter.values : [];
        values.forEach((value: any) => {
          if (!value || value.icon === 'disabled') return;
          value.icon = this.resolveBestIcon(value.icon, value.label, value.value);
        });
      });
    });
  }

  /**
   * Picks the best icon key/url from explicit icon, value and label; falls back to default.
   *
   * The backend builds iconify.design URLs by concatenating the raw OSM category name
   * (e.g. "Waterway_Drain", "park8769750"), which often does not match any real Lucide
   * icon slug and 404s. Those URLs are only trusted when they resolve to a curated
   * iconUrls entry; otherwise this falls back to 'default' instead of the broken URL.
   */
  private resolveBestIcon(icon: any, label?: string, value?: string): string {
    const map = this.iconUrls || {};
    const mapEntries = Object.entries(map);
    const mapKeys = new Set(Object.keys(map));

    const normalizeKey = (input: any): string => String(input ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');

    // Strips a trailing numeric OSM id suffix, e.g. "park8769750" -> "park".
    const stripTrailingId = (input: any): string => normalizeKey(input).replace(/[0-9]+$/, '');

    const rawIcon = String(icon ?? '').trim();
    if (rawIcon === 'disabled') return rawIcon;

    const isIconifyUrl = /^https?:\/\/api\.iconify\.design\//i.test(rawIcon);
    const urlIconName = isIconifyUrl ? (rawIcon.split('/').pop() || '').replace(/\.svg$/i, '') : '';

    const keyCandidates = [
      rawIcon,
      normalizeKey(rawIcon),
      stripTrailingId(rawIcon),
      urlIconName,
      normalizeKey(urlIconName),
      stripTrailingId(urlIconName),
      value,
      normalizeKey(value),
      stripTrailingId(value),
      label,
      normalizeKey(label),
    ]
      .map(candidate => String(candidate ?? '').trim())
      .filter(candidate => candidate.length > 0);

    for (const candidate of keyCandidates) {
      if (mapKeys.has(candidate)) {
        return candidate;
      }
    }

    if (rawIcon.startsWith('http://') || rawIcon.startsWith('https://')) {
      const byUrl = mapEntries.find(([, url]) => String(url).trim() === rawIcon);
      if (byUrl) return byUrl[0];

      if (isIconifyUrl) {
        // Unresolved iconify.design URL: almost certainly a 404, use the default icon instead.
        console.warn(`No curated icon found for "${label ?? value ?? rawIcon}" (icon URL: ${rawIcon}). Falling back to default.`);
        return 'default';
      }

      return rawIcon;
    }

    return 'default';
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
