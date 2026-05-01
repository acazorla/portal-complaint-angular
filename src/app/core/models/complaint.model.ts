export interface Evidence {
  evidenceTypeId: number;
  originalName: string;
  storageFileName: string;
  fileExtension: string;
  mimeType: string;
  fileSizeBytes: number;
  accessUrl: string;
  verificationHash: string;
}

export interface ComplaintRequest {
  documentTypeId: number;
  documentNumber: string;
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phoneNumber: string;
  countryId: number;
  locationLevel2Id: number;
  locationLevel3Id: number;
  locationLevel4Id: number | null;
  detailedAddress: string;
  postalCode: string;
  hasRepresentative: boolean;
  representativeName: string;
  branchId: number;
  complaintType: string;
  categoryId: number;
  currencyId: number;
  claimedAmount: number;
  incidentDate: string;
  complaintDescription: string;
  consumerRequest: string;
  createdBy: string;
  evidenceList: Evidence[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta: {
    traceId: string;
    timestamp: string;
  };
}