import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoginResponse, RegisterResponse } from '../interfaces/auth';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(environment.loginUrl, { email, password });
  }

  register(email: string, password: string, name: string, nickname: string): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(environment.registerUrl, {
      email,
      password,
      name,
      nickname
    });
  }
}
