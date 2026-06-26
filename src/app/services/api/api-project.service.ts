import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment.prod';

interface ProjectFacadeContext {
  elements: any;
  markers: any;
  allProjects: any[];
  clusterOptions: any;
  saveElement: (element: any, filter: any) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ApiProjectService {
  private readonly baseUrl = (window.env && window.env.apiUrl) || environment.base_url;

  /**
   * Creates an ApiProjectService instance.
   */
  constructor(private http: HttpClient) {}

  /**
   * Builds default JSON headers for project write operations.
    * @returns JSON headers.
   */
  private jsonHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    });
  }

  /**
   * Persists a new query/project document.
    * @param queryDetails Query metadata and geometry.
    * @param context Shared mutable facade context.
    * @returns Promise resolved with backend response.
   */
  saveSearch(queryDetails: any, context: ProjectFacadeContext): Promise<any> {
    return new Promise((resolve, reject) => {
      const featuresArray = [];
      const subFilters = [];

      for (const filter of queryDetails.subFilters) {
        const label = filter[0];
        subFilters.push(filter[1]);
        for (const element of context.elements[label]) {
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
          type: 'Feature',
          features: featuresArray,
        },
      };

      this.http
        .post(url, body, {
          headers: this.jsonHeaders(),
          responseType: 'text',
        })
        .subscribe({
          next: (data) => resolve(data),
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error.text === 'Request retrieved') {
              resolve(error.error.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }

  /**
   * Updates an existing query/project document.
    * @param queryDetails Query metadata and geometry.
    * @param context Shared mutable facade context.
    * @returns Promise resolved with backend response.
   */
  updateSearch(queryDetails: any, context: ProjectFacadeContext): Promise<any> {
    return new Promise((resolve, reject) => {
      const featuresArray = [];
      const subFilters = [];

      for (const filter of queryDetails.subFilters) {
        const label = filter[0];
        subFilters.push(filter[1]);
        for (const element of context.elements[label]) {
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
          type: 'Feature',
          features: featuresArray,
        },
      };

      this.http
        .post(url, body, {
          headers: this.jsonHeaders(),
          responseType: 'text',
        })
        .subscribe({
          next: (data) => resolve(data),
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error.text === 'Request retrieved') {
              resolve(error.error.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }

  /**
   * Retrieves a single project document and rebuilds map overlays.
    * @param id Project id array.
    * @param context Shared mutable facade context.
    * @returns Promise resolved with project data.
   */
  getDocument(id: string[], context: ProjectFacadeContext) {
    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/document/${id}`)
        .subscribe({
          next: (data: any) => {
            data.geojson.features.forEach((element: any) => {
              const label = element.properties.label;
              const subFilter = element.properties.subFilter;
              const filter = [label, subFilter];
              if (!context.markers[label]) {
                context.markers[label] = new MarkerClusterGroup(context.clusterOptions);
              }

              context.saveElement(element, filter);
            });

            resolve(data);
          },
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error.text === 'Request retrieved') {
              resolve(error.error.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }

  /**
   * Retrieves all stored project summaries.
    * @param context Shared mutable facade context.
    * @returns Promise resolved with project list.
   */
  getAll(context: ProjectFacadeContext) {
    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/document/getdocuments`)
        .subscribe({
          next: (data: any) => {
            context.allProjects.length = 0;
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
              .forEach((e: any) => context.allProjects.push(e));

            resolve(context.allProjects);
          },
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error?.text === 'Request retrieved') {
              resolve(error.error?.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }

  /**
   * Deletes a project document by id.
    * @param id Project id.
    * @returns Promise resolved when deletion completes.
   */
  deleteEntry(id: string) {
    return new Promise((resolve, reject) => {
      this.http
        .delete(`${this.baseUrl}/api/document/${id}`)
        .subscribe({
          next: () => resolve('entry deleted'),
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error.text === 'Request retrieved') {
              resolve(error.error.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }

  /**
   * Sends a project dataset to IDRA.
    * @param id Project id.
    * @returns Promise resolved with IDRA response.
   */
  sendToIdra(id: string) {
    let positiveResponse: any;

    return new Promise((resolve, reject) => {
      this.http
        .get(`${this.baseUrl}/api/idra/${id}`, {
          responseType: 'text',
        })
        .pipe(
          tap((response) => {
            positiveResponse = response;
          })
        )
        .subscribe({
          next: () => resolve(positiveResponse),
          error: (error) => {
            console.log(error);

            if (error.status === 400 || error.error.text === 'Request retrieved') {
              resolve(error.error.text);
            } else {
              reject(error);
            }
          }
        });
    });
  }
}
