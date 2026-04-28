import { Component, OnInit } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { TranslateService, LangChangeEvent } from "@ngx-translate/core";
import { Router } from "@angular/router";
import { AnalysisAvailabilityService } from "../../services/analysis-availability.service";

@Component({
  selector: "ngx-available-options",
  templateUrl: "./available-options.component.html",
  styleUrls: ["./available-options.component.scss"],
})
export class AvailableOptionsComponent implements OnInit {

  projects: any[] = [];

  loading: boolean = false;
  idraLoading: boolean = false;

  isStandAlone: boolean = false;
  isAuthenticated: boolean = false;

  deleteConfirmationId = "";
  sendIdraId = "";

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
  }

  closeDeleteDialog() {
    this.deleteConfirmationId = "";
  }

  // -----------------------------
  // IDRA DIALOG
  // -----------------------------
  setSendIdraId(id: string) {
    this.sendIdraId = id;
    this.deleteConfirmationId = "";
  }

  closeIdraDialog() {
    this.sendIdraId = "";
  }

  // -----------------------------
  // SEND TO IDRA
  // -----------------------------
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
    window.addEventListener("message", async (event) => {

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

    });

    // --- Clear previous layers ---
    this.apiServices.storedLayers = [];
  }
}