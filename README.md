# Engenheiro — Lançamento Estrutural

Aplicativo para engenharia estrutural. O **Módulo 1** recebe os dados de um
projeto de arquitetura (paredes de um pavimento tipo) e gera o lançamento
estrutural em concreto armado: pilares, vigas e lajes.

## Como funciona o Módulo 1

1. **Entrada estruturada das paredes** — via "modo grade rápido" (contorno
   retangular + divisórias por distância) ou tabela de paredes (coordenadas
   X1,Y1 → X2,Y2, espessura, tipo). Não há desenho livre: tudo é numérico.
2. **Geração automática da estrutura** (`src/lib/engine`):
   - As paredes são particionadas em sub-segmentos em cada cruzamento/T
     (`geometry.ts`), formando um grafo planar.
   - **Pilares**: lançados em cantos, cruzamentos e pontos intermediários
     quando o vão de uma parede excede o vão máximo configurado.
   - **Vigas**: ligam pilares consecutivos ao longo de cada trecho de
     parede, com altura estimada por `vão / relação` (padrão L/12).
   - **Lajes**: os cômodos são extraídos como polígonos fechados a partir
     das paredes (algoritmo de rastreamento de faces em grafo planar) e
     classificados em armação de uma ou duas direções, com espessura
     estimada por regras de pré-dimensionamento (padrão vão/40 e vão/30).
   - Validações geram avisos (vão excedido, cômodo não retangular, laje sem
     vigas de apoio, etc.).
3. **Edição assistida** — o resultado é um ponto de partida: pilares podem
   ser arrastados no desenho ou editados numericamente, seções de
   pilares/vigas e espessuras de laje são ajustáveis, e elementos podem ser
   removidos.

Todo o lançamento automático é uma **estimativa preliminar de
pré-dimensionamento** — o dimensionamento final deve seguir a NBR 6118 e
ser validado por profissional habilitado.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Os projetos são
salvos no `localStorage` do navegador.

## Estrutura do código

- `src/lib/types.ts` — modelo de domínio (paredes, pilares, vigas, lajes).
- `src/lib/engine/` — motor de geometria e lançamento estrutural (puro,
  sem dependência de UI).
- `src/lib/store/` — estado da aplicação (Zustand + persistência local).
- `src/components/` — editor de paredes, canvas SVG do plano e painel de
  elementos.
