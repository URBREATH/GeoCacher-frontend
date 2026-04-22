import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import * as L from 'leaflet';
import * as turf from '@turf/turf';
import { MapGeometryService } from './map/map-geometry.service';
import { BehaviorSubject, Observable } from 'rxjs';

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
  private labelSelect: HTMLSelectElement | null = null;
  private colorInput: HTMLInputElement | null = null;
  private labelControlResizeHandler: (() => void) | null = null;
  private showLabelTooltips: boolean = true;
  private availableLabelOptions: string[] = [];
  private pendingDrawLabel: string = '';
  private pendingDrawColor: string = '#3388ff';
  private langChangeSubscription: any;
  private selectedPolygonLabelSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private infoControl: any;

  readonly selectedPolygonLabel$: Observable<string> = this.selectedPolygonLabelSubject.asObservable();

  /**
   * Normalizes label values by trimming and removing duplicates/empties.
   */
  private normalizeAvailableLabels(labels?: string[]): string[] {
    if (!Array.isArray(labels)) {
      return [];
    }

    return labels
      .map((label: string) => String(label || '').trim())
      .filter((label: string, index: number, allLabels: string[]) => !!label && allLabels.indexOf(label) === index);
  }

  /**
   * Initializes base map dependencies.
   */
  constructor(
    private mapGeometryService: MapGeometryService,
    private translate: TranslateService
  ) {
    // Initialize the base tile layer
    this.osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    });

    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateLabelControlTranslations();
    });
  }

  /**
   * Refreshes in-map label control static texts when language changes.
   */
  private updateLabelControlTranslations(): void {
    if (!this.labelControlContainer) {
      return;
    }

    const polygonLabelTitle = this.translate.instant('polygon_label_title');
    const colorLabel = this.translate.instant('polygon_label_color');

    const titleNode = this.labelControlContainer.querySelector('.polygon-label-control__title');
    if (titleNode) {
      titleNode.textContent = polygonLabelTitle;
    }

    const colorLabelNode = this.labelControlContainer.querySelector('.polygon-label-control__color-label');
    if (colorLabelNode) {
      colorLabelNode.textContent = colorLabel;
    }

    this.refreshLabelOptions();
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
    mapOptions?: { enableInMapLabelEditor?: boolean, showLabelTooltips?: boolean, availableLabels?: string[] }
  ): any {
    // Clear any existing map
    this.clearMap();
    this.enableInMapLabelEditor = !!(mapOptions && mapOptions.enableInMapLabelEditor);
    this.showLabelTooltips = mapOptions && mapOptions.showLabelTooltips !== undefined ? !!mapOptions.showLabelTooltips : true;
    this.availableLabelOptions = this.normalizeAvailableLabels(mapOptions && mapOptions.availableLabels);

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

    // Add info control for vertex count and simplification
    this.addInfoControl();

    return this.map;
  }

  /**
   * Updates available label choices for in-map label editing.
   */
  setAvailableLabels(labels: string[]): void {
    this.availableLabelOptions = this.normalizeAvailableLabels(labels);
    this.refreshLabelOptions();
    this.refreshLayerTooltipsVisibility();
  }

  /**
   * Emits the currently selected polygon label for external consumers.
   */
  private emitSelectedPolygonLabel(label: string): void {
    this.selectedPolygonLabelSubject.next(String(label || '').trim());
  }

  /**
   * Re-renders tooltip visibility based on the active allowed labels.
   */
  private refreshLayerTooltipsVisibility(): void {
    if (!this.editableLayers) {
      return;
    }

    const allowedLabels = new Set(this.availableLabelOptions.map((label: string) => String(label || '').trim()));

    this.editableLayers.eachLayer((layer: any) => {
      const feature = this.getLayerFeature(layer);
      const layerLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (!this.showLabelTooltips || !layerLabel || !allowedLabels.has(layerLabel)) {
        try {
          if ((layer as any).getTooltip && (layer as any).getTooltip()) {
            layer.unbindTooltip();
          }
        } catch (err) {}
        return;
      }

      try {
        if ((layer as any).getTooltip && (layer as any).getTooltip()) {
          (layer as any).getTooltip().setContent(layerLabel);
        } else {
          layer.bindTooltip(layerLabel, { permanent: true, direction: 'center', className: 'editable-label' }).openTooltip();
        }
      } catch (err) {}
    });
  }

  /**
   * Returns true when the given draw layer type requires a selected label.
   */
  private isLabelRequiredForDrawType(layerType: string): boolean {
    const normalized = String(layerType || '').toLowerCase();
    return normalized === 'polygon' || normalized === 'rectangle' || normalized === 'circle';
  }

  /**
   * Stops the currently active draw handler (Leaflet.Draw internal API).
   */
  private stopActiveDrawMode(): void {
    if (!this.map) {
      return;
    }

    const activeHandler = this.map && this.map._toolbars && this.map._toolbars.draw && this.map._toolbars.draw._activeMode
      ? this.map._toolbars.draw._activeMode.handler
      : null;

    if (activeHandler && typeof activeHandler.disable === 'function') {
      activeHandler.disable();
    }
  }

  /**
   * Enforces that a label is selected before drawing labeled geometries.
   */
  private ensureLabelSelectedBeforeDraw(layerType: string, showMessage: boolean = false): boolean {
    if (!this.enableInMapLabelEditor) {
      return true;
    }

    if (!this.isLabelRequiredForDrawType(layerType)) {
      return true;
    }

    const selectedLabel = String(this.pendingDrawLabel || '').trim();
    if (selectedLabel) {
      return true;
    }

    this.stopActiveDrawMode();

    this.selectedLabelLayer = null;
    this.toggleLabelControl(true);
    this.refreshLabelOptions();

    if (this.labelSelect) {
      this.labelSelect.value = '';
      this.labelSelect.focus();
    }

    this.emitSelectedPolygonLabel('');

    if (showMessage) {
      alert(this.translate.instant('select_label') || 'Select label');
    }

    return false;
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

    this.map.on('draw:drawstart', (e: any) => {
      if (!this.enableInMapLabelEditor) {
        return;
      }

      const drawType = String(e && e.layerType ? e.layerType : '').toLowerCase();
      const supportsLabel = this.isLabelRequiredForDrawType(drawType);
      if (!supportsLabel) {
        return;
      }

      this.selectedLabelLayer = null;
      this.toggleLabelControl(true);
      this.refreshLabelOptions();

      if (this.labelSelect) {
        this.labelSelect.value = this.pendingDrawLabel || '';
        this.labelSelect.focus();
      }

      if (this.colorInput) {
        this.colorInput.value = this.pendingDrawColor || '#3388ff';
      }

      this.ensureLabelSelectedBeforeDraw(drawType, false);
    });

    this.map.on('draw:drawstop', () => {
      if (!this.enableInMapLabelEditor) {
        return;
      }

      if (!this.selectedLabelLayer) {
        this.toggleLabelControl(false);
        this.emitSelectedPolygonLabel('');
      }
    });

    // Handle draw events
    this.map.on("draw:created", (e: any) => {
      const layerType = String(e && e.layerType ? e.layerType : '').toLowerCase();
      if (!this.ensureLabelSelectedBeforeDraw(layerType, true)) {
        return;
      }

      const layer = e.layer;

      if (this.enableInMapLabelEditor) {
        this.applyLabelToLayer(layer, this.pendingDrawLabel || '');
        this.applyColorToLayer(layer, this.pendingDrawColor || '#3388ff');
      }

      if (this.enableInMapLabelEditor && this.pendingDrawLabel && !this.isLayerInsideAnUnlabeledBoundary(layer)) {
        const warningMessage = this.translate.instant('labeled_inside_unlabeled');
        const fallbackMessage = 'Labeled polygons must be drawn inside the unlabeled polygon.';
        alert(warningMessage && warningMessage !== 'labeled_inside_unlabeled' ? warningMessage : fallbackMessage);
        return;
      }

      this.bindLabelAndClickHandler(layer);

      this.editableLayers.addLayer(layer);
      const mergedLayer = this.mergePolygonsByLabel(this.pendingDrawLabel || '');
      this.refreshLabelOptions();
      if (this.enableInMapLabelEditor) {
        this.selectLayerForLabel(mergedLayer || layer, true);
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
        this.emitSelectedPolygonLabel('');
      }

      this.refreshLabelOptions();
    });
  }

  /**
   * Adds the info control for vertex count and simplification status.
   */
  private addInfoControl(): void {
    if (!this.map) {
      return;
    }

    if (this.infoControl && this.infoControl.remove) {
      this.infoControl.remove();
    }

    const InfoControlClass = L.Control.extend({
      onAdd: () => {
        const div = L.DomUtil.create('div', 'info-control');
        const title = this.translate.instant('map_info_title') || 'Info';
        const vertexLabel = this.translate.instant('vertex_count_label') || 'Vertex count:';
        const reductionLabel = this.translate.instant('reduction_label') || 'Reduction:';
        div.innerHTML = `<strong>⚠️ ${title}</strong><br>${vertexLabel} 0<br>${reductionLabel} 0%`;
        div.style.display = 'none'; // Hide initially
        return div;
      },
    });

    this.infoControl = new InfoControlClass({ position: 'bottomright' });
    this.infoControl.addTo(this.map);
  }

  /**
   * Updates the info control with vertex count and simplification reduction percent.
   */
  updateInfoControl(vertexCount: number, reductionPercent: number): void {
    if (!this.infoControl || !this.infoControl.getContainer) {
      return;
    }

    const container = this.infoControl.getContainer();
    if (container) {
      const title = this.translate.instant('map_info_title') || 'Info';
      const vertexLabel = this.translate.instant('vertex_count_label') || 'Vertex count:';
      const reductionLabel = this.translate.instant('reduction_label') || 'Reduction:';
      container.innerHTML = `<strong>⚠️ ${title}</strong><br>${vertexLabel} ${vertexCount}<br>${reductionLabel} ${reductionPercent}%`;
      container.style.display = reductionPercent > 0 ? 'block' : 'none';
    }
  }

  /**
   * Adds the custom label editing control to the map.
   */
  private addLabelControl(): void {
    if (!this.map) {
      return;
    }

    if (this.labelControl && this.labelControl.remove) {
      this.labelControl.remove();
    }

    const LabelControl = L.Control.extend({
      onAdd: () => {
      const polygonLabelTitle = this.translate.instant('polygon_label_title');
      const colorLabel = this.translate.instant('polygon_label_color');
      const existingPlaceholder = this.translate.instant('polygon_label_pick_existing');
      const container = L.DomUtil.create('div', 'leaflet-bar polygon-label-control polygon-label-control--hidden');
      container.innerHTML =
        '<div class="polygon-label-control__title">' + polygonLabelTitle + '</div>' +
        '<select class="polygon-label-control__select">' +
          '<option value="">' + existingPlaceholder + '</option>' +
        '</select>' +
        '<div class="polygon-label-control__color-row">' +
          '<span class="polygon-label-control__color-label">' + colorLabel + '</span>' +
          '<input type="color" class="polygon-label-control__color" value="#3388ff" />' +
        '</div>';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      this.labelControlContainer = container;
      this.labelSelect = container.querySelector('.polygon-label-control__select') as HTMLSelectElement;
      this.colorInput = container.querySelector('.polygon-label-control__color') as HTMLInputElement;
      this.updateLabelControlWidthFromMap();


      if (this.labelSelect) {
        L.DomEvent.on(this.labelSelect, 'change', () => {
          if (!this.labelSelect) { return; }
          const selectedLabel = this.labelSelect.value || '';

          this.pendingDrawLabel = selectedLabel;

          if (selectedLabel && this.colorInput) {
            const existingColor = this.getColorForLabel(selectedLabel);
            if (existingColor) {
              this.colorInput.value = existingColor;
              this.pendingDrawColor = existingColor;
            }
          }

          if (this.selectedLabelLayer && selectedLabel) {
            this.applyLabelToLayer(this.selectedLabelLayer, selectedLabel);
            const existingColor = this.getColorForLabel(selectedLabel);
            if (existingColor && this.colorInput) {
              this.colorInput.value = existingColor;
            }
            this.syncColorAcrossLabel(selectedLabel, existingColor || (this.colorInput ? this.colorInput.value : '#3388ff'));

            const mergedLayer = this.mergePolygonsByLabel(selectedLabel);
            if (mergedLayer) {
              this.selectLayerForLabel(mergedLayer, true);
            }
          }

          this.emitSelectedPolygonLabel(selectedLabel);
        });
      }

      if (this.colorInput) {
        L.DomEvent.on(this.colorInput, 'change', () => {
          const color = this.colorInput ? this.colorInput.value : '';
          this.pendingDrawColor = color || '#3388ff';

          if (!this.selectedLabelLayer) { return; }
          const feature = this.getLayerFeature(this.selectedLabelLayer);
          const label = feature && feature.properties && feature.properties.label ? feature.properties.label : '';
          this.syncColorAcrossLabel(label, color);
        });
      }

        return container;
      }
    });

    this.labelControl = new LabelControl({ position: 'topleft' });

    this.labelControl.addTo(this.map);

    if (this.labelControlResizeHandler) {
      this.map.off('resize', this.labelControlResizeHandler);
    }

    this.labelControlResizeHandler = () => {
      this.updateLabelControlWidthFromMap();
    };

    this.map.on('resize', this.labelControlResizeHandler);
    this.updateLabelControlWidthFromMap();

    this.refreshLabelOptions();
    this.toggleLabelControl(false);
  }

  /**
   * Keeps polygon label control width at 10% of current map width.
   */
  private updateLabelControlWidthFromMap(): void {
    if (!this.map || !this.labelControlContainer || typeof this.map.getSize !== 'function') {
      return;
    }

    const mapSize = this.map.getSize();
    if (!mapSize || typeof mapSize.x !== 'number') {
      return;
    }

    const widthInPixels = Math.max(1, Math.round(mapSize.x * 0.1));
    this.labelControlContainer.style.width = widthInPixels + 'px';
  }

  /**
   * Collects labels currently used by editable layers.
   */
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

  /**
   * Finds the first color associated with a given label.
   */
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

  /**
   * Refreshes dropdown options combining predefined and used labels.
   */
  private refreshLabelOptions(): void {
    if (!this.labelSelect) { return; }
    const currentSelection = String(this.pendingDrawLabel || '').trim();
    const existingPlaceholder = this.translate.instant('polygon_label_pick_existing');
    const labels = Array.from(new Set([
      ...this.availableLabelOptions,
      ...this.getUsedLabels(),
    ])).sort((a, b) => a.localeCompare(b));
    this.labelSelect.innerHTML = '<option value="">' + existingPlaceholder + '</option>';
    labels.forEach((label: string) => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      this.labelSelect!.appendChild(option);
    });
    this.labelSelect.value = labels.indexOf(currentSelection) !== -1 ? currentSelection : '';
  }

  /**
   * Shows or hides the label editing control container.
   */
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

  /**
   * Ensures a layer has a feature object and returns it.
   */
  private getLayerFeature(layer: any, feature?: any): any {
    const existingFeature = feature || (layer as any).feature || layer.toGeoJSON();
    existingFeature.properties = existingFeature.properties || {};
    (layer as any).feature = existingFeature;
    return existingFeature;
  }

  /**
   * Applies a label to a layer and synchronizes tooltip rendering.
   */
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

    const isAllowedLabel = this.availableLabelOptions.indexOf(trimmedLabel) !== -1;

    if (!this.showLabelTooltips || !isAllowedLabel) {
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

  /**
   * Reads the effective color for a layer.
   */
  private getLayerColor(layer: any): string {
    const feature = this.getLayerFeature(layer);
    if (feature && feature.properties && feature.properties.color) {
      return feature.properties.color;
    }

    const fromOptions = layer && layer.options && layer.options.color ? layer.options.color : '';
    return fromOptions || '#3388ff';
  }

  /**
   * Applies and stores a color for a layer.
   */
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

  /**
   * Merges editable polygon layers that share the same label.
   */
  private mergePolygonsByLabel(label: string): any {
    const targetLabel = String(label || '').trim();
    if (!this.editableLayers || !targetLabel) {
      return null;
    }

    const layersToMerge: any[] = [];
    const featuresToMerge: any[] = [];

    this.editableLayers.eachLayer((layer: any) => {
      if (!(layer instanceof L.Polygon) && !(layer instanceof L.Circle)) {
        return;
      }

      const feature = this.getLayerFeature(layer);
      const layerLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (layerLabel !== targetLabel) {
        return;
      }

      let geoJson: any;
      if (layer instanceof L.Circle) {
        // Convert circle to polygon
        const center = layer.getLatLng();
        const radius = layer.getRadius(); // in meters
        const radiusKm = radius / 1000; // convert to km for turf
        geoJson = turf.circle([center.lng, center.lat], radiusKm, { steps: 64 });
      } else {
        geoJson = layer.toGeoJSON();
      }

      if (!geoJson || !geoJson.geometry) {
        return;
      }

      const geometryType = String(geoJson.geometry.type || '');
      if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
        return;
      }

      layersToMerge.push(layer);
      featuresToMerge.push(geoJson);
    });

    if (featuresToMerge.length <= 1) {
      return layersToMerge.length === 1 ? layersToMerge[0] : null;
    }

    let mergedFeature: any = featuresToMerge[0];
    for (let index = 1; index < featuresToMerge.length; index++) {
      const unionResult = turf.union(mergedFeature as any, featuresToMerge[index] as any);
      mergedFeature = unionResult || mergedFeature;
    }

    // Simplify the merged geometry to reduce point count
    try {
      mergedFeature = turf.simplify(mergedFeature, { tolerance: 0.0001, highQuality: false });
    } catch (error) {
      console.warn('Failed to simplify labeled merged geometry:', error);
    }

    const mergedColor = this.getColorForLabel(targetLabel) || this.pendingDrawColor || '#3388ff';

    layersToMerge.forEach((layer: any) => {
      this.editableLayers.removeLayer(layer);
    });

    const mergedGroup = L.geoJSON(mergedFeature, {
      style: {
        color: mergedColor,
      },
    });

    let selectedMergedLayer: any = null;

    mergedGroup.eachLayer((layer: any) => {
      this.addEditableLayer(layer);
      this.applyLabelToLayer(layer, targetLabel);
      this.applyColorToLayer(layer, mergedColor);
      this.bindLabelAndClickHandler(layer);
      if (!selectedMergedLayer) {
        selectedMergedLayer = layer;
      }
    });

    this.refreshLabelOptions();
    return selectedMergedLayer;
  }

  /**
   * Returns a Turf feature for the given layer if it is polygon-like.
   */
  private toPolygonFeature(layer: any): any | null {
    if (!layer) {
      return null;
    }

    if (layer instanceof L.Circle) {
      const center = layer.getLatLng();
      const radius = layer.getRadius();
      const radiusKm = radius / 1000;
      return turf.circle([center.lng, center.lat], radiusKm, { steps: 64 });
    }

    const geoJson = layer.toGeoJSON();
    if (!geoJson || !geoJson.geometry) {
      return null;
    }

    const geometryType = String(geoJson.geometry.type || '');
    if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
      return null;
    }

    return geoJson;
  }

  /**
   * Returns true when the provided layer is fully contained inside at least one unlabeled polygon.
   */
  private isLayerInsideAnUnlabeledBoundary(layer: any): boolean {
    if (!this.editableLayers || !layer) {
      return false;
    }

    const candidateFeature = this.toPolygonFeature(layer);
    if (!candidateFeature) {
      return false;
    }

    let foundBoundary = false;

    this.editableLayers.eachLayer((existingLayer: any) => {
      if (existingLayer === layer) {
        return;
      }

      const feature = this.getLayerFeature(existingLayer);
      const label = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (label) {
        return;
      }

      const boundaryFeature = this.toPolygonFeature(existingLayer);
      if (!boundaryFeature) {
        return;
      }

      try {
        if (turf.booleanWithin(candidateFeature, boundaryFeature)) {
          foundBoundary = true;
        }
      } catch (error) {
        console.warn('Boundary containment check failed:', error);
      }
    });

    return foundBoundary;
  }

  /**
   * Propagates a color change to all layers sharing the same label.
   */
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

  /**
   * Selects a layer as active in the label editor.
   */
  private selectLayerForLabel(layer: any, focusInput: boolean = false): void {
    const feature = this.getLayerFeature(layer);
    this.selectedLabelLayer = layer;
    this.toggleLabelControl(true);

    this.refreshLabelOptions();

    if (this.labelSelect) {
      const currentLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';
      this.labelSelect.value = currentLabel;
      this.pendingDrawLabel = currentLabel;
      this.emitSelectedPolygonLabel(currentLabel);
      if (focusInput) {
        this.labelSelect.focus();
      }
    }

    if (this.colorInput) {
      const layerColor = this.getLayerColor(layer);
      this.colorInput.value = layerColor;
      this.pendingDrawColor = layerColor;
    }
  }

  /**
   * Binds label behavior and click-selection handler to a layer.
   */
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

  /**
   * Loads stored GeoJSON layers with optional edit/map behavior.
   */
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

  /**
   * Determines whether the user has added drawings to the map.
   */
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

  /**
   * Serializes drawable layers from map state into GeoJSON.
   */
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

  /**
   * Initializes a map and registers provided overlays.
   */
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
      if (this.labelControlResizeHandler) {
        this.map.off('resize', this.labelControlResizeHandler);
        this.labelControlResizeHandler = null;
      }
      this.map.remove();
      this.map = null;
      this.enableInMapLabelEditor = false;
      this.showLabelTooltips = true;
      this.selectedLabelLayer = null;
      this.labelControl = null;
      this.labelControlContainer = null;
      this.labelSelect = null;
      this.colorInput = null;
      this.availableLabelOptions = [];
      this.pendingDrawLabel = '';
      this.pendingDrawColor = '#3388ff';
      this.emitSelectedPolygonLabel('');
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
    return this.mapGeometryService.circleToPolygon(circle, numPoints);
  }

  /**
   * Extract polygon coordinate arrays from editable layers for analysis submission.
   * @param coordinateOrder Return points as [lng, lat] or [lat, lng]
   * @returns Array of polygon coordinate arrays
   */
  extractPolygonCoordinatesForAnalysis(coordinateOrder: 'lnglat' | 'latlng' = 'lnglat'): [number, number][][] {
    return this.mapGeometryService.extractPolygonCoordinatesForAnalysis(this.editableLayers, coordinateOrder);
  }

  /**
   * Extract polygons from editable layers for analysis submission
   * @returns Array of polygon coordinates
   */
  extractPolygonsForAnalysis(): any[] {
    return this.mapGeometryService.extractPolygonsForAnalysis(this.editableLayers);
  }

  /**
   * Extract only labeled polygons from editable layers for analysis submission.
   * @returns Array of objects containing label and plain coordinates
   */
  extractLabeledPolygonsForAnalysis(): { label: string; coordinates: [number, number][] }[] {
    return this.mapGeometryService.extractLabeledPolygonsForAnalysis(
      this.editableLayers,
      (layer: any) => this.getLayerFeature(layer)
    );
  }

  /**
   * Extract only unlabeled polygons from editable layers for analysis submission.
   * @returns Array of plain polygon coordinates.
   */
  extractUnlabeledPolygonsForAnalysis(): [number, number][][] {
    return this.mapGeometryService.extractUnlabeledPolygonsForAnalysis(
      this.editableLayers,
      (layer: any) => this.getLayerFeature(layer)
    );
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