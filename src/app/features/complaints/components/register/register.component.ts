import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { DOCUMENT_RULES, DocumentConfig } from '../../../../core/models/document-config.model';

// --- INTERFACES PARA EL API ---
interface AdministrativeDivision {
  divisionId: number;
  divisionName: string;
  levelDepth: number;
  childLabel: string | null;
  isoCode: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T[];
  error?: {
    code: string;
    message: string;
  };
  meta: {
    traceId: string;
    timestamp: string;
  };
}

// Función auxiliar para banderas
function getFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, char =>
      String.fromCodePoint(127397 + (char.codePointAt(0) || 0))
    );
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // --- ESTADOS DE UI Y ARCHIVOS ---
  isSubmitting = false;
  evidences: File[] = [];
  readonly MAX_FILES = 3;
  isCountryMenuOpen = false;

  // --- SIGNALS PARA UBICACIÓN DINÁMICA ---
  countries = signal<AdministrativeDivision[]>([]);
  level2Divisions = signal<AdministrativeDivision[]>([]);
  level3Divisions = signal<AdministrativeDivision[]>([]);
  level4Divisions = signal<AdministrativeDivision[]>([]);

  // Labels dinámicos basados en childLabel del nivel anterior
  l2Label = signal<string>('Departamento');
  l3Label = signal<string>('Provincia');
  l4Label = signal<string>('Distrito');

  // --- DATA SOURCE MONEDAS (Estático por ahora) ---
  private readonly CURRENCY_DATA = [
    { countryId: 1, currencyId: 1, isoCode: 'PEN', name: 'Soles', symbol: 'S/', precision: 2, isPreferred: true },
    { countryId: 1, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: false },
    { countryId: 2, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: true },
    { countryId: 3, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: false },
    { countryId: 3, currencyId: 3, isoCode: 'EUR', name: 'Euros', symbol: '€', precision: 2, isPreferred: true }
  ];

  // --- FORMULARIO REACTIVO ---
  form: FormGroup = this.fb.group({
    // Bloque 1: Identificación
    documentTypeId: [1, [Validators.required]],
    documentNumber: ['', [Validators.required, Validators.pattern('^[0-9]{8,12}$')]],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    middleName: [''],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required]],
    // Bloque 2: Ubicación
    countryId: [null, [Validators.required]],
    locationLevel2Id: [null, [Validators.required]],
    locationLevel3Id: [null, [Validators.required]],
    locationLevel4Id: [null],
    detailedAddress: ['', [Validators.required]],
    postalCode: ['15001'],
     // Bloque 3: Representante
    hasRepresentative: [false],
    representativeName: [''],
    // Bloque 4: Negocio
    branchId: [1, [Validators.required]],
    complaintType: ['R', [Validators.required]],
    categoryId: [2, [Validators.required]],
    currencyId: [1, [Validators.required]],
    claimedAmount: [0, [Validators.required, Validators.min(0.01)]],
    incidentDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    complaintDescription: ['', [Validators.required, Validators.minLength(10)]],
    consumerRequest: ['', [Validators.required]],
    createdBy: ['d290f1ee-6c54-4b01-90e6-d701748f0851']
  });

  // --- SIGNALS COMPUTADOS ---
  countriesVM = computed(() =>
    this.countries().map(c => ({
      id: c.divisionId,
      name: c.divisionName,
      flag: c.isoCode ? getFlagEmoji(c.isoCode) : '🌐'
    }))
  );

  private currencyIdValue = toSignal(
    this.form.get('currencyId')!.valueChanges, 
    { initialValue: this.form.get('currencyId')?.value }
  );

  selectedCountryId = signal<number>(1);

  selectedCountry = computed(() =>
    this.countriesVM().find(c => c.id === this.selectedCountryId()) 
    ?? { id: 0, name: 'Seleccione', flag: '🌐' }
  );

  filteredCurrencies = computed(() => 
    this.CURRENCY_DATA.filter(c => c.countryId === this.selectedCountryId())
  );

  selectedCurrencyConfig = computed(() => {
    const currentId = Number(this.currencyIdValue());
    return this.filteredCurrencies().find(c => c.currencyId === currentId)
           || this.filteredCurrencies().find(c => c.isPreferred);
  });

  // --- LÓGICA DE INICIALIZACIÓN ---
  ngOnInit() {
    this.loadCountries();
    this.setupLocationWatchers();
    
    // Watcher para validadores de documento
    this.form.get('documentTypeId')?.valueChanges.subscribe(typeId => {
      this.updateValidators(typeId);
    });
  }

  // --- CARGA DE DATOS DESDE EL API ---
  loadCountries() {
    this.http.get<ApiResponse<AdministrativeDivision>>('/api/locations/administrative-divisions')
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.countries.set(res.data);
            const peru = res.data.find(c => c.isoCode === 'PE');
            if (peru) this.selectCountry(peru.divisionId);
          }
        },
        error: (err) => this.handleApiError(err)
      });
  }

  setupLocationWatchers() {
    // Cuando cambia Nivel 2 -> Cargar Nivel 3
    this.form.get('locationLevel2Id')?.valueChanges.subscribe(id => {
      if (!id) return;
      const current = this.level2Divisions().find(d => d.divisionId === Number(id));
      this.l3Label.set(current?.childLabel || 'Provincia');
      this.loadSubDivisions(id, 3);
    });

    // Cuando cambia Nivel 3 -> Cargar Nivel 4
    this.form.get('locationLevel3Id')?.valueChanges.subscribe(id => {
      if (!id) return;
      const current = this.level3Divisions().find(d => d.divisionId === Number(id));
      this.l4Label.set(current?.childLabel || 'Distrito');
      this.loadSubDivisions(id, 4);
    });
  }

  loadSubDivisions(parentId: number, targetLevel: number) {
    this.http.get<ApiResponse<AdministrativeDivision>>(`/api/locations/administrative-divisions?parentId=${parentId}`)
      .subscribe({
        next: (res) => {
          if (res.success) {
            if (targetLevel === 2) this.level2Divisions.set(res.data);
            if (targetLevel === 3) this.level3Divisions.set(res.data);
            if (targetLevel === 4) this.level4Divisions.set(res.data);
          }
        },
        error: (err) => this.handleApiError(err)
      });
  }

  // --- ACCIONES DE UI ---
  toggleCountryMenu() {
    this.isCountryMenuOpen = !this.isCountryMenuOpen;
  }

  selectCountry(countryId: number) {
    this.selectedCountryId.set(countryId);
    this.form.get('countryId')?.setValue(countryId);
    this.isCountryMenuOpen = false;

    // Resetear niveles hijos
    this.level2Divisions.set([]);
    this.level3Divisions.set([]);
    this.level4Divisions.set([]);
    this.form.patchValue({ locationLevel2Id: null, locationLevel3Id: null, locationLevel4Id: null });

    // Cargar Nivel 2 (ej. Departamento)
    const country = this.countries().find(c => c.divisionId === countryId);
    this.l2Label.set(country?.childLabel || 'Departamento');
    this.loadSubDivisions(countryId, 2);

    // Actualizar moneda y validadores de documento
    const preferred = this.CURRENCY_DATA.find(c => c.countryId === countryId && c.isPreferred);
    if (preferred) this.form.get('currencyId')?.setValue(preferred.currencyId);
    
    this.onCountryChange(countryId);
  }

  // --- LÓGICA DE NEGOCIO ---
  filteredDocuments: DocumentConfig[] = [];
  currentConfig?: DocumentConfig;

  onCountryChange(countryId: number) {
    const country = this.countries().find(c => c.divisionId === countryId);
    if (!country?.isoCode) return;

    this.filteredDocuments = DOCUMENT_RULES.filter(doc => doc.countryCode === country.isoCode);
    if (this.filteredDocuments.length > 0) {
      this.form.get('documentTypeId')?.setValue(this.filteredDocuments[0].documentTypeId);
    }
  }

  updateValidators(typeId: number) {
    this.currentConfig = DOCUMENT_RULES.find(d => d.documentTypeId == typeId);
    const docControl = this.form.get('documentNumber');
    if (!this.currentConfig || !docControl) return;

    const validators = [Validators.required];
    if (this.currentConfig.exactLength) {
      validators.push(Validators.minLength(this.currentConfig.exactLength));
      validators.push(Validators.maxLength(this.currentConfig.exactLength));
    }
    if (this.currentConfig.isNumeric) {
      validators.push(Validators.pattern('^[0-9]*$'));
    }
    docControl.setValidators(validators);
    docControl.updateValueAndValidity();
  }

  getStepValue(): string {
    const precision = this.selectedCurrencyConfig()?.precision || 2;
    return (1 / Math.pow(10, precision)).toString();
  }

  // --- GESTIÓN DE ARCHIVOS ---
  onFileSelected(event: any): void {
    const files = Array.from(event.target.files) as File[];
    if (this.evidences.length + files.length > this.MAX_FILES) {
      alert(`Solo puedes subir un máximo de ${this.MAX_FILES} archivos.`);
      return;
    }
    this.evidences.push(...files);
    event.target.value = '';
  }

  removeFile(index: number): void {
    this.evidences.splice(index, 1);
  }

  // --- ENVÍO FINAL ---
  submit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const evidenceList = this.evidences.map(file => ({
      evidenceTypeId: 1,
      originalName: file.name,
      storageFileName: `${Date.now()}_${file.name}`,
      fileExtension: `.${file.name.split('.').pop()}`,
      mimeType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
      accessUrl: `https://storage.syslab.com/evidencias/${file.name}`,
      verificationHash: 'a1b2c3d4...'
    }));

    const payload = { ...this.form.value, evidenceList };

    this.http.post(`/api/customers/complaints/register`, payload)
      .pipe(finalize(() => this.isSubmitting = false))
      .subscribe({
        next: (res: any) => {
          const data = res.data[0];
          alert(`¡Éxito! Su código de seguimiento es: ${data.trackingCode}`);
          this.resetForm();
        },
        error: (err) => this.handleApiError(err)
      });
  }

  private resetForm() {
    this.form.reset({
      documentTypeId: 1,
      countryId: 1,
      complaintType: 'R',
      incidentDate: new Date().toISOString().split('T')[0],
      claimedAmount: 0,
      branchId: 1,
      categoryId: 2,
      currencyId: 1
    });
    this.evidences = [];
    this.selectCountry(1);
  }

  private handleApiError(err: any) {
    console.error('Error capturado:', err);
    if (err.status === 0) {
      alert('Error de conexión: El servidor está apagado o hay un problema de red.');
      return;
    }
    const errorMessage = err.error?.error?.message || 'Ocurrió un error inesperado';
    const traceId = err.error?.meta?.traceId || 'N/A';
    alert(`Error [${traceId}]: ${errorMessage}`);
  }
}