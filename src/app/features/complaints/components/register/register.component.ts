import { Component, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop'; // <--- Importante para vincular Form con Signals
//import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
//import { environment } from '../../../../../environments/environment';
import { finalize } from 'rxjs/operators';
import { DOCUMENT_RULES, DocumentConfig } from '../../../../core/models/document-config.model';
// register.component.ts

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
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
    // Inicialización de todos los campos según tu Request JSON
  form: FormGroup = this.fb.group({
    // Bloque 1: Identificación
    documentTypeId: [1, [Validators.required]],
    documentNumber: ['', [Validators.required, Validators.pattern('^[0-9]{8,12}$')]],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    middleName: [''], // Opcional
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required]],

    // Bloque 2: Ubicación
    countryId: [1, [Validators.required]],
    locationLevel2Id: [18, [Validators.required]],
    locationLevel3Id: [99, [Validators.required]],
    locationLevel4Id: [132], // Opcional
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
    incidentDate: ['2026-04-20', [Validators.required]],
    complaintDescription: ['', [Validators.required, Validators.minLength(10)]],
    consumerRequest: ['', [Validators.required]],
    createdBy: ['d290f1ee-6c54-4b01-90e6-d701748f0851'] // UUID de auditoría
  });
//--------------------------------------------------
  // 1. Data Source de Monedas ( )
  private readonly CURRENCY_DATA = [
    { countryId: 1, currencyId: 1, isoCode: 'PEN', name: 'Soles', symbol: 'S/', precision: 2, isPreferred: true },
    { countryId: 1, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: false },
    { countryId: 2, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: true },
    { countryId: 3, currencyId: 2, isoCode: 'USD', name: 'Dólares Americanos', symbol: '$', precision: 2, isPreferred: false },
    { countryId: 3, currencyId: 3, isoCode: 'EUR', name: 'Euros', symbol: '€', precision: 2, isPreferred: true }
  ];
//--------------------------------------------------
  // Estados de la UI
  isSubmitting = false;
  evidences: File[] = [];
  readonly MAX_FILES = 3;

  isCountryMenuOpen = false;


  countries = signal([
    { id: 1, name: 'Perú', code: 'PE' },
    { id: 2, name: 'USA', code: 'US' },
    { id: 3, name: 'España', code: 'ES' }
  ]);
  countriesVM = computed(() =>
    this.countries().map(c => ({
      ...c,
      flag: getFlagEmoji(c.code)
    }))
  );  
  // 1. Convertimos el valor del selector de moneda en un Signal
  // Esto detectará cuando el usuario cambie manualmente la moneda en el combo
  private currencyIdValue = toSignal(
    this.form.get('currencyId')!.valueChanges, 
    { initialValue: this.form.get('currencyId')?.value }
  );
  // Obtener el objeto del país seleccionado actualmente (Signals para manejar el estado)
  selectedCountryId = signal<number>(1);

selectedCountry = computed(() =>
  this.countriesVM().find(c => c.id === this.selectedCountryId()) 
  ?? this.countriesVM()[0]
);
  toggleCountryMenu() {
    this.isCountryMenuOpen = !this.isCountryMenuOpen;
  }
 // Método que se llama desde el HTML al seleccionar país
  selectCountry(countryId: number) {
    this.selectedCountryId.set(countryId);
    this.form.get('countryId')?.setValue(countryId);
    
    // Auto-seleccionar la moneda preferida del nuevo país
    const preferred = this.CURRENCY_DATA.find(c => c.countryId === countryId && c.isPreferred);
    //const preferred = this.filteredCurrencies().find(c => c.isPreferred);
    if (preferred) {
      this.form.get('currencyId')?.setValue(preferred.currencyId);
    }
    this.isCountryMenuOpen = false;
    // (Opcional) Actualizar validadores de documentos según el país seleccionado
    this.onCountryChange(countryId); // Tu lógica de filtrado de documentos

  }

//---------------------------------------------------------
  filteredDocuments: DocumentConfig[] = [];
  currentConfig?: DocumentConfig;

  // En el ngOnInit o constructor, suscríbete a cambios de país
    ngOnInit() {

      this.form.get('countryId')?.valueChanges.subscribe(id => {
        if (!id) return;
        this.selectedCountryId.set(id);
        this.onCountryChange(id);
      });

      this.form.get('documentTypeId')?.valueChanges.subscribe(typeId => {
        this.updateValidators(typeId);
      });
      
      // Inicializar con Perú
      this.form.patchValue({ countryId: 1 });
    }
    //-----------------------------------------------------------------
    // 1. Filtrar monedas según el país seleccionado
    filteredCurrencies = computed(() => 
      this.CURRENCY_DATA.filter(c => c.countryId === this.selectedCountryId())
    );

    // 2. Obtener la moneda configurada actualmente en el formulario
    selectedCurrencyConfig = computed(() => {
    const currentId = Number(this.currencyIdValue());
    const config = this.filteredCurrencies().find(c => c.currencyId === currentId);
    
    // Si por alguna razón no lo encuentra, devolvemos el preferido
    return config || this.filteredCurrencies().find(c => c.isPreferred);
/*       const currencyId = this.form.get('currencyId')?.value;
      return this.filteredCurrencies().find(c => c.currencyId === Number(currencyId))
            || this.filteredCurrencies().find(c => c.isPreferred); */
    });
    getStepValue(): string {
      const precision = this.selectedCurrencyConfig()?.precision || 2;
      return (1 / Math.pow(10, precision)).toString(); 
    // Si precision es 2, retorna "0.01"
    // Si precision es 0, retorna "1"
    }
    //-----------------------------------------------------------------
    onCountryChange(countryId: number) {
      const countryCode = this.countries().find(c => c.id == countryId)?.code;
      this.filteredDocuments = DOCUMENT_RULES.filter(doc => doc.countryCode === countryCode);
      
      // Resetear selección de documento al cambiar país
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


  // Gestión de archivos de evidencia
  onFileSelected(event: any): void {
    const files = Array.from(event.target.files) as File[];
    
    if (this.evidences.length + files.length > this.MAX_FILES) {
      alert(`Solo puedes subir un máximo de ${this.MAX_FILES} archivos.`);
      return;
    }

    this.evidences.push(...files);
    // Reset del input para permitir subir el mismo archivo si se borró
    event.target.value = '';
  }

  removeFile(index: number): void {
    this.evidences.splice(index, 1);
  }

  // Envío de datos alineado al Request de Quarkus
  submit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched(); // Feedback visual de errores
      return;
    }

    this.isSubmitting = true;

    // Construcción del objeto evidenceList según el contrato
    const evidenceList = this.evidences.map(file => ({
      evidenceTypeId: 1,
      originalName: file.name,
      storageFileName: `${new Date().getTime()}_${file.name}`,
      fileExtension: `.${file.name.split('.').pop()}`,
      mimeType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
      accessUrl: `https://storage.syslab.com/evidencias/${file.name}`, // URL simulada
      verificationHash: 'a1b2c3d4...' // Hash simulado
    }));

    const payload = {
      ...this.form.value,
      evidenceList: evidenceList
    };

    //this.http.post(`${environment.apiUrl}/v1/complaints/register`, payload)
    this.http.post(`URL_DE_TU_API/v1/complaints/register`, payload)
      .pipe(finalize(() => this.isSubmitting = false))
      .subscribe({
        next: (res: any) => {
          const data = res.data[0];
          alert(`¡Éxito! Su código de seguimiento es: ${data.trackingCode}`);
          this.form.reset({
            documentTypeId: 1,
            countryId: 1,
            complaintType: 'R',
            incidentDate: new Date().toISOString().split('T')[0]
          });
          this.evidences = [];
        },
        error: (err) => {
          const traceId = err.error?.meta?.traceId;
          alert(`Ocurrió un error. Por favor contacte a soporte con el código: ${traceId || 'N/A'}`);
        }
      });
  }
}