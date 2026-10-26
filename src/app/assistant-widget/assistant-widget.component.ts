import { Component, ElementRef, HostBinding, OnDestroy, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AssistantHistoryMessage, AssistantService } from '../services/assistant.service';
import { AuthService } from '../services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { LoginSuccessResponse } from '../interfaces/auth';
import { assistantHelp } from './assistant-help';
import { LanguageService } from '../services/language.service';
import { SCREEN_TEXTS, ScreenTextKey, selectedUiText } from '../services/screen-texts';

interface ChatMessage extends AssistantHistoryMessage {
  error?: boolean;
}

@Component({
  selector: 'app-assistant-widget',
  templateUrl: './assistant-widget.component.html',
  styleUrls: ['./assistant-widget.component.css']
})
export class AssistantWidgetComponent implements OnDestroy {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;
  @ViewChildren('chatMessage') private messageElements?: QueryList<ElementRef<HTMLElement>>;
  open = false;
  draft = '';
  sending = false;
  remainingToday: number | null = null;
  dailyLimit: number | null = null;
  authenticated = this.authService.isAuthenticated();
  showHint = true;
  waving = true;
  hintText = selectedUiText('helloHelp');
  messages: ChatMessage[] = [{
    role: 'assistant',
    content: selectedUiText('assistantWelcome')
  }];
  get suggestions(): string[] { return ['suggestProximity', 'suggestBackToList', 'suggestAnimate'].map(key => this.ui(key as ScreenTextKey)); }
  get helpTopics() { return assistantHelp(this.language.current); }
  private readonly sessionSubscription: Subscription;
  private readonly languageSubscription: Subscription;
  private hintTimer?: ReturnType<typeof setTimeout>;
  private hintHideTimer?: ReturnType<typeof setTimeout>;
  private waveTimer?: ReturnType<typeof setTimeout>;
  private readonly hintMessages: ScreenTextKey[] = ['hintCanHelp', 'hintQuestions', 'hintAskRoutes'];
  private readonly updateViewportHeight = (): void => {
    if (typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    this.host.nativeElement.style.setProperty('--assistant-viewport-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    this.host.nativeElement.style.setProperty('--assistant-viewport-top', `${Math.round(viewport?.offsetTop ?? 0)}px`);
  };

  constructor(
    private assistantService: AssistantService,
    private authService: AuthService,
    private router: Router,
    private dialog: MatDialog,
    private host: ElementRef<HTMLElement>,
    private language: LanguageService
  ) {
    this.sessionSubscription = this.authService.sessionChanges$.subscribe(session => {
      this.authenticated = !!session && this.authService.isAuthenticated();
    });
    this.languageSubscription = this.language.language$.subscribe(() => {
      if (this.messages.length === 1) this.messages[0].content = this.ui('assistantWelcome');
      this.hintText = this.ui('helloHelp');
    });
    this.hintHideTimer = setTimeout(() => this.showHint = false, 5000);
    this.scheduleHint();
    this.updateViewportHeight();
    window.visualViewport?.addEventListener('resize', this.updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', this.updateViewportHeight);
    window.addEventListener('orientationchange', this.updateViewportHeight);
  }

  ngOnDestroy(): void {
    this.sessionSubscription.unsubscribe();
    this.languageSubscription.unsubscribe();
    clearTimeout(this.hintTimer);
    clearTimeout(this.hintHideTimer);
    clearTimeout(this.waveTimer);
    if (typeof window !== 'undefined') {
      window.visualViewport?.removeEventListener('resize', this.updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', this.updateViewportHeight);
      window.removeEventListener('orientationchange', this.updateViewportHeight);
    }
  }

  toggle(): void {
    this.open = !this.open;
    this.showHint = false;
    setTimeout(() => this.scrollToEnd());
  }

  useSuggestion(suggestion: string): void { this.draft = suggestion; this.send(); }

  openLogin(): void {
    this.dialog.open<LoginDialogComponent, void, LoginSuccessResponse>(LoginDialogComponent, {
      width: '440px', panelClass: 'tracketeo-auth-dialog'
    }).afterClosed().subscribe(result => {
      if (result) {
        this.authenticated = true;
        setTimeout(() => this.scrollToEnd());
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const message = this.draft.trim();
    if (!message || this.sending) return;
    const history = this.messages.filter(item => !item.error).map(({ role, content }) => ({ role, content }));
    const questionIndex = this.messages.length;
    this.messages.push({ role: 'user', content: message });
    this.draft = '';
    this.sending = true;
    this.scrollToMessageSoon(questionIndex);
    this.assistantService.ask(message, this.router.url, history).subscribe({
      next: response => {
        this.messages.push({ role: 'assistant', content: response.answer });
        this.remainingToday = response.remainingToday;
        this.dailyLimit = response.dailyLimit;
        this.sending = false;
        this.scrollToMessageSoon(questionIndex);
      },
      error: error => {
        const detail = error?.error?.detail || error?.error?.message;
        this.messages.push({ role: 'assistant', content: this.language.current === 'es' && detail ? detail : this.ui('assistantTryLater'), error: true });
        this.sending = false;
        this.scrollToMessageSoon(questionIndex);
      }
    });
  }

  get usageLabel(): string {
    if (this.dailyLimit === -1) return this.ui('unlimitedQuestions');
    if (this.remainingToday === null) return this.ui('specializedHelpShort');
    return `${this.remainingToday} ${this.ui('questionsToday')}`;
  }

  @HostBinding('class.assistant-host--route-page')
  get isRoutesPage(): boolean {
    return this.router.url === '/load' || this.router.url.startsWith('/load?');
  }

  formatMessage(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*]\s+/gm, '• ');
  }

  private ui(key: ScreenTextKey): string { return SCREEN_TEXTS[key][this.language.current]; }
  private scrollToMessageSoon(index: number): void { setTimeout(() => this.scrollToMessage(index)); }
  private scrollToMessage(index: number): void {
    const container = this.messageList?.nativeElement;
    const message = this.messageElements?.get(index)?.nativeElement;
    if (!container || !message) return;
    container.scrollTop = Math.max(0, message.offsetTop - container.offsetTop - 8);
  }
  private scrollToEnd(): void {
    const element = this.messageList?.nativeElement;
    if (element) element.scrollTop = element.scrollHeight;
  }

  private scheduleHint(): void {
    const delay = 18000 + Math.round(Math.random() * 14000);
    this.hintTimer = setTimeout(() => {
      if (!this.open) {
        this.hintText = this.ui(this.hintMessages[Math.floor(Math.random() * this.hintMessages.length)]);
        this.showHint = true;
        this.waving = false;
        setTimeout(() => this.waving = true);
        this.waveTimer = setTimeout(() => this.waving = false, 1800);
        this.hintHideTimer = setTimeout(() => this.showHint = false, 5000);
      }
      this.scheduleHint();
    }, delay);
  }
}
