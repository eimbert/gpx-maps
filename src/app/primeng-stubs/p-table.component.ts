import { AfterContentInit, Component, ContentChildren, Input, QueryList } from '@angular/core';
import { PTemplateDirective } from './p-template.directive';

@Component({
  selector: 'p-table',
  templateUrl: './p-table.component.html',
  styleUrls: ['./p-table.component.css']
})
export class PTableComponent implements AfterContentInit {
  @Input() value: any[] | null = [];
  @Input() styleClass?: string;

  @ContentChildren(PTemplateDirective) templates!: QueryList<PTemplateDirective>;

  headerTemplate?: PTemplateDirective;
  bodyTemplate?: PTemplateDirective;
  captionTemplate?: PTemplateDirective;
  emptyMessageTemplate?: PTemplateDirective;
  footerTemplate?: PTemplateDirective;

  ngAfterContentInit(): void {
    this.templates.forEach(template => {
      switch (template.type) {
        case 'header':
          this.headerTemplate = template;
          break;
        case 'body':
          this.bodyTemplate = template;
          break;
        case 'caption':
          this.captionTemplate = template;
          break;
        case 'emptymessage':
          this.emptyMessageTemplate = template;
          break;
        case 'footer':
          this.footerTemplate = template;
          break;
        default:
          if (!this.bodyTemplate) {
            this.bodyTemplate = template;
          }
      }
    });
  }

  get items(): any[] {
    return this.value ?? [];
  }
}
