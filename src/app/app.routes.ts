import { Routes } from '@angular/router';
import { RegisterComponent } from './features/complaints/components/register/register.component';

export const routes: Routes = [
  { path: 'register', component: RegisterComponent },
  { path: '', redirectTo: 'register', pathMatch: 'full' }
];