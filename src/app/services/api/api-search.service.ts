import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import * as turf from '@turf/turf';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment.prod';

interface SearchFacadeContext {
  storedLayers: any[];
  markers: any;
  elements: any;
  clusterOptions: any;
  cronMultipoint: any[];
  cronMultipolygon: any[];
  ngUnsubscribe: Subject<void>;
  setProgress: (value: number) => void;
  saveElement: (element: any, filter: any) => void;
  setNominalProgress: (value: number) => void;
  getNominalProgress: () => number;
  setTotalProgress: (value: number) => void;
  getTotalProgress: () => number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiSearchService {
  private readonly baseUrl = (window.env && window.env.apiUrl) || environment.base_url;

  /**
   * Creates an ApiSearchService instance.
   */
  constructor(private http: HttpClient) {}

  /**
   * Builds default JSON headers for POST calls.
   * @returns JSON headers.
   */
  private jsonHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    });
  }

  /**
   * Submits an analysis request payload to the provided endpoint.
    * @param url Target endpoint URL.
    * @param payload Request body.
    * @param ngUnsubscribe Cancellation stream.
    * @returns Promise resolved with analysis result.
   */
  submitAnalysis(url: string, payload: any, ngUnsubscribe: Subject<void>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http
        .post(url, payload, {
          headers: this.jsonHeaders(),
        })
        .pipe(takeUntil(ngUnsubscribe))
        .subscribe(
          (data) => resolve(data),
          (error) => reject(error)
        );
    });
  }

  /**
   * Returns the list of supported cities.
    * @returns Promise resolved with city options.
   */
  async getCitiesFromApi(): Promise<{ value: [[number, number], string]; label: string }[]> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return [
      { value: [[56.1629, 10.2039], 'Aarhus'], label: 'Aarhus' },
      { value: [[37.9755, 23.7348], 'Athens'], label: 'Athens' },
      { value: [[46.7712, 23.6236], 'Cluj-Napoca'], label: 'Cluj-Napoca' },
      { value: [[64.2279, 27.7284], 'Kajaani'], label: 'Kajaani' },
      { value: [[50.8823, 4.7138], 'Leuven'], label: 'Leuven' },
      { value: [[40.4165, -3.7026], 'Madrid'], label: 'Madrid' },
      { value: [[44.8015, 10.3279], 'Parma'], label: 'Parma' },
      { value: [[49.7384, 13.3736], 'Pilsen'], label: 'Pilsen' },
      { value: [[59.4370, 24.7536], 'Tallinn'], label: 'Tallinn' },
    ];
  }

  /**
   * Retrieves filter metadata from API with JSON fallback.
    * @param city Selected city.
    * @param ngUnsubscribe Cancellation stream.
    * @param testData Optional mock input for tests.
    * @returns Promise resolved with mapped controls.
   */
  async getFilters(city: string, ngUnsubscribe: Subject<void>, testData?: any): Promise<any> {
    try {
      let data: any = testData;

      if (!testData) {
        try {
          data = await this.http
            .get<any>(`${this.baseUrl}/api/filter/${city}`)
            .pipe(takeUntil(ngUnsubscribe))
            .toPromise();
        } catch (apiError) {
          console.warn('API call to /api/filter/ failed, falling back to JSON file:', apiError);
          data = await this.getFiltersFromJson();
        }
      }

      const items = Array.isArray(data) ? data : [data];

      const controls = items.reduce((acc: any[], item: any) => {
        const itemControls = item.main_filter.map((type: string) => ({
          city,
          type,
          filters: [
            {
              name: 'Type',
              output_value: 'id_category',
              type: 'checkbox',
              values: item.detail_filter.map((v: any) => {
                const label = Array.isArray(v) ? v[0] : v;
                const icon = Array.isArray(v) ? v[1] : undefined;
                return {
                  label: label.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                  value: label,
                  icon: icon || 'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg'
                };
              })
            }
          ]
        }));

        return acc.concat(itemControls);
      }, []);

      return { controls };
    } catch (error) {
      console.error('Failed to get filters from both API and JSON fallback:', error);
      throw error;
    }
  }

  /**
   * Loads filter metadata from local assets as fallback.
    * @returns Promise resolved with filter JSON payload.
   */
  getFiltersFromJson(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.get('/assets/formData.json').subscribe(
        (data: any) => resolve(data),
        (error) => {
          console.error('Failed to load filters from JSON:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Executes polygon-based searches and stores resulting features.
    * @param body Search body.
    * @param context Shared mutable facade context.
    * @returns Promise resolved when requests complete.
   */
  getPolygonData(
    body: { city: string; filter: string[]; subfilter: any },
    context: SearchFacadeContext
  ): Promise<any> {
    let tesselationResults = [];

    context.setNominalProgress(100 / context.storedLayers.length / body.subfilter.length);

    return new Promise(async (resolve, reject) => {
      for (const filter of body.subfilter) {
        const label = filter[0];
        const filterValue = filter[1];

        if (!context.markers[label]) {
          context.markers[label] = new MarkerClusterGroup(context.clusterOptions);
        }

        const url = `${this.baseUrl}/api/multipolygondata/`;

        for (const layer of context.storedLayers) {
          tesselationResults = [];

          if (!layer.properties.radius) {
            let isPolygon = true;
            let isCircle = true;
            const poly = turf.polygon(layer.geometry.coordinates);
            const centroid = turf.centroid(poly);
            const from = turf.point(layer.geometry.coordinates[0][1]);
            const to = turf.point(centroid.geometry.coordinates);
            const options: { units: turf.Units } = { units: 'kilometers' };
            const radius = turf.distance(from, to, options) * 1000;

            if (layer.geometry.coordinates[0].length > 20) {
              for (const coordinate of layer.geometry.coordinates[0]) {
                const currentFrom = turf.point(coordinate);
                const distance = turf.distance(currentFrom, to, options) * 1000;
                const tolerance = 1;

                if (distance > radius + tolerance || distance < radius - tolerance) {
                  isCircle = false;
                } else {
                  isPolygon = false;
                }
              }
            }

            if (isCircle && !isPolygon) {
              context.cronMultipoint.push(
                Object({
                  point: {
                    latitude: centroid.geometry.coordinates[1],
                    longitude: centroid.geometry.coordinates[0],
                  },
                  radius,
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
                          latitude: centroid.geometry.coordinates[1],
                          longitude: centroid.geometry.coordinates[0],
                        },
                        radius,
                        external: false,
                      },
                    ],
                  },
                  {
                    headers: this.jsonHeaders(),
                  }
                )
                .pipe(takeUntil(context.ngUnsubscribe))
                .subscribe(
                  (data) => {
                    resolve(
                      data.forEach((element: any) => {
                        if (element.features && element.features.length > 0) {
                          element.features.forEach((featureElement: any) => {
                            context.saveElement(featureElement, filter);
                          });
                        } else {
                          context.elements[label] ? null : (context.elements[label] = []);
                        }
                      })
                    );

                    const total = context.getTotalProgress() + context.getNominalProgress();
                    context.setTotalProgress(total);
                    context.setProgress(total);
                  },
                  (error) => {
                    console.log(error);

                    if (error.status === '200' || error.error.text === 'Request retrieved') {
                      resolve(error.error.text);
                    } else {
                      reject(error);
                    }
                  }
                );
            } else {
              const triangles = turf.tesselate(poly);

              for (const feature of triangles.features) {
                const polygonArray = [];
                for (const ring of feature.geometry.coordinates) {
                  for (const coordinate of ring) {
                    polygonArray.push({
                      latitude: coordinate[1],
                      longitude: coordinate[0],
                    });
                  }
                }
                tesselationResults.push(polygonArray);
              }

              tesselationResults.forEach((triangle: any) => context.cronMultipolygon.push(triangle));

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
                    headers: this.jsonHeaders(),
                  }
                )
                .pipe(takeUntil(context.ngUnsubscribe))
                .subscribe(
                  (data) => {
                    data.forEach((element: any) => {
                      if (element.features && element.features.length > 0) {
                        element.features.forEach((featureElement: any) => {
                          context.saveElement(featureElement, filter);
                        });
                      } else {
                        context.elements[label] ? null : (context.elements[label] = []);
                      }
                    });
                    resolve(data);

                    const total = context.getTotalProgress() + context.getNominalProgress();
                    context.setTotalProgress(total);
                    context.setProgress(total);
                  },
                  (error) => {
                    console.log(error);
                    if (error.status === '200' || error.error.text === 'Request retrieved') {
                      resolve(error.error.text);
                    } else {
                      reject(error);
                    }
                  }
                );
            }
          }
        }
      }
    });
  }

  /**
   * Executes point+radius searches and stores resulting features.
    * @param body Search body.
    * @param context Shared mutable facade context.
    * @returns Promise resolved when requests complete.
   */
  getPointRadiusData(body: any, context: SearchFacadeContext): Promise<any> {
    console.log(body);
    body.multipoint.forEach((circle: any) => context.cronMultipoint.push(circle));

    context.setNominalProgress(100 / context.storedLayers.length / body.subfilter.length);

    return new Promise((resolve, reject) => {
      for (const filter of body.subfilter) {
        const label = filter[0];
        const filterValue = filter[1];

        context.markers[label]
          ? null
          : (context.markers[label] = new MarkerClusterGroup(context.clusterOptions));

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
              headers: this.jsonHeaders(),
            }
          )
          .pipe(takeUntil(context.ngUnsubscribe))
          .subscribe(
            (data) => {
              resolve(
                data.forEach((element: any) => {
                  if (element.features && element.features.length > 0) {
                    element.features.forEach((featureElement: any) => {
                      context.saveElement(featureElement, filter);
                    });
                  } else {
                    context.elements[label] ? null : (context.elements[label] = []);
                  }

                  const total = context.getTotalProgress() + context.getNominalProgress();
                  context.setTotalProgress(total);
                  context.setProgress(total);
                })
              );
            },
            (error) => {
              console.log(error);

              if (error.status === '200' || error.error.text === 'Request retrieved') {
                resolve(error.error.text);
              } else {
                reject(error);
              }
            }
          );
      }
    });
  }
}
