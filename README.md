# Batalha Naval — WebSockets

Jogo de Batalha Naval multiplayer em tempo real usando WebSockets.
## Vídeo
- **Link**: https://drive.google.com/file/d/14oVFZvArpkKu0cn5ca8r8m0c-D_c6FCO/view?usp=sharing
## Tecnologias

- **Servidor**: Node.js + `ws` (WebSocket)
- **Cliente**: HTML + CSS + JavaScript

## Instalação

```bash
npm install
```

## Execução

```bash
npm start
```

O servidor inicia em `http://localhost:3000`.

## Como jogar

1. Abra `http://localhost:3000` em **duas abas** ou dois navegadores diferentes.
2. O primeiro a conectar é o **Jogador 1** e aguarda o segundo.
3. Com os dois conectados, ambos **posicionam seus navios** no tabuleiro:
   - Selecione um navio no painel
   - Troque a orientação (Horizontal/Vertical) com o botão "Rotacao"
   - Clique no tabuleiro para posicionar
   - Quando terminar, clique em **Pronto!**
4. Após os dois confirmarem, a **fase de batalha** inicia:
   - O Jogador 1 ataca primeiro
   - Clique no tabuleiro inimigo para disparar
   - **X** = acerto, **.** = agua
5. Quem afundar todos os navios do oponente primeiro **vence**.

## Navios

| Navio         | Tamanho |
|---------------|---------|
| Porta-Avioes  | 5       |
| Encouracado   | 4       |
| Cruzador      | 3       |
| Submarino     | 3       |
| Destruidor    | 2       |

## Partidas simultâneas

O servidor suporta múltiplas partidas ao mesmo tempo. Cada par de jogadores que se conecta forma uma partida independente.
