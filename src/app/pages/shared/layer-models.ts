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
}

export interface Analysis {
  id: string;
  name: string;
  url: string;
  mode: 'preset' | 'custom';
  fields: Field[];
}
