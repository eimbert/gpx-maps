import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { PTableComponent } from './p-table.component';
import { PTemplateDirective } from './p-template.directive';

@NgModule({
  declarations: [PTableComponent, PTemplateDirective],
  imports: [CommonModule],
  exports: [PTableComponent, PTemplateDirective]
})
export class PrimengStubsModule {}
