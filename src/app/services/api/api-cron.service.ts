import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class ApiCronService {
  private readonly baseUrl = (window.env && window.env.apiUrl) || environment.base_url;

  /**
   * Creates an ApiCronService instance.
   */
  constructor(private http: HttpClient) {}

  /**
   * Creates a cron job for a document query.
   * @param idAndRep Document id + repeat configuration.
   * @param cronMultipolygon Polygon payload for refresh jobs.
   * @param cronMultipoint Point payload for refresh jobs.
   * @param ngUnsubscribe Cancellation stream.
   * @returns Promise resolved with backend response.
   */
  setCronJob(idAndRep: any, cronMultipolygon: any[], cronMultipoint: any[], ngUnsubscribe: Subject<void>) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/api/cron/set/`;
      this.http
        .post(
          url,
          {
            document_id: idAndRep.id,
            repeat: idAndRep.repeat,
            multiPolygon: cronMultipolygon,
            multipoint: cronMultipoint,
          },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            responseType: 'text',
          }
        )
        .pipe(takeUntil(ngUnsubscribe))
        .subscribe(
          (data) => {
            resolve(data);
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
    });
  }

  /**
    * Updates an existing cron job.
    * @param idAndRep Document id + repeat configuration.
    * @param cronMultipolygon Polygon payload for refresh jobs.
    * @param cronMultipoint Point payload for refresh jobs.
    * @param ngUnsubscribe Cancellation stream.
    * @returns Promise resolved with backend response.
   */
  updateCronJobs(idAndRep: any, cronMultipolygon: any[], cronMultipoint: any[], ngUnsubscribe: Subject<void>) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/api/cron/update/`;
      this.http
        .post(
          url,
          {
            document_id: idAndRep.id,
            repeat: idAndRep.repeat,
            multiPolygon: cronMultipolygon,
            multipoint: cronMultipoint,
          },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            responseType: 'text',
          }
        )
        .pipe(takeUntil(ngUnsubscribe))
        .subscribe(
          (data) => {
            resolve(data);
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
    });
  }

  /**
    * Retrieves a cron job by id.
    * @param id Cron id.
    * @returns Promise resolved with cron data or null.
   */
  getCron(id: string) {
    return new Promise((resolve) => {
      this.http
        .get(`${this.baseUrl}/api/cron/${id}`)
        .subscribe({
          next: (data: any) => {
            resolve(data);
          },
          error: (error) => {
            console.error('Cron fetch failed:', error);
            resolve(null);
          }
        });
    });
  }

  /**
   * Deletes a cron job by id.
    * @param id Cron id.
    * @returns Promise resolved when deletion completes.
   */
  deleteCron(id: string) {
    return new Promise((resolve, reject) => {
      this.http
        .delete(`${this.baseUrl}/api/cron/${id}`)
        .subscribe(() => {
          resolve('entry deleted');
        }),
        (error) => {
          console.log(error);
          alert(`Error '${error}' encountered. Couldn't delete autoupdate.`);
          if (error.status === 400 || error.error.text === 'Request retrieved') {
            resolve(error.error.text);
          } else {
            reject(error);
          }
        };
    });
  }
}
