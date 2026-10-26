import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type BillingPlan = 'monthly' | 'annual';

export interface BillingSessionResponse { url: string; }

export interface BillingStatusResponse {
  premium: boolean;
  lifetimePremium: boolean;
  subscriptionStatus: string | null;
  premiumUntil: string | null;
  canManageSubscription: boolean;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private http: HttpClient) {}

  createCheckout(plan: BillingPlan): Observable<BillingSessionResponse> {
    return this.http.post<BillingSessionResponse>(`${environment.billingApiBase}/checkout`, {
      plan,
      returnUrl: window.location.origin
    });
  }

  createPortal(): Observable<BillingSessionResponse> {
    return this.http.post<BillingSessionResponse>(`${environment.billingApiBase}/portal`, {
      returnUrl: window.location.origin
    });
  }

  getStatus(): Observable<BillingStatusResponse> {
    return this.http.get<BillingStatusResponse>(`${environment.billingApiBase}/status`);
  }
}
