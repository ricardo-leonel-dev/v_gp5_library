// F4 `save_preset_dialog` — `GET /me/plan` HTTP wrapper. Parses the nested
// wire body to the flat internal `PlanLimits` (Rev 5); rejects on HTTP
// errors. A `null` parse result or an HTTP rejection leaves `plan` unset
// in the dialog (R59: no caps, no messages, no banner).

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { PlanLimits } from './plan-limits';
import { parsePlanLimits } from './plan-limits';

@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);

  getMyPlan(): Promise<PlanLimits | null> {
    return firstValueFrom(this.http.get(`${environment.apiBaseUrl}/me/plan`)).then(
      (body) => parsePlanLimits(body),
    );
  }
}