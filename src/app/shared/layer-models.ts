/**
 * Shared model interfaces used across create-layer, edit-layer and analysis-layer.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface Field {
  label: string;
  name: string;
  /** 'select' | 'number' | 'group' | 'polygon' | etc. */
  type: string;
  options?: SelectOption[];
  fields?: Field[];
  /** parent key for cascading-select groups */
  parentFieldName?: string;
  /** dependent key for cascading-select groups */
  dependentFieldName?: string;
  /** dependent options by parent value for cascading-select groups */
  dependentOptionsMap?: { [parentValue: string]: SelectOption[] };
  /** true for multi-select fields */
  multiple?: boolean;
  /** minimum selected items for multi-select fields */
  minItems?: number;
  /** maximum selected items for multi-select fields */
  maxItems?: number;
  /** optional tooltip */
  tooltip?: string;
  /** minimum value for number fields */
  min?: number;
  /** maximum value for number fields */
  max?: number;
  /** numeric format: 'integer', 'float', 'double' */
  format?: string;
  /** minimum occurrences (0 = optional, 1+ = required) */
  minOccurs?: number;
  /** for 'polygon' fields: the GeoJSON shape expected by the schema, so the payload can match it */
  geoJsonShape?: 'Feature' | 'FeatureCollection' | 'Geometry';
}

export interface Analysis {
  id: string;
  name: string;
  url: string;
  mode: 'preset' | 'custom';
  fields: Field[];
  fixedValues?: { [key: string]: any };
  polygonArrayFields?: string[];
  supportedCities?: string[];
}
