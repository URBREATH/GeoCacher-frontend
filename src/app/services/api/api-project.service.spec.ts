import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiProjectService } from './api-project.service';
import { environment } from '../../../environments/environment.prod';

describe('ApiProjectService GeoServer publication', () => {
  let service: ApiProjectService;
  let httpMock: HttpTestingController;
  const baseUrl = (window.env && window.env.apiUrl) || environment.base_url;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiProjectService],
    });

    service = TestBed.inject(ApiProjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts GeoServer publication through the backend document endpoint', () => {
    service.startGeoserverPublication('project-1').subscribe((response) => {
      expect(response.status).toBe('pending');
      expect(response.importId).toBe('import-1');
    });

    const request = httpMock.expectOne(`${baseUrl}/api/document/project-1/geoserver-publication`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({
      documentId: 'project-1',
      status: 'pending',
      importId: 'import-1',
    });
  });

  it('reads GeoServer publication status through the backend document endpoint', () => {
    service.getGeoserverPublicationStatus('project-1').subscribe((response) => {
      expect(response.status).toBe('completed');
      expect(response.publicDataUrl).toBe('https://example.test/data');
    });

    const request = httpMock.expectOne(`${baseUrl}/api/document/project-1/geoserver-publication`);
    expect(request.request.method).toBe('GET');

    request.flush({
      documentId: 'project-1',
      status: 'completed',
      publicDataUrl: 'https://example.test/data',
    });
  });

  it('updates an existing GeoServer publication through the backend document endpoint', () => {
    service.updateGeoserverPublication('project-1').subscribe((response) => {
      expect(response.status).toBe('pending');
      expect(response.layer).toBe('existing-layer');
    });

    const request = httpMock.expectOne(`${baseUrl}/api/document/project-1/geoserver-publication`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});

    request.flush({
      documentId: 'project-1',
      status: 'pending',
      layer: 'existing-layer',
    });
  });

  it('publishes on IDRA with GeoServer distribution through the backend endpoint', () => {
    service.publishOnIdra('project-1', true).subscribe((response) => {
      expect(response.onIDRA).toBeTrue();
      expect(response.includedGeoserverDistribution).toBeTrue();
    });

    const request = httpMock.expectOne(`${baseUrl}/api/idra/project-1/publish`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ includeGeoserverDistribution: true });

    request.flush({
      documentId: 'project-1',
      onIDRA: true,
      includedGeoserverDistribution: true,
    });
  });

  it('publishes on IDRA without GeoServer distribution through the backend endpoint', () => {
    service.publishOnIdra('project-1', false).subscribe((response) => {
      expect(response.onIDRA).toBeTrue();
      expect(response.includedGeoserverDistribution).toBeFalse();
    });

    const request = httpMock.expectOne(`${baseUrl}/api/idra/project-1/publish`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ includeGeoserverDistribution: false });

    request.flush({
      documentId: 'project-1',
      onIDRA: true,
      includedGeoserverDistribution: false,
    });
  });

  it('adds GeoServer distribution to an existing IDRA dataset through the backend endpoint', () => {
    service.addGeoserverDistributionToIdra('project-1').subscribe((response) => {
      expect(response.idraHasGeoserverDistribution).toBeTrue();
      expect(response.geoserverDistributionId).toBe('project-1:geoserver');
    });

    const request = httpMock.expectOne(`${baseUrl}/api/idra/project-1/geoserver-distribution`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({
      documentId: 'project-1',
      idraHasGeoserverDistribution: true,
      geoserverDistributionId: 'project-1:geoserver',
    });
  });
});
