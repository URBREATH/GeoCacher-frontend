import { Injectable } from '@angular/core';
import * as L from 'leaflet';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: any;
  private editableLayers: any;
  private osm: any;
  private enableInMapLabelEditor: boolean = false;
  private labelControl: any;
  private selectedLabelLayer: any;
  private labelControlContainer: HTMLElement | null = null;
  private labelInput: HTMLInputElement | null = null;
  private labelSelect: HTMLSelectElement | null = null;
  private colorInput: HTMLInputElement | null = null;
  private showLabelTooltips: boolean = true;

  constructor() {
    // Initialize the base tile layer
    this.osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    });
  }

  /**
   * Initialize a map in the given container with the specified center and custom draw options
   * @param containerId The HTML element ID where the map should be rendered
   * @param center The center coordinates [lat, lng]
   * @param zoom The initial zoom level
   * @param drawOptions Custom draw control options (optional)
   * @param mapOptions Additional map feature options
   * @returns The initialized map instance
   */
  initializeMap(
    containerId: string,
    center: [number, number],
    zoom: number = 13,
    drawOptions?: any,
    mapOptions?: { enableInMapLabelEditor?: boolean, showLabelTooltips?: boolean }
  ): any {
    // Clear any existing map
    this.clearMap();
    this.enableInMapLabelEditor = !!(mapOptions && mapOptions.enableInMapLabelEditor);
    this.showLabelTooltips = mapOptions && mapOptions.showLabelTooltips !== undefined ? !!mapOptions.showLabelTooltips : true;

    this.map = L.map(containerId, {
      center: center,
      zoom: zoom,
      layers: [this.osm],
    });

    // Initialize editable layers
    this.editableLayers = new L.FeatureGroup();
    this.map.addLayer(this.editableLayers);

    // Add draw controls with custom options or default
    this.addDrawControls(drawOptions);

    return this.map;
  }

  /**
   * Add drawing controls to the map
   * @param customOptions Custom draw control options
   */
  private addDrawControls(customOptions?: any): void {
    const defaultOptions = {
      draw: {
        polygon: {
          shapeOptions: {
            color: "#3388ff",
          },
          showArea: true,
        },
        polyline: false,
        circle: {
          shapeOptions: {
            color: "#3388ff",
          },
        },
        rectangle: {
          shapeOptions: {
            color: "#3388ff",
          },
        },
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: this.editableLayers,
        remove: true,
      },
    };

    const drawOptions = customOptions ? { ...defaultOptions, ...customOptions } : defaultOptions;

    const drawControl = new L.Control.Draw(drawOptions);
    this.map.addControl(drawControl);

    if (this.enableInMapLabelEditor) {
      this.addLabelControl();
    }

    // Handle draw events
    this.map.on("draw:created", (e: any) => {
      const layer = e.layer;
      this.bindLabelAndClickHandler(layer);

      this.editableLayers.addLayer(layer);
      this.refreshLabelOptions();
      if (this.enableInMapLabelEditor) {
        this.selectLayerForLabel(layer, true);
      }
    });

    this.map.on('draw:edited', (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        const feat = this.getLayerFeature(layer);
        this.applyLabelToLayer(layer, feat.properties.label || '');
        this.applyColorToLayer(layer, feat.properties.color || '');
        this.bindLabelAndClickHandler(layer, feat);
      });
      this.refreshLabelOptions();
    });

    this.map.on('draw:deleted', (e: any) => {
      if (!this.enableInMapLabelEditor) {
        return;
      }

      if (!this.selectedLabelLayer) {
        return;
      }

      let deletedSelectedLayer = false;
      e.layers.eachLayer((layer: any) => {
        if (layer === this.selectedLabelLayer) {
          deletedSelectedLayer = true;
        }
      });

      if (deletedSelectedLayer) {
        this.selectedLabelLayer = null;
        this.toggleLabelControl(false);
      }

      this.refreshLabelOptions();
    });
  }

  private addLabelControl(): void {
    if (!this.map) {
      return;
    }

    if (this.labelControl && this.labelControl.remove) {
      this.labelControl.remove();
    }

    const LabelControl = L.Control.extend({
      onAdd: () => {
      const container = L.DomUtil.create('div', 'leaflet-bar polygon-label-control polygon-label-control--hidden');
      container.innerHTML =
        '<div class="polygon-label-control__title">Polygon label</div>' +
        '<input type="text" class="polygon-label-control__input" placeholder="Set label" />' +
        '<select class="polygon-label-control__select">' +
          '<option value="">-- pick existing --</option>' +
        '</select>' +
        '<div class="polygon-label-control__color-row">' +
          '<span class="polygon-label-control__color-label">Color</span>' +
          '<input type="color" class="polygon-label-control__color" value="#3388ff" />' +
        '</div>';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      this.labelControlContainer = container;
      this.labelInput = container.querySelector('.polygon-label-control__input') as HTMLInputElement;
      this.labelSelect = container.querySelector('.polygon-label-control__select') as HTMLSelectElement;
      this.colorInput = container.querySelector('.polygon-label-control__color') as HTMLInputElement;

      if (this.labelInput) {
        L.DomEvent.on(this.labelInput, 'keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter' && this.selectedLabelLayer) {
            this.applyLabelToLayer(this.selectedLabelLayer, this.labelInput ? this.labelInput.value : '');
            const color = this.colorInput ? this.colorInput.value : '';
            this.syncColorAcrossLabel(this.labelInput ? this.labelInput.value : '', color);
            this.refreshLabelOptions();
          }
        });
        L.DomEvent.on(this.labelInput, 'blur', () => {
          if (!this.selectedLabelLayer || !this.labelInput) { return; }
          this.applyLabelToLayer(this.selectedLabelLayer, this.labelInput.value || '');
          const color = this.colorInput ? this.colorInput.value : '';
          this.syncColorAcrossLabel(this.labelInput.value || '', color);
          this.refreshLabelOptions();
        });
      }


      if (this.labelSelect) {
        L.DomEvent.on(this.labelSelect, 'change', () => {
          if (!this.selectedLabelLayer || !this.labelSelect) { return; }
          const selectedLabel = this.labelSelect.value || '';
          if (this.labelInput) { this.labelInput.value = selectedLabel; }
          if (selectedLabel) {
            this.applyLabelToLayer(this.selectedLabelLayer, selectedLabel);
            const existingColor = this.getColorForLabel(selectedLabel);
            if (existingColor && this.colorInput) {
              this.colorInput.value = existingColor;
            }
            this.syncColorAcrossLabel(selectedLabel, existingColor || (this.colorInput ? this.colorInput.value : '#3388ff'));
          }
          this.labelSelect.value = '';
        });
      }

      if (this.colorInput) {
        L.DomEvent.on(this.colorInput, 'change', () => {
          if (!this.selectedLabelLayer) { return; }
          const color = this.colorInput ? this.colorInput.value : '';
          const feature = this.getLayerFeature(this.selectedLabelLayer);
          const label = feature && feature.properties && feature.properties.label ? feature.properties.label : '';
          this.syncColorAcrossLabel(label, color);
        });
      }

        return container;
      }
    });

    this.labelControl = new LabelControl({ position: 'topright' });

    this.labelControl.addTo(this.map);
    this.refreshLabelOptions();
    this.toggleLabelControl(false);
  }

  private getUsedLabels(): string[] {
    const labels = new Set<string>();

    if (!this.editableLayers) {
      return [];
    }

    this.editableLayers.eachLayer((layer: any) => {
      const feature = this.getLayerFeature(layer);
      const label = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (label) {
        labels.add(label);
      }
    });

    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }

  private getColorForLabel(label: string): string | null {
    if (!this.editableLayers || !label) { return null; }
    let found: string | null = null;
    this.editableLayers.eachLayer((layer: any) => {
      if (found) { return; }
      const feature = this.getLayerFeature(layer);
      const layerLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim() : '';
      if (layerLabel === label.trim() && feature.properties.color) {
        found = feature.properties.color;
      }
    });
    return found;
  }

  private refreshLabelOptions(): void {
    if (!this.labelSelect) { return; }
    const labels = this.getUsedLabels();
    this.labelSelect.innerHTML = '<option value="">-- pick existing --</option>';
    labels.forEach((label: string) => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      this.labelSelect!.appendChild(option);
    });
    this.labelSelect.value = '';
  }

  private toggleLabelControl(visible: boolean): void {
    if (!this.labelControlContainer) {
      return;
    }

    if (visible) {
      this.labelControlContainer.classList.remove('polygon-label-control--hidden');
    } else {
      this.labelControlContainer.classList.add('polygon-label-control--hidden');
    }
  }

  private getLayerFeature(layer: any, feature?: any): any {
    const existingFeature = feature || (layer as any).feature || layer.toGeoJSON();
    existingFeature.properties = existingFeature.properties || {};
    (layer as any).feature = existingFeature;
    return existingFeature;
  }

  private applyLabelToLayer(layer: any, labelValue: string): void {
    const feature = this.getLayerFeature(layer);
    const trimmedLabel = (labelValue || '').trim();

    if (!trimmedLabel) {
      delete feature.properties.label;
      try {
        if ((layer as any).getTooltip && (layer as any).getTooltip()) {
          layer.unbindTooltip();
        }
      } catch (err) {}
      return;
    }

    feature.properties.label = trimmedLabel;

    if (!this.showLabelTooltips) {
      try {
        if ((layer as any).getTooltip && (layer as any).getTooltip()) {
          layer.unbindTooltip();
        }
      } catch (err) {}
      return;
    }

    try {
      if ((layer as any).getTooltip && (layer as any).getTooltip()) {
        (layer as any).getTooltip().setContent(trimmedLabel);
      } else {
        layer.bindTooltip(trimmedLabel, { permanent: true, direction: 'center', className: 'editable-label' }).openTooltip();
      }
    } catch (err) {}
  }

  private getLayerColor(layer: any): string {
    const feature = this.getLayerFeature(layer);
    if (feature && feature.properties && feature.properties.color) {
      return feature.properties.color;
    }

    const fromOptions = layer && layer.options && layer.options.color ? layer.options.color : '';
    return fromOptions || '#3388ff';
  }

  private applyColorToLayer(layer: any, colorValue: string): void {
    const feature = this.getLayerFeature(layer);
    const trimmedColor = (colorValue || '').trim();
    const color = trimmedColor || '#3388ff';

    feature.properties.color = color;

    try {
      if (layer && typeof layer.setStyle === 'function') {
        layer.setStyle({ color });
      }
    } catch (err) {}
  }

  private syncColorAcrossLabel(label: string, color: string): void {
    const trimmedLabel = (label || '').trim();
    if (!this.editableLayers) { return; }
    this.editableLayers.eachLayer((layer: any) => {
      const feature = this.getLayerFeature(layer);
      const layerLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';
      if (trimmedLabel && layerLabel === trimmedLabel) {
        this.applyColorToLayer(layer, color);
      } else if (!trimmedLabel && layer === this.selectedLabelLayer) {
        this.applyColorToLayer(layer, color);
      }
    });
  }

  private selectLayerForLabel(layer: any, focusInput: boolean = false): void {
    const feature = this.getLayerFeature(layer);
    this.selectedLabelLayer = layer;
    this.toggleLabelControl(true);

    this.refreshLabelOptions();

    if (this.labelInput) {
      this.labelInput.value = feature.properties.label || '';
      if (focusInput) {
        this.labelInput.focus();
        this.labelInput.select();
      }
    }

    if (this.labelSelect) {
      this.labelSelect.value = '';
    }

    if (this.colorInput) {
      this.colorInput.value = this.getLayerColor(layer);
    }
  }

  private bindLabelAndClickHandler(layer: any, feature?: any): void {
    const currentFeature = this.getLayerFeature(layer, feature);
    this.applyLabelToLayer(layer, currentFeature.properties.label || '');
    this.applyColorToLayer(layer, currentFeature.properties.color || this.getLayerColor(layer));

    if (!this.enableInMapLabelEditor) {
      return;
    }

    layer.on('click', () => {
      this.selectLayerForLabel(layer, true);
    });
  }

  loadStoredLayers(
    storedLayers: any[] = [],
    options?: {
      style?: any,
      addToEditableLayers?: boolean,
      addToMap?: boolean,
      enableLabelEditing?: boolean,
    }
  ): void {
    const style = (options && options.style) || { color: '#3388ff', opacity: 0.5, weight: 4 };
    const addToEditableLayers = options && options.addToEditableLayers !== undefined ? options.addToEditableLayers : true;
    const addToMap = options && options.addToMap !== undefined ? options.addToMap : false;
    const enableLabelEditing = options && options.enableLabelEditing !== undefined ? options.enableLabelEditing : false;

    if (!storedLayers || storedLayers.length === 0) {
      return;
    }

    storedLayers.forEach((geoJson: any) => {
      const geoLayer = L.geoJSON(geoJson, {
        style,
        pointToLayer: (feature: any, latlng: any) => {
          if (feature && feature.properties && feature.properties.radius) {
            return new L.Circle(latlng, feature.properties.radius);
          }
        },
        onEachFeature: (feature: any, layer: any) => {
          if (enableLabelEditing) {
            this.bindLabelAndClickHandler(layer, feature || {});
          } else {
            const currentFeature = this.getLayerFeature(layer, feature || {});
            this.applyLabelToLayer(layer, currentFeature.properties.label || '');
          }

          if (addToEditableLayers) {
            this.addEditableLayer(layer);
          } else if (addToMap && this.map) {
            layer.addTo(this.map);
          }
        },
      });

      if (!addToEditableLayers && addToMap && this.map) {
        geoLayer.addTo(this.map);
      }
    });
  }

  hasUserDrawings(minLayerCount: number = 3): boolean {
    let layerCount = 0;

    if (!this.map) {
      return false;
    }

    this.map.eachLayer(() => {
      layerCount++;
    });

    return layerCount > minLayerCount;
  }

  serializeDrawings(): any[] {
    const storedLayers: any[] = [];

    if (!this.map || !this.map._layers) {
      return storedLayers;
    }

    Object.values(this.map._layers).forEach((entry: any) => {
      if (
        entry instanceof L.Circle ||
        entry instanceof L.Polygon ||
        entry instanceof L.Polyline
      ) {
        const json = entry.toGeoJSON();

        if (entry instanceof L.Circle) {
          json.properties = json.properties || {};
          json.properties.radius = entry.getRadius();
        }

        if (!storedLayers.includes(json)) {
          storedLayers.push(json);
        }
      }
    });

    return storedLayers;
  }

  initializeMapWithOverlays(
    containerId: string,
    center: [number, number],
    overlays: { [key: string]: any } = {},
    zoom: number = 13
  ): any {
    const map = this.initializeMap(containerId, center, zoom);
    L.control.layers(null, overlays).addTo(map);

    for (const key in overlays) {
      if (Object.prototype.hasOwnProperty.call(overlays, key)) {
        overlays[key].addTo(map);
      }
    }

    return map;
  }

  /**
   * Clear the map and remove all layers
   */
  clearMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.enableInMapLabelEditor = false;
      this.showLabelTooltips = true;
      this.selectedLabelLayer = null;
      this.labelControl = null;
      this.labelControlContainer = null;
      this.labelInput = null;
      this.labelSelect = null;
      this.colorInput = null;
    }
  }

  /**
   * Get the current map instance
   */
  getMap(): any {
    return this.map;
  }

  /**
   * Get the editable layers group
   */
  getEditableLayers(): any {
    return this.editableLayers;
  }

  /**
   * Add a layer to the editable layers group
   * @param layer The layer to add
   */
  addEditableLayer(layer: any): void {
    if (this.editableLayers) {
      this.editableLayers.addLayer(layer);
    }
  }

  /**
   * Remove all layers from the editable layers group
   */
  clearEditableLayers(): void {
    if (this.editableLayers) {
      this.editableLayers.clearLayers();
    }
  }

  /**
   * Get all features from editable layers as GeoJSON
   * @returns Array of GeoJSON features
   */
  getEditableFeatures(): any[] {
    const features: any[] = [];
    if (this.editableLayers) {
      this.editableLayers.eachLayer((layer: any) => {
        features.push(layer.toGeoJSON());
      });
    }
    return features;
  }

  /**
   * Convert circle to polygon for analysis
   * @param circle The circle layer
   * @param numPoints Number of points for the polygon approximation
   * @returns Array of coordinates
   */
  circleToPolygon(circle: any, numPoints: number = 32): [number, number][] {
    const center = circle.getLatLng();
    const radius = circle.getRadius();
    const coords: [number, number][] = [];

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const lat = center.lat + (radius / 111320) * Math.cos(angle);
      const lng = center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
      coords.push([lng, lat]);
    }

    return coords;
  }

  /**
   * Extract polygon coordinate arrays from editable layers for analysis submission.
   * @param coordinateOrder Return points as [lng, lat] or [lat, lng]
   * @returns Array of polygon coordinate arrays
   */
  extractPolygonCoordinatesForAnalysis(coordinateOrder: 'lnglat' | 'latlng' = 'lnglat'): [number, number][][] {
    const polygons: [number, number][][] = [];

    if (!this.editableLayers) {
      return polygons;
    }

    const toOrder = ([lng, lat]: [number, number]): [number, number] => {
      return coordinateOrder === 'latlng' ? [lat, lng] : [lng, lat];
    };

    this.editableLayers.eachLayer((layer: any) => {
      let coords: [number, number][] = [];

      if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
        const geoJson = layer.toGeoJSON();
        const rawCoords = geoJson && geoJson.geometry && geoJson.geometry.coordinates && geoJson.geometry.coordinates[0]
          ? geoJson.geometry.coordinates[0]
          : [];
        coords = rawCoords.map(([lng, lat]: [number, number]) => toOrder([lng, lat]));
      } else if (layer instanceof L.Circle) {
        coords = this.circleToPolygon(layer).map((point: [number, number]) => toOrder(point));
      }

      if (coords.length > 0) {
        polygons.push(coords);
      }
    });

    return polygons;
  }

  /**
   * Extract polygons from editable layers for analysis submission
   * @returns Array of polygon coordinates
   */
  extractPolygonsForAnalysis(): any[] {
    return this.extractPolygonCoordinatesForAnalysis('lnglat').map((coords: [number, number][]) => ({
      type: 'Polygon',
      coordinates: [coords],
    }));
  }

  /**
   * Set the map view to the specified center and zoom
   * @param center The center coordinates [lat, lng]
   * @param zoom The zoom level
   */
  setView(center: [number, number], zoom?: number): void {
    if (this.map) {
      this.map.setView(center, zoom);
    }
  }

  /**
   * Fit the map to show all editable layers
   */
  fitBounds(): void {
    if (this.map && this.editableLayers && this.editableLayers.getLayers().length > 0) {
      this.map.fitBounds(this.editableLayers.getBounds());
    }
  }
}