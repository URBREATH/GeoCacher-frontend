import { Component, OnDestroy, OnInit } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { TranslateService, LangChangeEvent } from "@ngx-translate/core";
import { Router } from "@angular/router";
import { AnalysisAvailabilityService } from "../../services/analysis-availability.service";
import { Subject, Subscription, timer } from "rxjs";
import { switchMap, takeUntil } from "rxjs/operators";
import {
  GeoServerPublicationResponse,
  IdraGeoserverDistributionResponse,
  IdraPublishResponse,
} from "../../services/api/api-project.service";

type GeoServerPublicationState = "idle" | "pending" | "running" | "completed" | "failed" | string;

@Component({
  selector: "ngx-available-options",
  templateUrl: "./available-options.component.html",
  styleUrls: ["./available-options.component.scss"],
})
export class AvailableOptionsComponent implements OnInit, OnDestroy {

  projects: any[] = [];

  loading: boolean = false;
  idraLoading: boolean = false;

  isStandAlone: boolean = false;
  isAuthenticated: boolean = false;

  deleteConfirmationId = "";
  sendIdraId = "";
  addGeoserverDistributionId = "";
  updateGeoserverPublicationId = "";
  publicationWizardProject: any = null;
  geoserverPublishStateByProjectId: Record<string, GeoServerPublicationState> = {};
  geoserverPublishErrorByProjectId: Record<string, string> = {};
  geoserverPublicationByProjectId: Record<string, GeoServerPublicationResponse> = {};
  geoserverUpdateInProgressByProjectId: Record<string, boolean> = {};
  geoserverUpdateErrorByProjectId: Record<string, string> = {};
  geoserverUpdateSuccessByProjectId: Record<string, string> = {};
  idraPublishingByProjectId: Record<string, boolean> = {};
  idraPublishErrorByProjectId: Record<string, string> = {};
  idraGeoserverLinkingByProjectId: Record<string, boolean> = {};
  idraGeoserverLinkErrorByProjectId: Record<string, string> = {};
  idraGeoserverLinkSuccessByProjectId: Record<string, string> = {};

  private readonly geoserverPollingIntervalMs = 2500;
  private geoserverPollingSubscriptions: Record<string, Subscription> = {};
  private destroy$ = new Subject<void>();
  private messageListener?: (event: MessageEvent) => void;

  constructor(
    private apiServices: ApiService,
    private translate: TranslateService,
    private router: Router,
    private analysisAvailability: AnalysisAvailabilityService
  ) { }

  // -----------------------------
  // COOKIE UTILITY
  // -----------------------------
  getCookie(name: string) {
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookiesArray = decodedCookie.split(";");

    for (let c of cookiesArray) {
      c = c.trim();
      if (c.indexOf(name + "=") === 0) {
        return c.substring(name.length + 1);
      }
    }

    return "";
  }

  // -----------------------------
  // LANGUAGE SWITCH
  // -----------------------------
  switchLanguage(language: string) {
    const selectedLanguage = language || "en";
    document.cookie = `language=${selectedLanguage}`;
    this.translate.use(selectedLanguage);
  }

  // -----------------------------
  // STORE PROJECT ID
  // -----------------------------
  storeId(id: string) {
    localStorage.setItem("projectId", id);
  }

  // -----------------------------
  // CHECK IF ANALYSIS IS AVAILABLE
  // -----------------------------
  isAnalysisAvailable(city: string): boolean {
    return this.analysisAvailability.isAnalysisAvailable(city);
  }

  // -----------------------------
  // NAVIGATE TO CREATE PAGE
  // -----------------------------
  navigate() {
    this.router.navigate(["pages/create-layer"]);
  }

  // -----------------------------
  // LOAD PROJECTS
  // -----------------------------
  async loadProjects() {

    this.loading = true;

    try {
      const response = await this.apiServices.getAll() as any[];
      this.projects = response || [];
      this.initializeGeoserverPublicationState();
    } catch (error) {
      console.error("API call failed:", error);
      this.projects = [];
    }

    this.loading = false;
  }

  // -----------------------------
  // DELETE PROJECT
  // -----------------------------
  async deleteProject(id: string) {

    const index = this.projects.findIndex(p => p.id === id);

    if (index === -1) return;

    try {

      await this.apiServices.deleteEntry(id);

      this.projects.splice(index, 1);

    } catch (error) {

      console.error("API call failed:", error);

    }
  }

  // -----------------------------
  // DELETE DIALOG
  // -----------------------------
  setDeleteConfirmationId(id: string) {
    this.deleteConfirmationId = id;
    this.sendIdraId = "";
    this.addGeoserverDistributionId = "";
    this.updateGeoserverPublicationId = "";
  }

  closeDeleteDialog() {
    this.deleteConfirmationId = "";
  }

  openPublicationWizard(project: any) {
    this.publicationWizardProject = project;
    this.deleteConfirmationId = "";
    this.sendIdraId = "";
    this.addGeoserverDistributionId = "";
    this.updateGeoserverPublicationId = "";

    const state = this.getGeoServerPublicationState(project);
    if (state === "pending" || state === "running") {
      this.startGeoserverPublicationPolling(project);
    }
  }

  closePublicationWizard() {
    this.publicationWizardProject = null;
    this.sendIdraId = "";
    this.addGeoserverDistributionId = "";
    this.updateGeoserverPublicationId = "";
  }

  // -----------------------------
  // IDRA DIALOG
  // -----------------------------
  setSendIdraId(id: string) {
    const project = this.projects.find((item) => item.id === id);
    if (project?.onIDRA === true || this.isIdraPublishing(id)) {
      return;
    }

    this.sendIdraId = id;
    this.deleteConfirmationId = "";
    this.addGeoserverDistributionId = "";
    this.updateGeoserverPublicationId = "";
    delete this.idraPublishErrorByProjectId[id];
  }

  closeIdraDialog() {
    this.sendIdraId = "";
  }

  setAddGeoserverDistributionId(id: string) {
    const project = this.projects.find((item) => item.id === id);
    if (!this.canAddGeoserverDistributionToIdra(project) || this.isAddingGeoserverDistributionToIdra(id)) {
      return;
    }

    this.addGeoserverDistributionId = id;
    this.sendIdraId = "";
    this.deleteConfirmationId = "";
    this.updateGeoserverPublicationId = "";
    delete this.idraGeoserverLinkErrorByProjectId[id];
    delete this.idraGeoserverLinkSuccessByProjectId[id];
  }

  closeAddGeoserverDistributionDialog() {
    this.addGeoserverDistributionId = "";
  }

  // -----------------------------
  // IDRA PUBLICATION
  // -----------------------------
  canIncludeGeoserverDistributionInIdra(project: any): boolean {
    return project?.onGeoServer === true
      && this.getGeoServerPublicationState(project) === "completed"
      && !!this.getGeoServerPublicDataUrl(project);
  }

  shouldWarnNativeOnlyIdra(project: any): boolean {
    return project?.onGeoServer === true && !this.canIncludeGeoserverDistributionInIdra(project);
  }

  isIdraPublishing(projectId: string): boolean {
    return this.idraPublishingByProjectId[projectId] === true;
  }

  publishOnIdra(project: any, includeGeoserverDistribution: boolean) {
    const projectId = project?.id;

    if (!projectId || project.onIDRA === true || this.isIdraPublishing(projectId)) {
      return;
    }

    this.idraPublishingByProjectId[projectId] = true;
    delete this.idraPublishErrorByProjectId[projectId];
    this.idraGeoserverLinkSuccessByProjectId[projectId] = "";

    this.apiServices.publishOnIdra(projectId, includeGeoserverDistribution)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: IdraPublishResponse) => this.applyIdraPublishResponse(project, response),
        error: (error) => {
          this.idraPublishingByProjectId[projectId] = false;
          this.idraPublishErrorByProjectId[projectId] = this.formatIdraPublishError(error);
        },
      });
  }

  private applyIdraPublishResponse(project: any, response: IdraPublishResponse) {
    const projectId = project?.id || response?.documentId;
    if (!projectId) {
      return;
    }

    this.idraPublishingByProjectId[projectId] = false;
    project.onIDRA = response?.onIDRA !== false;

    const includesGeoserver = response?.includedGeoserverDistribution === true
      || response?.idraHasGeoserverDistribution === true;
    if (includesGeoserver) {
      project.idraHasGeoserverDistribution = true;
    }

    project.idraDatasetId = response?.idraDatasetId || response?.datasetId || project.idraDatasetId;
    project.idraNativeDistributionId = response?.nativeDistributionId || project.idraNativeDistributionId;
    project.nativeDistributionId = response?.nativeDistributionId || project.nativeDistributionId;
    project.idraGeoserverDistributionId = response?.geoserverDistributionId || project.idraGeoserverDistributionId;
    project.geoserverDistributionId = response?.geoserverDistributionId || project.geoserverDistributionId;

    delete this.idraPublishErrorByProjectId[projectId];
    this.closeIdraDialog();
  }

  private formatIdraPublishError(error: any): string {
    if (error?.status === 403) {
      return this.translate.instant("idra_publish_unauthorized");
    }
    if (error?.status === 404) {
      return this.translate.instant("idra_publish_not_found");
    }
    if (error?.status === 409) {
      return this.translate.instant("idra_publish_conflict");
    }
    if (error?.status === 422) {
      return this.translate.instant("idra_publish_not_publishable");
    }
    if (error?.status === 502) {
      return this.translate.instant("idra_publish_service_unreachable");
    }
    return this.translate.instant("idra_publish_generic_error");
  }

  // -----------------------------
  // ADD GEOSERVER DISTRIBUTION TO IDRA
  // -----------------------------
  canAddGeoserverDistributionToIdra(project: any): boolean {
    return project?.onGeoServer === true
      && this.getGeoServerPublicationState(project) === "completed"
      && !!this.getGeoServerPublicDataUrl(project)
      && project?.onIDRA === true
      && project?.idraHasGeoserverDistribution !== true;
  }

  isAddingGeoserverDistributionToIdra(projectId: string): boolean {
    return this.idraGeoserverLinkingByProjectId[projectId] === true;
  }

  addGeoserverDistributionToIdra(project: any) {
    const projectId = project?.id;

    if (!projectId || !this.canAddGeoserverDistributionToIdra(project) || this.isAddingGeoserverDistributionToIdra(projectId)) {
      return;
    }

    this.idraGeoserverLinkingByProjectId[projectId] = true;
    delete this.idraGeoserverLinkErrorByProjectId[projectId];
    delete this.idraGeoserverLinkSuccessByProjectId[projectId];

    this.apiServices.addGeoserverDistributionToIdra(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: IdraGeoserverDistributionResponse) => this.applyGeoserverDistributionLinkResponse(project, response),
        error: (error) => {
          this.idraGeoserverLinkingByProjectId[projectId] = false;
          this.idraGeoserverLinkErrorByProjectId[projectId] = this.formatGeoserverDistributionLinkError(error);
        },
      });
  }

  private applyGeoserverDistributionLinkResponse(project: any, response: IdraGeoserverDistributionResponse) {
    const projectId = project?.id || response?.documentId;
    if (!projectId) {
      return;
    }

    this.idraGeoserverLinkingByProjectId[projectId] = false;
    project.idraHasGeoserverDistribution = response?.idraHasGeoserverDistribution !== false;
    project.geoserverDistributionId = response?.geoserverDistributionId || project.geoserverDistributionId;
    project.idraGeoserverDistributionId = (response as any)?.idraGeoserverDistributionId
      || response?.geoserverDistributionId
      || project.idraGeoserverDistributionId;

    if (response?.publicDataUrl) {
      project.geoserverPublicationMetadata = {
        ...(project.geoserverPublicationMetadata || {}),
        publicDataUrl: response.publicDataUrl,
      };
    }

    delete this.idraGeoserverLinkErrorByProjectId[projectId];
    this.idraGeoserverLinkSuccessByProjectId[projectId] = this.translate.instant("idra_geoserver_distribution_added");
    this.closeAddGeoserverDistributionDialog();
  }

  private formatGeoserverDistributionLinkError(error: any): string {
    if (error?.status === 403) {
      return this.translate.instant("idra_publish_unauthorized");
    }
    if (error?.status === 404) {
      return this.translate.instant("idra_publish_not_found");
    }
    if (error?.status === 409) {
      return this.translate.instant("idra_publish_conflict");
    }
    if (error?.status === 422) {
      return this.translate.instant("idra_publish_not_publishable");
    }
    if (error?.status === 502) {
      return this.translate.instant("idra_publish_service_unreachable");
    }
    return this.translate.instant("idra_publish_generic_error");
  }

  // -----------------------------
  // GEOSERVER PUBLICATION
  // -----------------------------
  publishOnGeoServer(project: any) {
    const projectId = project?.id;

    if (!projectId || project.onGeoServer === true || this.isGeoServerPublishing(projectId)) {
      return;
    }

    this.geoserverPublishErrorByProjectId[projectId] = "";
    delete this.geoserverUpdateErrorByProjectId[projectId];
    delete this.geoserverUpdateSuccessByProjectId[projectId];
    this.geoserverUpdateInProgressByProjectId[projectId] = false;
    this.geoserverPublishStateByProjectId[projectId] = "pending";
    project.geoserverPublicationStatus = "pending";

    this.apiServices.startGeoserverPublication(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: GeoServerPublicationResponse) => this.applyGeoserverPublicationResponse(project, response),
        error: (error) => this.setGeoserverPublicationError(projectId, this.formatGeoserverPublicationError(error)),
      });
  }

  getGeoServerPublicationState(project: any): GeoServerPublicationState {
    const projectId = project?.id;
    return this.normalizeGeoserverStatus(
      this.geoserverPublishStateByProjectId[projectId]
      || project?.geoserverPublicationStatus
      || (project?.onGeoServer === true ? "completed" : "idle")
    );
  }

  isGeoServerPublishing(projectId: string): boolean {
    const state = this.normalizeGeoserverStatus(this.geoserverPublishStateByProjectId[projectId]);
    return state === "pending" || state === "running";
  }

  isGeoserverUpdateInProgress(projectId: string): boolean {
    return this.geoserverUpdateInProgressByProjectId[projectId] === true;
  }

  isGeoServerAvailableForDistribution(project: any): boolean {
    return project?.onGeoServer === true
      && this.getGeoServerPublicationState(project) === "completed"
      && !!this.getGeoServerPublicDataUrl(project);
  }

  canPublishOnGeoServer(project: any): boolean {
    const state = this.getGeoServerPublicationState(project);
    return project?.onGeoServer !== true && state !== "pending" && state !== "running";
  }

  canUpdateGeoserverPublication(project: any): boolean {
    const state = this.getGeoServerPublicationState(project);

    return project?.onGeoServer === true
      && state !== "pending"
      && state !== "running"
      && !this.isGeoserverUpdateInProgress(project?.id);
  }

  getGeoServerPublicDataUrl(project: any): string {
    const projectId = project?.id;
    return this.geoserverPublicationByProjectId[projectId]?.publicDataUrl
      || project?.geoserverPublicationMetadata?.publicDataUrl
      || "";
  }

  getGeoServerStatusKey(project: any): string {
    const state = this.getGeoServerPublicationState(project);

    if (this.isGeoserverUpdateInProgress(project?.id) || state === "pending" || state === "running") {
      return "publication_status_in_progress";
    }
    if (project?.onGeoServer === true && state === "failed") {
      return "publication_status_failed";
    }
    if (project?.onGeoServer === true && state === "completed") {
      return "publication_status_published";
    }
    if (state === "failed") {
      return "publication_status_failed";
    }
    return "publication_status_not_published";
  }

  getIdraStatusKey(project: any): string {
    return project?.onIDRA === true ? "publication_status_published" : "publication_status_not_published";
  }

  getGeoserverDistributionStatusKey(project: any): string {
    if (project?.idraHasGeoserverDistribution === true) {
      return "publication_status_included";
    }
    if (!this.isGeoServerAvailableForDistribution(project)) {
      return "publication_status_not_available";
    }
    if (project?.onIDRA !== true) {
      return "publication_status_available_during_idra";
    }
    return "publication_status_not_included";
  }

  getPublicationStatusClass(statusKey: string): string {
    if (statusKey === "publication_status_published" || statusKey === "publication_status_included") {
      return "status-success";
    }
    if (statusKey === "publication_status_in_progress" || statusKey === "publication_status_available_during_idra") {
      return "status-progress";
    }
    if (statusKey === "publication_status_failed") {
      return "status-error";
    }
    return "status-muted";
  }

  setUpdateGeoserverPublicationId(id: string) {
    const project = this.projects.find((item) => item.id === id);
    if (!this.canUpdateGeoserverPublication(project)) {
      return;
    }

    this.updateGeoserverPublicationId = id;
    this.deleteConfirmationId = "";
    this.sendIdraId = "";
    this.addGeoserverDistributionId = "";
    delete this.geoserverUpdateErrorByProjectId[id];
    delete this.geoserverUpdateSuccessByProjectId[id];
  }

  closeUpdateGeoserverDialog() {
    this.updateGeoserverPublicationId = "";
  }

  updateGeoserverPublication(project: any) {
    const projectId = project?.id;

    if (!projectId || !this.canUpdateGeoserverPublication(project)) {
      return;
    }

    this.geoserverUpdateInProgressByProjectId[projectId] = true;
    delete this.geoserverUpdateErrorByProjectId[projectId];
    delete this.geoserverUpdateSuccessByProjectId[projectId];
    this.geoserverPublishErrorByProjectId[projectId] = "";

    this.apiServices.updateGeoserverPublication(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: GeoServerPublicationResponse) => this.applyGeoserverUpdateResponse(project, response),
        error: (error) => {
          this.geoserverUpdateInProgressByProjectId[projectId] = false;
          this.geoserverUpdateErrorByProjectId[projectId] = this.formatGeoserverUpdateError(error);
        },
      });
  }

  private initializeGeoserverPublicationState() {
    for (const project of this.projects) {
      const state = this.getGeoServerPublicationState(project);
      this.geoserverPublishStateByProjectId[project.id] = state;
      if (project.geoserverPublicationMetadata) {
        this.geoserverPublicationByProjectId[project.id] = {
          documentId: project.id,
          status: state,
          ...project.geoserverPublicationMetadata,
          importId: project.geoserverImportId,
        };
      }
      if (state === "pending" || state === "running") {
        this.geoserverUpdateInProgressByProjectId[project.id] = project.onGeoServer === true;
        this.startGeoserverPublicationPolling(project);
      }
    }
  }

  private applyGeoserverPublicationResponse(project: any, response: GeoServerPublicationResponse) {
    const projectId = project?.id || response?.documentId;
    if (!projectId || !response) {
      return;
    }

    const status = this.normalizeGeoserverStatus(response.status);
    this.applyGeoserverPublicationFields(project, response, status);

    if (status === "completed") {
      project.onGeoServer = true;
      delete this.geoserverPublishErrorByProjectId[projectId];
      this.stopGeoserverPublicationPolling(projectId);
      return;
    }

    if (status === "failed") {
      project.onGeoServer = false;
      this.geoserverPublishErrorByProjectId[projectId] = response.error || response.message || this.translate.instant("geoserver_publication_failed");
      this.stopGeoserverPublicationPolling(projectId);
      return;
    }

    if (status === "pending" || status === "running") {
      project.onGeoServer = false;
      this.startGeoserverPublicationPolling(project);
    }
  }

  private applyGeoserverUpdateResponse(project: any, response: GeoServerPublicationResponse) {
    const projectId = project?.id || response?.documentId;
    if (!projectId || !response) {
      return;
    }

    const status = this.normalizeGeoserverStatus(response.status);
    this.applyGeoserverPublicationFields(project, response, status);
    project.onGeoServer = true;

    if (status === "completed") {
      this.geoserverUpdateInProgressByProjectId[projectId] = false;
      delete this.geoserverUpdateErrorByProjectId[projectId];
      this.geoserverUpdateSuccessByProjectId[projectId] = this.translate.instant("geoserver_update_success");
      this.closeUpdateGeoserverDialog();
      this.stopGeoserverPublicationPolling(projectId);
      return;
    }

    if (status === "failed") {
      this.geoserverUpdateInProgressByProjectId[projectId] = false;
      this.geoserverUpdateErrorByProjectId[projectId] = response.error || response.message || this.translate.instant("geoserver_update_failed");
      this.closeUpdateGeoserverDialog();
      this.stopGeoserverPublicationPolling(projectId);
      return;
    }

    if (status === "pending" || status === "running") {
      this.geoserverUpdateInProgressByProjectId[projectId] = true;
      this.startGeoserverPublicationPolling(project);
    }
  }

  private applyGeoserverPublicationFields(project: any, response: GeoServerPublicationResponse, status: GeoServerPublicationState) {
    const projectId = project?.id || response?.documentId;
    this.geoserverPublishStateByProjectId[projectId] = status;
    this.geoserverPublicationByProjectId[projectId] = {
      ...(this.geoserverPublicationByProjectId[projectId] || {}),
      ...response,
      status,
    };
    project.geoserverPublicationStatus = status;

    project.geoserverPublicationMetadata = {
      ...(project.geoserverPublicationMetadata || {}),
    };

    this.assignIfPresent(project.geoserverPublicationMetadata, "workspace", response.workspace);
    this.assignIfPresent(project.geoserverPublicationMetadata, "datastore", response.datastore);
    this.assignIfPresent(project.geoserverPublicationMetadata, "layer", response.layer);
    this.assignIfPresent(project.geoserverPublicationMetadata, "format", response.format);
    this.assignIfPresent(project.geoserverPublicationMetadata, "dataUrl", response.dataUrl);
    this.assignIfPresent(project.geoserverPublicationMetadata, "publicDataUrl", response.publicDataUrl);
    this.assignIfPresent(project.geoserverPublicationMetadata, "title", response.title);
  }

  private assignIfPresent(target: any, key: string, value: any) {
    if (value !== undefined && value !== null) {
      target[key] = value;
    }
  }

  private startGeoserverPublicationPolling(project: any) {
    const projectId = project?.id;
    if (!projectId || this.geoserverPollingSubscriptions[projectId]) {
      return;
    }

    this.geoserverPollingSubscriptions[projectId] = timer(this.geoserverPollingIntervalMs, this.geoserverPollingIntervalMs)
      .pipe(
        switchMap(() => this.apiServices.getGeoserverPublicationStatus(projectId)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response: GeoServerPublicationResponse) => {
          if (this.isGeoserverUpdateInProgress(projectId)) {
            this.applyGeoserverUpdateResponse(project, response);
          } else {
            this.applyGeoserverPublicationResponse(project, response);
          }
        },
        error: (error) => {
          if (this.isGeoserverUpdateInProgress(projectId)) {
            this.geoserverUpdateInProgressByProjectId[projectId] = false;
            this.geoserverUpdateErrorByProjectId[projectId] = this.formatGeoserverUpdateError(error);
          } else {
            this.setGeoserverPublicationError(projectId, this.formatGeoserverPublicationError(error));
          }
          this.stopGeoserverPublicationPolling(projectId);
        },
      });
  }

  private stopGeoserverPublicationPolling(projectId: string) {
    this.geoserverPollingSubscriptions[projectId]?.unsubscribe();
    delete this.geoserverPollingSubscriptions[projectId];
  }

  private setGeoserverPublicationError(projectId: string, message: string) {
    this.geoserverPublishStateByProjectId[projectId] = "failed";
    this.geoserverPublishErrorByProjectId[projectId] = message;
    this.stopGeoserverPublicationPolling(projectId);
  }

  private normalizeGeoserverStatus(status: string): GeoServerPublicationState {
    return String(status || "idle").toLowerCase();
  }

  private formatGeoserverPublicationError(error: any): string {
    if (error?.status === 403) {
      return this.translate.instant("geoserver_operation_unauthorized");
    }
    if (error?.status === 404) {
      return this.translate.instant("geoserver_publication_not_found");
    }
    if (error?.status === 409) {
      return this.translate.instant("geoserver_operation_conflict");
    }
    if (error?.status === 422) {
      return this.translate.instant("geoserver_operation_invalid_geojson");
    }
    if (error?.status === 500) {
      return this.translate.instant("geoserver_update_not_configured");
    }
    if (error?.status === 502) {
      return this.translate.instant("geoserver_update_service_unreachable");
    }
    return this.translate.instant("geoserver_operation_failed");
  }

  private formatGeoserverUpdateError(error: any): string {
    if (error?.status === 403) {
      return this.translate.instant("geoserver_operation_unauthorized");
    }
    if (error?.status === 404) {
      return this.translate.instant("geoserver_publication_not_found");
    }
    if (error?.status === 409) {
      return this.translate.instant("geoserver_operation_conflict");
    }
    if (error?.status === 422) {
      return this.translate.instant("geoserver_operation_invalid_geojson");
    }
    if (error?.status === 502) {
      return this.translate.instant("geoserver_update_service_unreachable");
    }
    if (error?.status === 500) {
      return this.translate.instant("geoserver_update_not_configured");
    }
    return this.translate.instant("geoserver_operation_failed");
  }

  // -----------------------------
  // SEND TO IDRA
  // -----------------------------
  // Legacy flow kept for compatibility. New UI uses publishOnIdra().
  async sendIdra(id: string) {

    try {

      const response = await this.apiServices.sendToIdra(id);

      for (let project of this.projects) {
        if (project.id === response) {
          project.onIDRA = true;
        }
      }

      this.idraLoading = true;

      setTimeout(() => {
        this.idraLoading = false;
        this.closeIdraDialog();
      }, 1000);

    } catch (error) {

      console.error("IDRA request failed:", error);

    }
  }

  // -----------------------------
  // INIT
  // -----------------------------
  async ngOnInit() {

    // --- Standalone mode ---
    const isStandAloneCookie = this.getCookie("isStandAlone");
    this.isStandAlone = isStandAloneCookie === "true";

    // --- Check tokens on page load ---
    const serviceToken = localStorage.getItem("serviceToken");
    const refreshToken = localStorage.getItem("refreshToken");
    this.isAuthenticated = !!serviceToken && !!refreshToken;

    // --- Load projects if logged in ---
    if (this.isAuthenticated) {
      await this.loadProjects();
    }

    // --- Listen for postMessage login / language ---
    this.messageListener = async (event) => {

      // Auth message
      if (event.data?.serviceToken && event.data?.refreshToken) {
        localStorage.setItem("serviceToken", event.data.serviceToken);
        localStorage.setItem("refreshToken", event.data.refreshToken);
        this.isAuthenticated = true;

        // Load projects after login
        await this.loadProjects();
      }

      // Language change message
      if (event.data?.language) {
        document.cookie = `language=${event.data.language}`;
        const language = this.getCookie("language") || "en";
        this.translate.use(language);

        this.translate.onLangChange.subscribe((event: LangChangeEvent) => {
          const langToUse = this.getCookie("language") || "en";
          this.translate.use(langToUse);
        });
      }

    };

    window.addEventListener("message", this.messageListener);

    // --- Clear previous layers ---
    this.apiServices.storedLayers = [];
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    Object.keys(this.geoserverPollingSubscriptions).forEach((projectId) => {
      this.stopGeoserverPublicationPolling(projectId);
    });

    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
    }
  }
}
