import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root',
})
export class AnalysisAvailabilityService {
  private readonly analysisAvailableCities: string[] = environment.analysisAvailableCities || [];

  isAnalysisAvailable(selectedCity: string): boolean {
    return this.analysisAvailableCities.includes(selectedCity);
  }

  getAvailableAnalysisCities(): string[] {
    return this.analysisAvailableCities;
  }
}