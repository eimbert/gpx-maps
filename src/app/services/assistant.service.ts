import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { assistantHelpContext } from '../assistant-widget/assistant-help';
import { LanguageService } from './language.service';

export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatResponse {
  answer: string;
  usageCharged: boolean;
  remainingToday: number;
  dailyLimit: number;
  model: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  constructor(private http: HttpClient, private language: LanguageService) {}

  ask(message: string, currentPage: string, history: AssistantHistoryMessage[]): Observable<AssistantChatResponse> {
    return this.http.post<AssistantChatResponse>(`${environment.assistantApiBase}/chat`, {
      message,
      currentPage,
      history: [...history.slice(-5), { role: 'assistant', content: assistantHelpContext(this.language.current) }]
    });
  }
}
