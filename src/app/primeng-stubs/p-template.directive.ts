import { Directive, Input, TemplateRef } from '@angular/core';

@Directive({
  selector: '[pTemplate]'
})
export class PTemplateDirective {
  @Input('pTemplate') type?: string;

  constructor(public template: TemplateRef<any>) {}
}
