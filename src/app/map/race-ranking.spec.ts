import { MapComponent } from './map.component';

describe('Marcador final de Animar carrera', () => {
  function component(): any {
    return new MapComponent({} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('ordena los participantes por tiempo al terminar la carrera', () => {
    const map = component();
    map.trackMetas = [
      { name: 'A', color: '#111111', has: true, sanitized: [{ t: 0 }, { t: 120000 }] },
      { name: 'B', color: '#222222', has: true, sanitized: [{ t: 0 }, { t: 90000 }] },
      { name: 'C', color: '#333333', has: true, sanitized: [{ t: 0 }, { t: 150000 }] }
    ];

    expect(map.buildRanking().map((entry: any) => [entry.name, entry.medal]))
      .toEqual([['B', 'gold'], ['A', 'silver'], ['C', 'bronze']]);
  });

  it('no muestra clasificación si solo hay un participante', () => {
    const map = component();
    map.trackMetas = [
      { name: 'A', color: '#111111', has: true, sanitized: [{ t: 0 }, { t: 90000 }] }
    ];
    expect(map.buildRanking()).toEqual([]);
  });
});
