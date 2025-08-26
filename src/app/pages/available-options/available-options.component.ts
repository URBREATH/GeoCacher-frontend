import { Component, OnInit } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { TranslateService, LangChangeEvent } from "@ngx-translate/core";
import { Router } from "@angular/router";

@Component({
  selector: "ngx-available-options",
  templateUrl: "./available-options.component.html",
  styleUrls: ["./available-options.component.scss"],
})
export class AvailableOptionsComponent implements OnInit {
  projects: any = [];
  //languages
  selectedValue: number = 1; // Set the default value to 1

  //spinner control
  loading: boolean = false;
  //idra dialog spinner control
  idraLoading: boolean = false;

  isStandAlone: boolean; 

  constructor(
    private apiServices: ApiService,
    private translate: TranslateService,
    private router: Router
  ) {}

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

  //storing selected search Id(s) into services
  public storeId(id: string) {
    localStorage.setItem("projectId", id);
  }

  async deleteProject(id: string) {
    let element = document.getElementById(id);
    //here is stored the index number of the selected project
    let positionInArray: number;

    //here is stored the id of associated cronJob. Might be either: null or string
    let projectCronId: any;
    //get the position of the element we want to delete in the projects array
    this.projects.forEach((e) => {
      if (e.id === id) {
        //store the index in positionInArray
        positionInArray = this.projects.indexOf(e);
        projectCronId = this.projects[positionInArray].cron_id;
      }
    });
    try {
      await this.apiServices.deleteEntry(id);
      element.remove();
      //remove element from the array
      this.projects.splice(positionInArray, 1);
    } catch (error) {
      //Show a message in case of error
      console.error("API call failed:", error);
    }
  }

  navigate() {
    this.router.navigate(["pages/create-layer"]);
  }

  async ngOnInit() {

    //get the value of the variable isStandAlone from the cookies
    const isStandAloneCookie = this.getCookie('isStandAlone');
    this.isStandAlone = isStandAloneCookie === 'true'; // Convert the cookie value to boolean

    window.addEventListener(
      "message",
      (event) => {
        //this.receiveMessage();

        if (event.data.hasOwnProperty("accessToken")) {
          localStorage.setItem("token", event.data.accessToken);
          document.cookie = `language=${event.data.language}`;

          this.apiServices.storedLayers = [];
        }
        if (event.data.hasOwnProperty("language")) {
          document.cookie = `language=${event.data.language}`;
          const language = this.getCookie("language") || "en";
          this.translate.use(language);
          this.translate.onLangChange.subscribe((event: LangChangeEvent) => {
            const langToUse = this.getCookie("language") || "en";
            this.translate.use(langToUse);
          });
        }
      },
      false
    );

    //DEVONLY
    //document.cookie = "language=en";

    document.getElementById("languageSelector");
    //remove entries in storedLayers from previous unfinished researches
    this.apiServices.storedLayers = [];
    this.loading = true;
    try {
      this.projects = await this.apiServices.getAll();
      console.log(this.projects);
      this.loading = false;
    } catch (error) {
      this.loading = false;
      //Show a message in case of error
      console.error("API call failed:", error);
    }

    //empty any leftover layer from previous searches
    this.apiServices.storedLayers = [];
  }

  //delete confirmation
  deleteConfirmationId = "";

  setDeleteConfirmationId(id) {
    this.deleteConfirmationId = id;
    this.sendIdraId = "";
  }

  closeDeleteDialog() {
    this.deleteConfirmationId = "";
  }

  //Idra confirmation
  sendIdraId = "";

  setSendIdraId(id) {
    this.sendIdraId = id;
    this.deleteConfirmationId = "";
  }

  closeIdraDialog() {
    this.sendIdraId = "";
  }

  async sendIdra(id: string) {
    let response: any = await this.apiServices.sendToIdra(id);
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
  }
}
