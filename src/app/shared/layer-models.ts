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
  /** true for multi-select fields */
  multiple?: boolean;
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
