export type TipoCampoEtapa =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'attachment'
  | 'entity-reference'
  | 'table'
  | 'reference-table'
  | 'summary';

export interface TableColumn {
  id: string;
  label: string;
  tipo:
    | 'text'
    | 'checkbox'
    | 'date'
    | 'datetime'
    | 'number'
    | 'select'
    | 'calculated';
  calc?: {
    operation: 'multiply' | 'add' | 'subtract' | 'divide';
    column1Id: string;
    column2Id: string;
    format?: string;
  };
}

export interface CustomFieldEtapa {
  id: string;
  label: string;
  required: boolean;
  tipo: TipoCampoEtapa;
  placeholder?: string;
  options?: { label: string; value: string }[];
  maxFiles?: number;
  acceptedTypes?: string;
  entityType?: string;
  consultaParametrizadaId?: string;
  tableColumns?: TableColumn[];
  referenceConfig?: {
    referenceStepId: string;
    referenceFieldId: string;
    allowMultiplePerItem: boolean;
    additionalColumns: TableColumn[];
  };
  summaryConfig?: {
    sourceTableFieldId: string;
    sourceColumnId: string;
    operation: 'sum' | 'average' | 'count' | 'min' | 'max';
    format?: string;
  };
}
