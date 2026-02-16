import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, TemplateRef } from "@angular/core";
import * as L from "leaflet";
import * as turf from "@turf/turf";
import { MarkerClusterGroup } from "leaflet.markercluster";
import { BehaviorSubject, Subject } from "rxjs";
import { takeUntil, tap } from "rxjs/operators";
import { NbDialogService } from "@nebular/theme";
import { DialogComponent } from "../pages/dialog/dialog.component";
// import "leaflet.markercluster/dist/MarkerCluster.Default.css";
// import "leaflet/dist/leaflet.css";

@Injectable({
  providedIn: "root",
})
export class ApiService {

  public baseUrl = (window.env && window.env.apiUrl) || "http://localhost:9090";


  private defaultIconOptions = {
    iconSize: [35, 41],
    iconAnchor: [10, 41],
    popupAnchor: [2, -40],
    shadowUrl: "https://unpkg.com/leaflet@1.4.0/dist/images/marker-shadow.png",
  };

  public iconUrls = {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg",
    bench: "https://cdn-icons-png.flaticon.com/512/5962/5962925.png",
    bin: "https://cdn-icons-png.flaticon.com/512/5733/5733606.png",
    caution: "https://cdn-icons-png.flaticon.com/512/5087/5087907.png",
    cone: "https://cdn-icons-png.flaticon.com/512/7899/7899459.png",
    danger: "https://cdn-icons-png.flaticon.com/512/6069/6069788.png ",
    escalators: "https://cdn-icons-png.flaticon.com/512/5761/5761074.png",
    flowers: "https://cdn-icons-png.flaticon.com/512/8650/8650660.png",
    hazard: "https://cdn-icons-png.flaticon.com/512/5732/5732835.png",
    heart: "https://cdn-icons-png.flaticon.com/512/5750/5750255.png",
    hospital: "https://cdn-icons-png.flaticon.com/512/5029/5029099.png",
    hydrant: "https://cdn-icons-png.flaticon.com/512/6269/6269344.png",
    leaf: "https://cdn-icons-png.flaticon.com/512/7672/7672367.png",
    litter: "https://cdn-icons-png.flaticon.com/512/5013/5013751.png",
    park: "https://cdn-icons-png.flaticon.com/512/5739/5739461.png",
    road: "https://cdn-icons-png.flaticon.com/512/6015/6015923.png",
    tap: "https://cdn-icons-png.flaticon.com/512/6017/6017725.png",
    train: "https://cdn-icons-png.flaticon.com/512/8325/8325690.png",
    tree: "https://cdn-icons-png.flaticon.com/512/6015/6015592.png",
    toilet: "https://cdn-icons-png.flaticon.com/512/6217/6217476.png",
    visibility: "https://cdn-icons-png.flaticon.com/512/5444/5444292.png",
  };

  private createIcon(label: string): L.Icon {
    const iconOptions: any = {
      ...this.defaultIconOptions,
      iconUrl: this.iconUrls[label] || this.iconUrls.default,
    };
    return L.icon(iconOptions);
  }

  iconSelector(label: string): L.Icon {
    return this.createIcon(label);
  }

  clusterOptions = {
    disableClusteringAtZoom: 19,
  };

  constructor(
    private http: HttpClient,
    private dialogService: NbDialogService
  ) { }

  /**
   * Simulates API call to fetch available cities
   * Replace with actual backend endpoint if available
   */
  async getCitiesFromApi(): Promise<{ value: [[number, number], string]; label: string }[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulated API response - this can be replaced with actual API call
    return [
      { value: [[56.1629, 10.2039], "Aarhus"], label: "Aarhus" },
      { value: [[37.9755, 23.7348], "Athens"], label: "Athens" },
      { value: [[46.7712, 23.6236], "Cluj-Napoca"], label: "Cluj-Napoca" },
      { value: [[64.2279, 27.7284], "Kajaani"], label: "Kajaani" },
      { value: [[50.8823, 4.7138], "Leuven"], label: "Leuven" },
      { value: [[40.4165, -3.7026], "Madrid"], label: "Madrid" },
      { value: [[44.8015, 10.3279], "Parma"], label: "Parma" },
      { value: [[49.7384, 13.3736], "Pilsen"], label: "Pilsen" },
      { value: [[59.4370, 24.7536], "Tallinn"], label: "Tallinn" },
    ];
  }

  //store drawn layers here
  public storedLayers = [];

  //stores orion's interrogation's answers
  elements = {};

  //Stores the points to be passed to create-layer.component
  markers = {};

  //results of a query that will be shown as an area rather than a point
  polygons = {};

  //store here all the projects info retrieved with the call getAll
  allProjects = [];

  //these are all the variables and the function that are needed to control the progress bar when receiving points
  nominalProgress = 0;
  totalProgress = 0;
  private progressSource = new BehaviorSubject<number>(0);
  progress$ = this.progressSource.asObservable();
  setProgress(value: number) {
    this.progressSource.next(value);
  }

  cronMultipoint = [];
  cronMultipolygon = [];

  //use this variable and the funtion to unsubscribe from requests' response
  protected ngUnsubscribe: Subject<void> = new Subject<void>();

  public destroyCalls(): void {
    // This aborts all HTTP requests.
    this.ngUnsubscribe.next();
    // This completes the subject properlly.
    this.ngUnsubscribe.complete();
    this.ngUnsubscribe = new Subject();
  }

  saveElement(element, filter) {
    let label = filter[0];
    let icon = filter[1][2];
    //if the key in elements hasn't been created, do it as you put the first element in the array
    if (!this.elements[label]) {
      this.elements[label] = [];
      this.elements[label].push(element);
    } else {
      this.elements[label].push(element);
    }
    this.createMarker(element, label, icon);
  }

  getElements() {
    return Object.getOwnPropertyNames(this.elements);
  }

  /**
   * Sets apiFilters with the data provided by getFilters().
   * @param data - An array of filter data to set.
   */
  createMarker(element, label, icon) {
    let marker: L.Marker;
    let polygon: L.Polygon;
    let polyline: L.Polyline;
    if (element.properties.location.type === "Point") {
      if (element.properties.location.value) {
        marker = L.marker(
          [
            element?.properties.location.value.coordinates[1],
            element?.properties.location.value.coordinates[0],
          ],
          {
            icon: this.iconSelector(icon),
          }
        );
        marker.bindPopup(
          `<b>${element.properties.type}</b><button id=${element.id}>More info</button>`
        );
        marker.addEventListener("click", () => {
          let button = document.getElementById(element?.id);
          if (marker.isPopupOpen() && button != null) {
            button.addEventListener("click", () => {
              this.openMarkerInfo(element);
            });
          }
        });
        marker.getPopup().addEventListener("remove", () => {
          let button = document.getElementById(element?.id);
          if (!marker.isPopupOpen() && button != null) {
            button.removeAllListeners("click");
          }
        });
        marker.addTo(this.markers[label]);
      } else {
        marker = L.marker(
          [
            element.properties.location.coordinates[1],
            element.properties.location.coordinates[0],
          ],
          {
            icon: this.iconSelector(icon),
          }
        );
        marker.bindPopup(
          `<b>${element.properties.type}</b><button id=${element.id}>More info</button>`
        );
        marker.addEventListener("click", () => {
          let button = document.getElementById(element?.id);
          if (marker.isPopupOpen() && button != null) {
            button.addEventListener("click", () => {
              this.openMarkerInfo(element);
            });
          }
        });
        marker.getPopup().addEventListener("remove", () => {
          let button = document.getElementById(element?.id);
          if (!marker.isPopupOpen() && button != null) {
            button.removeAllListeners("click");
          }
        });
        marker.addTo(this.markers[label]);
      }
    } else if (element.properties.location.type === "Polygon") {
      let fixedArray = [];
      element.properties.location.coordinates.forEach((outerArray) =>
        outerArray.forEach((innerArrays) => {
          let tempArray = [];
          tempArray.push(innerArrays[1]);
          tempArray.push(innerArrays[0]);
          fixedArray.push(tempArray);
        })
      );

      polygon = L.polygon(fixedArray);

      polygon.bindPopup(
        `<b>${element.properties.type}</b><button id=${element.id}>More info</button>`
      );
      polygon.addEventListener("click", () => {
        let button = document.getElementById(element?.id);
        if (polygon.isPopupOpen() && button != null) {
          button.addEventListener("click", () => {
            this.openMarkerInfo(element);
          });
        }
      });
      polygon.getPopup().addEventListener("remove", () => {
        let button = document.getElementById(element?.id);
        if (!polygon.isPopupOpen() && button != null) {
          button.removeAllListeners("click");
        }
      });

      polygon.addTo(this.markers[label]);
    } else if (element.properties.location.type === "LineString") {
      // Handle LineString geometries
      let fixedCoordinates = [];
      // Convert [longitude, latitude] to [latitude, longitude] for Leaflet
      element.properties.location.coordinates.forEach(coord => {
        fixedCoordinates.push([coord[1], coord[0]]);
      });

      // Create polyline using the coordinates
      polyline = L.polyline(fixedCoordinates, {
        color: '#FF5733', // Orange-red
        weight: 4,
        opacity: 0.7
      });

      polyline.bindPopup(
        `<b>${element.properties.type}</b><button id=${element.id}>More info</button>`
      );
      polyline.addEventListener("click", () => {
        let button = document.getElementById(element?.id);
        if (polyline.isPopupOpen() && button != null) {
          button.addEventListener("click", () => {
            this.openMarkerInfo(element);
          });
        }
      });
      polyline.getPopup().addEventListener("remove", () => {
        let button = document.getElementById(element?.id);
        if (!polyline.isPopupOpen() && button != null) {
          button.removeAllListeners("click");
        }
      });

      polyline.addTo(this.markers[label]);
    }
  }

  openMarkerInfo(element) {
    console.log(element);
    this.dialogService.open(DialogComponent, {
      context: {
        title: "Detailed info:",
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
   * Retrieves filters for a specific city from Orion.
   * @param cityValue - The city for which filters are requested.
   * @returns A Promise that resolves with the retrieved filters.
   */
  public getFilters(city: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/api/filter/${city}`;

      this.http.get<{ main_filter: string[]; detail_filter: string[] }>(url)
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe(
          data => {
            const controls = data.main_filter.map(type => ({
              city,
              type,
              filters: [
                {
                  name: 'Type',
                  output_value: 'id_category',
                  type: 'checkbox',
                  values: data.detail_filter.map(v => ({
                    label: v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    value: v,
                    icon: 'default'
                  }))
                }
              ]
            }));

            resolve({ controls });
          },
          error => reject(error)
        );
    });
  }



  /**
   *
   */
  public getFiltersFromJson() {
    return new Promise((resolve) => {
      this.http.get("/assets/formData.json").subscribe((data: any) => {
        resolve(data);
      });
    });
  }

  /**
   * Retrieves polygon data for specified filters and adds markers to the map.
   * @param body - An object containing city, and filter data.
   */
  public getPolygonData(body: {
    city: string;
    filter: string[];
    subfilter: any;
  }) {
    //empty the array in which to put the triangles from polygons tesselation
    let tesselationResults = [];
    //set the percentage of which the progress bar will advance for each response we get
    this.nominalProgress =
      100 / this.storedLayers.length / body.subfilter.length;
    return new Promise(async (resolve, reject) => {
      //for every filter
      for (const filter of body.subfilter) {
        //filter has this shape (example):['Urban Furniture', ['urbanage_category', 2, 'bench']]
        let label = filter[0];
        let filterValue = filter[1];
        //create a key in the apiPoint object, if it doesnt exist
        if (!this.markers[label]) {
          this.markers[label] = new MarkerClusterGroup(this.clusterOptions);
        }
        const url = `${this.baseUrl}/api/multipolygondata/`;

        //for each drawing stored
        for (const layer of this.storedLayers) {
          //initialize or empty tessalation
          tesselationResults = [];
          //if they are not circles
          if (!layer.properties.radius) {
            let isPolygon = true;
            let isCircle = true;
            let poly = turf.polygon(layer.geometry.coordinates);
            //calculate centroid of the polygon (if it is a circle will match the center)
            let centroid = turf.centroid(poly);
            //calculate the distance between first vertex and the centroid (if it is a circle, this will be the equivalent of the radius)
            let from = turf.point(layer.geometry.coordinates[0][1]);
            let to = turf.point(centroid.geometry.coordinates);
            let options: { units: turf.Units } = { units: "kilometers" };
            let radius = turf.distance(from, to, options) * 1000;

            //if they have more than 20 vertices
            if (layer.geometry.coordinates[0].length > 20) {
              //for every vertex
              for (let coordinate of layer.geometry.coordinates[0]) {
                let from = turf.point(coordinate);
                let distance = turf.distance(from, to, options) * 1000;

                //if the distance exceeds or is smaller than the radius with a tolerance of 1 meter
                let tolerance = 1;
                if (
                  distance > radius + tolerance ||
                  distance < radius - tolerance
                ) {
                  //then it is not a circle
                  isCircle = false;
                } else {
                  isPolygon = false;
                }
              }
            }

            if (isCircle && !isPolygon) {
              this.cronMultipoint.push(
                Object({
                  point: {
                    //MIND: coordinates inside the geometry I have received so far are inverted.
                    latitude: centroid.geometry.coordinates[1],
                    longitude: centroid.geometry.coordinates[0],
                  },
                  radius: radius,
                  external: false,
                })
              );
              this.http
                .post<any>(
                  `${this.baseUrl}/api/multipointradiusdata/`,
                  {
                    city: body.city,
                    filter: body.filter,
                    subfilter: [filterValue],
                    multipoint: [
                      {
                        point: {
                          //MIND: coordinates inside the geometry I have received so far are inverted.
                          latitude: centroid.geometry.coordinates[1],
                          longitude: centroid.geometry.coordinates[0],
                        },
                        radius: radius,
                        external: false,
                      },
                    ],
                  },
                  {
                    headers: new HttpHeaders({
                      "Content-Type": "application/json",
                      "Access-Control-Allow-Origin": "*",
                      "Access-Control-Allow-Methods": "POST,PATCH,OPTIONS",
                    }),
                  }
                )
                .pipe(takeUntil(this.ngUnsubscribe))
                .subscribe(
                  (data) => {
                    //data is a featureCollection
                    resolve(
                      data.forEach((element) => {
                        if (element.features.length !== 0) {
                          element.features.forEach((element) => {
                            this.saveElement(element, filter);
                          });
                        } else {
                          this.elements[label]
                            ? null
                            : (this.elements[label] = []);
                        }
                      })
                    );
                    //add the percentage of progress every time it gets a response (to make the bar change, this is listened inside the frontend component)
                    this.totalProgress += this.nominalProgress;
                    this.setProgress(this.totalProgress);
                  },
                  (error) => {
                    console.log(error);
                    alert(
                      `Error '${error}' encountered. Couldn't get data from the context broker.`
                    );
                    if (
                      error.status === "200" ||
                      error.error.text === "Request retrieved"
                    )
                      resolve(error.error.text);
                    else reject(error);
                  }
                );
            } else {
              //it goes here if it is not a circle of any kind
              //tesselate is the functions that simplifies a polygon into a featureCollection of smaller triangles
              var triangles = turf.tesselate(poly);
              //for every triangle of the feature
              let feature: any;
              for (feature of triangles.features) {
                let polygonArray = [];
                // Flatten the nested array and push edges to the polygon array
                for (const coordinate of feature.geometry.coordinates.flat()) {
                  const edge = {
                    latitude: coordinate[1],
                    longitude: coordinate[0],
                  };
                  //polygonArray contains all the triangles mapped with latitude and longitude
                  polygonArray.push(edge);
                }
                //stores the result of the above process and it is now ready to be used in the http call
                tesselationResults.push(polygonArray);
              }
              tesselationResults.forEach((triangle) =>
                this.cronMultipolygon.push(triangle)
              );
              this.http
                .post<any>(
                  url,
                  {
                    city: body.city,
                    filter: body.filter,
                    subfilter: [filterValue],
                    polygon: tesselationResults,
                  },
                  {
                    headers: new HttpHeaders({
                      "Content-Type": "application/json",
                      "Access-Control-Allow-Origin": "*",
                      "Access-Control-Allow-Methods": "POST,PATCH,OPTIONS",
                    }),
                  }
                )
                .pipe(takeUntil(this.ngUnsubscribe))
                .subscribe(
                  (data) => {
                    //data is a featureCollection
                    data.forEach((element) => {
                      if (element.features.length !== 0) {
                        element.features.forEach((element) => {
                          this.saveElement(element, filter);
                        });
                      } else {
                        this.elements[label]
                          ? null
                          : (this.elements[label] = []);
                      }
                    });
                    resolve(data);
                    //add the percentage of progress every time it gets a response (to make the bar change, this is listened inside the frontend component)
                    this.totalProgress += this.nominalProgress;
                    this.setProgress(this.totalProgress);
                  },
                  (error) => {
                    console.log(error);
                    if (
                      error.status === "200" ||
                      error.error.text === "Request retrieved"
                    )
                      resolve(error.error.text);
                    else reject(error);
                  }
                );
            }
          }
        }
      }
    });
  }

  /**
   * Retrieves circle data for specified filters and adds markers to the map.
   * @param body - An object containing city, filter, point, radius end external.
   * external - means whether to search inside or outside the shape.
   */
  public getPointRadiusData(body: any): any {
    body.multipoint.forEach((circle) => this.cronMultipoint.push(circle));
    //set the percentage of which the progress bar will advance for each response we get
    this.nominalProgress =
      100 / this.storedLayers.length / body.subfilter.length;
    return new Promise((resolve, reject) => {
      //cycling once for each voice inside body.filter
      for (const filter of body.subfilter) {
        let label = filter[0];
        let filterValue = filter[1];
        //making a new key in apiPoint with the name of the current filter, if it doesn't exist
        this.markers[label]
          ? null
          : (this.markers[label] = new MarkerClusterGroup(this.clusterOptions));
        const url = `${this.baseUrl}/api/multipointradiusdata/`;
        this.http
          .post<any>(
            url,
            {
              city: body.city,
              filter: body.filter,
              subfilter: [filterValue],
              multipoint: body.multipoint,
            },
            {
              headers: new HttpHeaders({
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST,PATCH,OPTIONS",
              }),
            }
          )
          .pipe(takeUntil(this.ngUnsubscribe))
          .subscribe(
            (data) => {
              //data is a featureCollection
              resolve(
                data.forEach((element) => {
                  //if features has elements
                  if (element.features.length !== 0) {
                    element.features.forEach((element) => {
                      this.saveElement(element, filter);
                    });
                  } else {
                    //if it doesn't elements but there isn't a key for the filter, create one and assign an empty array
                    this.elements[label] ? null : (this.elements[label] = []);
                  }

                  this.totalProgress += this.nominalProgress;
                  this.setProgress(this.totalProgress);
                })
              );
            },
            (error) => {
              console.log(error);
              alert(
                `Error '${error}' encountered. Couldn't get data from the context broker.`
              );
              if (
                error.status === "200" ||
                error.error.text === "Request retrieved"
              )
                resolve(error.error.text);
              else reject(error);
            }
          );
      }
    });
  }

  public async saveSearch(queryDetails: any) {
    return new Promise((resolve, reject) => {
      //resets the array in which to store each feature, that will then be stored inside the key "features" of the geojson object of the stored data
      let featuresArray = [];
      let subFilters = [];
      for (const filter of queryDetails.subFilters) {
        //filter has this shape (example):['Urban Furniture', ['urbanage_category', 2, 'bench']]
        let label = filter[0];
        subFilters.push(filter[1]);
        //extracting coordinates from elements (which contains all the markers obtained from the last search)
        for (let element of this.elements[label]) {
          element.properties.label = label;
          element.properties.subFilter = filter[1];
          featuresArray.push(
            Object({
              id: element.id,
              type: element.type,
              geometry: element.geometry,
              properties: element.properties,
            })
          );
        }
      }
      const url = `${this.baseUrl}/api/document/save/`;
      const body = {
        city: queryDetails.city,
        filter: queryDetails.filter,
        subfilter: subFilters,
        name: queryDetails.queryName,
        description: queryDetails.queryDescription,
        layers: queryDetails.layers,
        geojson: {
          type: "Feature",
          features: featuresArray,
        },
      };
      this.http
        .post(url, body, {
          headers: new HttpHeaders({
            Authorization: localStorage.getItem("token") || "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCQUpfRm04T0tOdXlBaXB2MTA5VElsOENpdHpxWGlSR0FCUHI2NWx4M2c0In0.eyJleHAiOjE2ODMwMzIwOTYsImlhdCI6MTY4MzAzMTc5NiwiYXV0aF90aW1lIjoxNjgzMDMxNzk1LCJqdGkiOiJmNjZlYzg3MC1mMWM5LTQxM2UtODZiZS05ODU3ZGNlZjFlNGQiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODUvYXV0aC9yZWFsbXMvU3BvdHRlZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmNjIzYTUwNi1mODAzLTQ5NjktYTVhMi01Yjk4MjU2NDMxNjciLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJzcG90dGVkIiwic2Vzc2lvbl9zdGF0ZSI6IjBmMDk3ZTExLTZmYjUtNGNhZC1iZDkzLTMwNjA5ZDZmMmQ3NiIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLXNwb3R0ZWQiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJzaWQiOiIwZjA5N2UxMS02ZmI1LTRjYWQtYmQ5My0zMDYwOWQ2ZjJkNzYiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5hbWUiOiJSaXRhIEdhZXRhIiwicHJlZmVycmVkX3VzZXJuYW1lIjoicml0YS5nYWV0YUBlbmcuaXQiLCJnaXZlbl9uYW1lIjoiUml0YSIsImZhbWlseV9uYW1lIjoiR2FldGEiLCJlbWFpbCI6InJpdGEuZ2FldGFAZW5nLml0In0.RVBSlrsLL7TRNSxEEXkP1F0RX0cw7cwEbVHPJg9-MNzYzWHDQJE0wDqFgL2u_d_E2I9B1vu5tLbL0pEEUnmnzj5cIsIz4eP2uGbq-0wIG08Xf3eZLQjd8ZvsIact5u_L_Cs400OUMVOsUyuq-B9k39_HevsaMbHIzHpaXiWKur6J77KzIcbg-UQ5sfq11HZMkrZnxNnHWvBJxdzV-ZQiD7Lav-_AGb32ZQ0zIb5sQ2LE-CI2_531LNjXOcHu8vG6wNarJ9XZgFeXfToe9W_y1LFJ1vJbv1RvIazZiXhJlCULbZ1XI0hP-lW1PAi3XonMKcVcT1B6EiGWQy2x3CqzGg",
            "Content-Type": "application/json",
          }),
          responseType: "text",
        })
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe((data) => {
          resolve(data);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't save project.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  /**
   * This function performs a search for documents based on the provided IDs.
   * @param queryDetails - An object containing data to compile the body for the update of the given project.
   * @returns A Promise that resolves returning the up to date data or an error message.
   */
  public async updateSearch(queryDetails: any) {
    return new Promise((resolve, reject) => {
      let featuresArray = [];
      let subFilters = [];
      for (const filter of queryDetails.subFilters) {
        //filter has this shape (example):['Urban Furniture', ['urbanage_category', 2, 'bench']]
        let label = filter[0];
        subFilters.push(filter[1]);
        //extracting coordinates from elements (which contains all the markers obtained from the last search)
        for (let element of this.elements[label]) {
          element.properties.label = label;
          element.properties.subFilter = filter[1];
          featuresArray.push(
            Object({
              id: element.id,
              type: element.type,
              geometry: element.geometry,
              properties: element.properties,
            })
          );
        }
      }
      const url = `${this.baseUrl}/api/document/update/`;
      const body = {
        id: queryDetails.id,
        city: queryDetails.city,
        filter: queryDetails.filter,
        subfilter: subFilters,
        name: queryDetails.queryName,
        description: queryDetails.queryDescription,
        layers: queryDetails.layers,
        onIDRA: queryDetails.onIDRA,
        geojson: {
          type: "Feature",
          features: featuresArray,
        },
      };
      this.http
        .post(url, body, {
          headers: new HttpHeaders({
            Authorization: localStorage.getItem("token") || "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCQUpfRm04T0tOdXlBaXB2MTA5VElsOENpdHpxWGlSR0FCUHI2NWx4M2c0In0.eyJleHAiOjE2ODMwMzIwOTYsImlhdCI6MTY4MzAzMTc5NiwiYXV0aF90aW1lIjoxNjgzMDMxNzk1LCJqdGkiOiJmNjZlYzg3MC1mMWM5LTQxM2UtODZiZS05ODU3ZGNlZjFlNGQiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODUvYXV0aC9yZWFsbXMvU3BvdHRlZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmNjIzYTUwNi1mODAzLTQ5NjktYTVhMi01Yjk4MjU2NDMxNjciLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJzcG90dGVkIiwic2Vzc2lvbl9zdGF0ZSI6IjBmMDk3ZTExLTZmYjUtNGNhZC1iZDkzLTMwNjA5ZDZmMmQ3NiIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLXNwb3R0ZWQiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJzaWQiOiIwZjA5N2UxMS02ZmI1LTRjYWQtYmQ5My0zMDYwOWQ2ZjJkNzYiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5hbWUiOiJSaXRhIEdhZXRhIiwicHJlZmVycmVkX3VzZXJuYW1lIjoicml0YS5nYWV0YUBlbmcuaXQiLCJnaXZlbl9uYW1lIjoiUml0YSIsImZhbWlseV9uYW1lIjoiR2FldGEiLCJlbWFpbCI6InJpdGEuZ2FldGFAZW5nLml0In0.RVBSlrsLL7TRNSxEEXkP1F0RX0cw7cwEbVHPJg9-MNzYzWHDQJE0wDqFgL2u_d_E2I9B1vu5tLbL0pEEUnmnzj5cIsIz4eP2uGbq-0wIG08Xf3eZLQjd8ZvsIact5u_L_Cs400OUMVOsUyuq-B9k39_HevsaMbHIzHpaXiWKur6J77KzIcbg-UQ5sfq11HZMkrZnxNnHWvBJxdzV-ZQiD7Lav-_AGb32ZQ0zIb5sQ2LE-CI2_531LNjXOcHu8vG6wNarJ9XZgFeXfToe9W_y1LFJ1vJbv1RvIazZiXhJlCULbZ1XI0hP-lW1PAi3XonMKcVcT1B6EiGWQy2x3CqzGg",
            "Content-Type": "application/json",
          }),
          responseType: "text",
        })
        .subscribe((data) => {
          resolve(data);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't upload project.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  /**
   * This function performs a search for documents based on the provided IDs.
   * @param id - An array of document IDs to search for.
   * @returns A Promise that resolves with markers representing the search results on a map or an error message.
   */
  public getDocument(id: string[]) {
    return new Promise((resolve, reject) => {
      // Send an HTTP GET request to Orion to retrieve search results for the provided IDs
      this.http
        .get(`${this.baseUrl}/api/document/${id}`)
        .subscribe((data: any) => {
          data.geojson.features.forEach((element) => {
            let label = element.properties.label;
            let subFilter = element.properties.subFilter;
            //filter has this shape (example):['Urban Furniture', ['urbanage_category', 2, 'bench']]
            let filter = [label, subFilter];
            if (!this.markers[label]) {
              this.markers[label] = new MarkerClusterGroup(this.clusterOptions);
            }

            this.saveElement(element, filter);
          });

          resolve(data);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't find project.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  /**
   * This function performs a search for all the projects stored in the DB for the given user.
   * @returns A Promise that resolves an array with objects containing basic info to be shown for each project or an error message.
   */
  public getAll() {
    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/document/getdocuments`, {
          headers: new HttpHeaders({
            Authorization: "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCQUpfRm04T0tOdXlBaXB2MTA5VElsOENpdHpxWGlSR0FCUHI2NWx4M2c0In0.eyJleHAiOjE2ODMwMzIwOTYsImlhdCI6MTY4MzAzMTc5NiwiYXV0aF90aW1lIjoxNjgzMDMxNzk1LCJqdGkiOiJmNjZlYzg3MC1mMWM5LTQxM2UtODZiZS05ODU3ZGNlZjFlNGQiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODUvYXV0aC9yZWFsbXMvU3BvdHRlZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmNjIzYTUwNi1mODAzLTQ5NjktYTVhMi01Yjk4MjU2NDMxNjciLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJzcG90dGVkIiwic2Vzc2lvbl9zdGF0ZSI6IjBmMDk3ZTExLTZmYjUtNGNhZC1iZDkzLTMwNjA5ZDZmMmQ3NiIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLXNwb3R0ZWQiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJzaWQiOiIwZjA5N2UxMS02ZmI1LTRjYWQtYmQ5My0zMDYwOWQ2ZjJkNzYiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5hbWUiOiJSaXRhIEdhZXRhIiwicHJlZmVycmVkX3VzZXJuYW1lIjoicml0YS5nYWV0YUBlbmcuaXQiLCJnaXZlbl9uYW1lIjoiUml0YSIsImZhbWlseV9uYW1lIjoiR2FldGEiLCJlbWFpbCI6InJpdGEuZ2FldGFAZW5nLml0In0.RVBSlrsLL7TRNSxEEXkP1F0RX0cw7cwEbVHPJg9-MNzYzWHDQJE0wDqFgL2u_d_E2I9B1vu5tLbL0pEEUnmnzj5cIsIz4eP2uGbq-0wIG08Xf3eZLQjd8ZvsIact5u_L_Cs400OUMVOsUyuq-B9k39_HevsaMbHIzHpaXiWKur6J77KzIcbg-UQ5sfq11HZMkrZnxNnHWvBJxdzV-ZQiD7Lav-_AGb32ZQ0zIb5sQ2LE-CI2_531LNjXOcHu8vG6wNarJ9XZgFeXfToe9W_y1LFJ1vJbv1RvIazZiXhJlCULbZ1XI0hP-lW1PAi3XonMKcVcT1B6EiGWQy2x3CqzGg",
          }),
        })
        .subscribe((data: any) => {
          //remove leftover voices from previous usage
          this.allProjects = [];
          //insert new entries inside array
          data
            .map((e: any) =>
              Object({
                id: e.id,
                name: e.name,
                description: e.description,
                city: e.city,
                filters: e.filter,
                createdAt: e.dateCreation,
                cron_id: e.cron_id,
                onIDRA: e.onIDRA,
              })
            )
            .forEach((e: any) => this.allProjects.push(e));
          resolve(this.allProjects);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't download projects.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  public setCronJob(idAndRep) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/api/cron/set/`;
      this.http
        .post(
          url,
          {
            document_id: idAndRep.id,
            repeat: idAndRep.repeat,
            multiPolygon: this.cronMultipolygon,
            multipoint: this.cronMultipoint,
          },
          {
            headers: new HttpHeaders({
              "Content-Type": "application/json",
            }),

            responseType: "text",
          }
        )
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe(
          (data) => {
            resolve(data);
          },
          (error) => {
            console.log(error);
            alert(`Error '${error}' encountered. Couldn't set autoupdate.`);
            if (
              error.status === "200" ||
              error.error.text === "Request retrieved"
            )
              resolve(error.error.text);
            else reject(error);
          }
        );
    });
  }

  public updateCronJobs(idAndRep) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/api/cron/update/`;
      this.http
        .post(
          url,
          {
            document_id: idAndRep.id,
            repeat: idAndRep.repeat,
            multiPolygon: this.cronMultipolygon,
            multipoint: this.cronMultipoint,
          },
          {
            headers: new HttpHeaders({
              "Content-Type": "application/json",
            }),

            responseType: "text",
          }
        )
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe(
          (data) => {
            resolve(data);
          },
          (error) => {
            console.log(error);
            alert(`Error '${error}' encountered. Couldn't change autoupdate.`);
            if (
              error.status === "200" ||
              error.error.text === "Request retrieved"
            )
              resolve(error.error.text);
            else reject(error);
          }
        );
    });
  }

  /**
   * This function performs a search for cron Jobs based on the provided IDs.
   * @param id - The id of the cron job
   * @returns An object with info about the cronJob paired with that id
   */
  public getCron(id: string) {
    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/cron/${id}`)
        .subscribe((data: any) => {
          resolve(data);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Autoupdate not found.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  /**
   * This function performs a deletion of the cronJob with the provided ID.
   * @param id - A string with the ID of the cronJob we want to delete.
   * @returns A Promise that resolves deleting the requested cronJob or an error message.
   */
  public deleteCron(id: string) {
    return new Promise((resolve, reject) => {
      this.http
        .delete(`${this.baseUrl}/api/cron/${id}`)
        .subscribe(() => {
          resolve("entry deleted");
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't delete autoupdate.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  /**
   * This function performs a search for documents based on the provided IDs.
   * @param id - A string with the ID of the project we want to delete.
   * @returns A Promise that resolves deleting the requested project or an error message.
   */
  public deleteEntry(id: string) {
    return new Promise((resolve, reject) => {
      this.http
        .delete(`${this.baseUrl}/api/document/${id}`)
        .subscribe(() => {
          resolve("entry deleted");
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't delete project.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }

  public async sendToIdra(id: string) {
    let positiveResponse;
    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/idra/${id}`, {
          headers: new HttpHeaders({
            Authorization: localStorage.getItem("token") || "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCQUpfRm04T0tOdXlBaXB2MTA5VElsOENpdHpxWGlSR0FCUHI2NWx4M2c0In0.eyJleHAiOjE2ODMwMzIwOTYsImlhdCI6MTY4MzAzMTc5NiwiYXV0aF90aW1lIjoxNjgzMDMxNzk1LCJqdGkiOiJmNjZlYzg3MC1mMWM5LTQxM2UtODZiZS05ODU3ZGNlZjFlNGQiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODUvYXV0aC9yZWFsbXMvU3BvdHRlZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmNjIzYTUwNi1mODAzLTQ5NjktYTVhMi01Yjk4MjU2NDMxNjciLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJzcG90dGVkIiwic2Vzc2lvbl9zdGF0ZSI6IjBmMDk3ZTExLTZmYjUtNGNhZC1iZDkzLTMwNjA5ZDZmMmQ3NiIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLXNwb3R0ZWQiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJzaWQiOiIwZjA5N2UxMS02ZmI1LTRjYWQtYmQ5My0zMDYwOWQ2ZjJkNzYiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5hbWUiOiJSaXRhIEdhZXRhIiwicHJlZmVycmVkX3VzZXJuYW1lIjoicml0YS5nYWV0YUBlbmcuaXQiLCJnaXZlbl9uYW1lIjoiUml0YSIsImZhbWlseV9uYW1lIjoiR2FldGEiLCJlbWFpbCI6InJpdGEuZ2FldGFAZW5nLml0In0.RVBSlrsLL7TRNSxEEXkP1F0RX0cw7cwEbVHPJg9-MNzYzWHDQJE0wDqFgL2u_d_E2I9B1vu5tLbL0pEEUnmnzj5cIsIz4eP2uGbq-0wIG08Xf3eZLQjd8ZvsIact5u_L_Cs400OUMVOsUyuq-B9k39_HevsaMbHIzHpaXiWKur6J77KzIcbg-UQ5sfq11HZMkrZnxNnHWvBJxdzV-ZQiD7Lav-_AGb32ZQ0zIb5sQ2LE-CI2_531LNjXOcHu8vG6wNarJ9XZgFeXfToe9W_y1LFJ1vJbv1RvIazZiXhJlCULbZ1XI0hP-lW1PAi3XonMKcVcT1B6EiGWQy2x3CqzGg",
          }),
          responseType: "text",
        })
        .pipe(
          tap((response) => {
            console.log(response);
            positiveResponse = response;
          })
        )
        .subscribe((data) => {
          resolve(positiveResponse);
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't send dataset to Idra.`);
          if (error.status === 400 || error.error.text === "Request retrieved")
            // Resolve with an error message if the request is successful but contains an error message
            resolve(error.error.text);
          // Reject the Promise with the error
          else reject(error);
        };
    });
  }
}
