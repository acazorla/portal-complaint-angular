// features/complaints/models/document-config.model.ts
export interface DocumentConfig {
  documentTypeId: number;
  countryCode: string;
  abbreviation: string;
  fullName: string;
  exactLength: number | null;
  isNumeric: boolean;
  formatMask: string | null;
}

export const DOCUMENT_RULES: DocumentConfig[] = [
  { documentTypeId: 1, countryCode: 'PE', abbreviation: 'DNI', fullName: 'Documento Nacional de Identidad', exactLength: 8, isNumeric: true, formatMask: null },
  { documentTypeId: 2, countryCode: 'PE', abbreviation: 'CE', fullName: 'Carné de Extranjería', exactLength: 12, isNumeric: false, formatMask: null },
  { documentTypeId: 3, countryCode: 'PE', abbreviation: 'RUC', fullName: 'Registro Único de Contribuyentes', exactLength: 11, isNumeric: true, formatMask: null },
  { documentTypeId: 5, countryCode: 'US', abbreviation: 'SSN', fullName: 'Social Security Number', exactLength: 9, isNumeric: true, formatMask: '###-##-####' },
  { documentTypeId: 8, countryCode: 'ES', abbreviation: 'DNI', fullName: 'Documento Nacional de Identidad (ES)', exactLength: 9, isNumeric: false, formatMask: null },
  // ... añadir el resto de la tabla aquí
];