# Engenheiro — Lançamento Estrutural

Aplicativo para engenharia estrutural. O **Módulo 1** recebe os dados de um
projeto de arquitetura (paredes de um pavimento tipo) e gera o lançamento
estrutural em concreto armado: pilares, vigas e lajes.

## Como funciona o Módulo 1

1. **Entrada das paredes**, por qualquer uma das vias:
   - "Modo grade rápido" (contorno retangular + divisórias por distância)
     ou tabela de paredes por coordenadas (X1,Y1 → X2,Y2, espessura, tipo).
   - **Importação de arquivo DXF** (`src/lib/import/dxfImport.ts`) — lista
     as camadas do arquivo, sugere as que parecem ser de parede e converte
     as entidades LINE/LWPOLYLINE/POLYLINE das camadas escolhidas.
   - **Importação por imagem** (`src/lib/import/imageWallDetection.ts`) —
     envie uma foto ou planta escaneada, calibre a escala clicando em 2
     pontos com distância real conhecida, e rode a detecção automática de
     paredes (transformada de Hough sobre bordas Sobel). Pares de linhas
     paralelas entre ~8 e 22 cm de afastamento (as duas faces de uma
     alvenaria) são reconhecidos e fundidos em uma única parede com a
     espessura real medida (`src/lib/import/wallPairing.ts`). O resultado
     pode ser revisado, ligado/desligado por segmento, completado com
     traço manual sobre a imagem e então importado.
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
- `src/lib/import/` — importação de DXF, detecção de paredes em imagem e
  normalização de dados importados (solda de cantos/junções em T).
- `src/lib/store/` — estado da aplicação (Zustand + persistência local).
- `src/components/` — editor de paredes, canvas SVG do plano e painel de
  elementos.
- `src/components/import/` — painéis de importação DXF e imagem.

## Limitações conhecidas da importação

- **DXF**: só entidades LINE/LWPOLYLINE/POLYLINE são lidas; blocos
  (INSERT), splines e arcos são ignorados. DWG não é suportado (formato
  binário fechado da Autodesk).
- **Imagem**: a detecção automática é um auxiliar de melhor esforço —
  funciona bem em plantas limpas e de bom contraste, mas pode perder
  trechos ou gerar ruído em fotos de baixa qualidade, com sombra ou muita
  cotagem/texto sobre as paredes. Sempre revise antes de importar.
