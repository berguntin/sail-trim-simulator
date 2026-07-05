# Trim Simulator

Simulador interactivo de trimado de velas. Permite ajustar los controles de trimado de un velero (escotas, carro, backstay, posición del carro del génova, etc.) y ver en tiempo real su efecto sobre la forma de las velas —en 2D y 3D— y sobre el rendimiento del barco (velocidad, escora, VMG).

El modelo físico no usa CFD: se basa en coeficientes de fuerza estáticos al estilo de Marchaj (*Aero-Hydrodynamics of Sailing*) y en el modelo aerodinámico del VPP de ORC, con posibilidad de cargar polares publicadas por ORC para barcos reales. Las fuentes del modelo están documentadas en [docs/PHYSICS_SOURCES.md](docs/PHYSICS_SOURCES.md).

## Stack

Vue 3 + TypeScript + Pinia, visualización 3D con Three.js, build con Vite y tests con Vitest.

## Desarrollo en local

Requiere Node.js y [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm dev        # servidor de desarrollo (Vite)
```

Otros comandos útiles:

```sh
pnpm test           # ejecutar los tests una vez
pnpm test:watch     # tests en modo watch
pnpm test:coverage  # tests con cobertura
pnpm build          # type-check + build de producción (dist/)
pnpm preview        # servir el build de producción en local
```
