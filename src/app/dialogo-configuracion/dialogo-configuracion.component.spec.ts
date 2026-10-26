import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DialogoConfiguracionComponent } from './dialogo-configuracion.component';
import { DialogoConfiguracionData } from '../interfaces/estructuras';

describe('Opciones de reproducción 3D', () => {
  let fixture: ComponentFixture<DialogoConfiguracionComponent>;
  let close: jasmine.Spy;
  let data: Partial<DialogoConfiguracionData>;

  beforeEach(async () => {
    data = { tipoAnimacion: 'descubrir', tipoAnimacionFijado: true };
    close = jasmine.createSpy('close');
    await TestBed.configureTestingModule({
      declarations: [DialogoConfiguracionComponent],
      imports: [FormsModule, NoopAnimationsModule, MatCheckboxModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(DialogoConfiguracionComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('keeps the current view selected by default and saves the closer choice on mobile', async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    spyOn(window, 'matchMedia').and.callFake(query => query === '(max-width: 768px)'
      ? ({ matches: true } as MediaQueryList) : originalMatchMedia(query));
    await render();
    const current: HTMLInputElement = fixture.nativeElement.querySelector('input[name="camara-descubrir"][value="actual"]');
    const closer: HTMLInputElement = fixture.nativeElement.querySelector('input[name="camara-descubrir"][value="cercana"]');
    expect(current.checked).toBeTrue();
    expect(fixture.componentInstance.esMovil).toBeTrue();
    closer.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.guardar();
    expect(close).toHaveBeenCalledWith(jasmine.objectContaining({ tipoAnimacion: 'descubrir', camaraDescubrir: 'cercana' }));
  });

  it('restores the camera choice when provided in the configuration', async () => {
    data.camaraDescubrir = 'cercana';
    await render();
    expect(fixture.nativeElement.querySelector('input[name="camara-descubrir"][value="cercana"]').checked).toBeTrue();
  });

  it('defaults to normal speed and saves double speed as a number after selecting the radio', async () => {
    await render();
    const radios: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[name="velocidad-descubrir"]');
    expect(radios.length).toBe(2);
    expect(radios[0].checked).toBeTrue();
    radios[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(radios[0].checked).toBeFalse();
    expect(radios[1].checked).toBeTrue();
    fixture.componentInstance.guardar();
    expect(close).toHaveBeenCalledWith(jasmine.objectContaining({ velocidadDescubrir: 2 }));
  });

  it('restores double speed from the configuration', async () => {
    data.velocidadDescubrir = 2;
    await render();
    const radios: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[name="velocidad-descubrir"]');
    expect(radios[1].checked).toBeTrue();
  });

  it('does not show 3D camera or speed options for race playback', async () => {
    data.tipoAnimacion = 'carrera';
    await render();
    expect(fixture.nativeElement.querySelector('.discovery-camera')).toBeNull();
    expect(fixture.nativeElement.querySelector('.discovery-speed')).toBeNull();
  });

  it('does not offer 3D playback when several tracks are selected', async () => {
    data = { tipoAnimacion: 'carrera', nombresTracks: ['Primera ruta', 'Segunda ruta'] };
    await render();
    expect(fixture.nativeElement.querySelector('input[name="tipo-animacion"][value="descubrir"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="tipo-animacion"][value="carrera"]')).not.toBeNull();
  });
});
