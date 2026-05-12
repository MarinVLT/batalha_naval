const http = require('http');
const fs   = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

const REQUIRED_SHIPS = {
    'Porta-Aviões': 5,
    'Encouraçado':  4,
    'Cruzador':     2,
    'Submarino':    1,
    'Hidroaviões':  3,
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'text/javascript',
};

// --- HTTP server (serves arquivos da pasta public) ---
const server = http.createServer((req, res) => {
    const url      = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, 'public', path.basename(url));
    const ext      = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Nao encontrado'); return; }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
});

// --- WebSocket server ---
const wss = new WebSocket.Server({ server });

let waitingPlayer = null;
const games = new Map();

wss.on('connection', (ws) => {
    if (!waitingPlayer) {
        waitingPlayer = ws;
        ws.playerIndex = 0;
        console.log('Jogador 1 conectado — aguardando Jogador 2...');
        send(ws, { type: 'waiting' });
    } else {
        const p1 = waitingPlayer;
        const p2 = ws;
        waitingPlayer = null;
        p2.playerIndex = 1;
        console.log('Jogador 2 conectado');
        createGame(p1, p2);
    }

    ws.on('message', (raw) => {
        try { handleMessage(ws, JSON.parse(raw)); }
        catch (err) { console.error('Mensagem inválida:', err.message); }
    });

    ws.on('close', () => handleDisconnect(ws));
});

// --- Game lifecycle ---

function createGame(p1, p2) {
    const id = `game_${Date.now()}`;
    const game = {
        id,
        players: [p1, p2],
        playerData: [
            { ships: [], hitCells: new Set(), missCells: new Set() },
            { ships: [], hitCells: new Set(), missCells: new Set() },
        ],
        ready: [false, false],
        phase: 'setup',
        currentTurn: 0,
    };
    p1.gameId = id;
    p2.gameId = id;
    games.set(id, game);

    send(p1, { type: 'game_start', playerNumber: 1 });
    send(p2, { type: 'game_start', playerNumber: 2 });
    console.log(`Partida ${id} iniciada`);
}

function handleMessage(ws, msg) {
    const game = games.get(ws.gameId);
    if (!game) return;

    if (msg.type === 'setup_done') onSetupDone(ws, game, msg.ships);
    if (msg.type === 'shoot')      onShoot(ws, game, msg.row, msg.col);
}

function onSetupDone(ws, game, ships) {
    if (game.phase !== 'setup') return;

    if (!validateShips(ships)) {
        send(ws, { type: 'error', message: 'Configuração de navios inválida.' });
        return;
    }

    game.playerData[ws.playerIndex].ships = ships.map(s => ({
        name:  s.name,
        cells: s.cells,
        hits:  0,
        sunk:  false,
    }));
    game.ready[ws.playerIndex] = true;

    send(getOpponent(game, ws), { type: 'opponent_ready' });

    if (game.ready[0] && game.ready[1]) {
        game.phase = 'battle';
        broadcast(game, { type: 'battle_start', currentTurn: 1 });
    }
}

function onShoot(ws, game, row, col) {
    if (game.phase !== 'battle') return;

    if (game.currentTurn !== ws.playerIndex) {
        send(ws, { type: 'error', message: 'Não é sua vez!' });
        return;
    }

    const opponentIdx  = 1 - ws.playerIndex;
    const opponentData = game.playerData[opponentIdx];
    const posKey       = `${row},${col}`;

    if (opponentData.hitCells.has(posKey) || opponentData.missCells.has(posKey)) {
        send(ws, { type: 'error', message: 'Você já atirou nessa posição!' });
        return;
    }

    const hitShip = opponentData.ships.find(s =>
        s.cells.some(c => c.row === row && c.col === col)
    );

    let hit = false, sunk = false, shipName = null;

    if (hitShip) {
        hit      = true;
        shipName = hitShip.name;
        hitShip.hits++;
        sunk          = hitShip.hits === hitShip.cells.length;
        hitShip.sunk  = sunk;
        opponentData.hitCells.add(posKey);
    } else {
        opponentData.missCells.add(posKey);
    }

    send(ws, { type: 'shot_result', row, col, hit, sunk, shipName });
    send(getOpponent(game, ws), { type: 'enemy_shot', row, col, hit, sunk, shipName });

    if (opponentData.ships.every(s => s.sunk)) {
        broadcast(game, { type: 'game_over', winner: ws.playerIndex + 1 });
        games.delete(game.id);
        console.log(`Partida ${game.id} encerrada — vencedor: Jogador ${ws.playerIndex + 1}`);
        return;
    }

    // acerto mantém a vez; erro passa a vez para o oponente
    if (!hit) {
        game.currentTurn = opponentIdx;
    }
    broadcast(game, { type: 'turn_change', currentTurn: game.currentTurn + 1 });
}

function handleDisconnect(ws) {
    if (waitingPlayer === ws) {
        console.log('Jogador 1 desconectou enquanto aguardava oponente');
        waitingPlayer = null;
        return;
    }

    const game = games.get(ws.gameId);
    if (!game) return;

    const opponent      = getOpponent(game, ws);
    const winnerNumber  = opponent.playerIndex + 1;

    console.log(`Jogador ${ws.playerIndex + 1} desconectou da partida ${game.id} — Jogador ${winnerNumber} venceu por W.O.`);

    if (opponent?.readyState === WebSocket.OPEN) {
        send(opponent, { type: 'opponent_disconnected' });
    }
    games.delete(game.id);
    console.log(`Partida ${game.id} encerrada`);
}

// --- Helpers ---

function validateShips(ships) {
    if (!Array.isArray(ships) || ships.length !== Object.keys(REQUIRED_SHIPS).length) return false;

    const occupied  = new Set();
    const nameCount = {};

    for (const ship of ships) {
        if (!REQUIRED_SHIPS[ship.name])                           return false;
        if (ship.cells.length !== REQUIRED_SHIPS[ship.name])     return false;
        if (!isLinear(ship.cells))                                return false;

        nameCount[ship.name] = (nameCount[ship.name] || 0) + 1;

        for (const { row, col } of ship.cells) {
            if (row < 0 || row > 9 || col < 0 || col > 9) return false;
            const key = `${row},${col}`;
            if (occupied.has(key)) return false;
            occupied.add(key);
        }
    }

    if (!Object.keys(REQUIRED_SHIPS).every(name => nameCount[name] === 1)) return false;

    return !hasAdjacentShips(ships);
}

function hasAdjacentShips(ships) {
    for (let i = 0; i < ships.length; i++) {
        for (let j = i + 1; j < ships.length; j++) {
            for (const ca of ships[i].cells) {
                for (const cb of ships[j].cells) {
                    if (Math.abs(ca.row - cb.row) <= 1 && Math.abs(ca.col - cb.col) <= 1) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function isLinear(cells) {
    const rows = cells.map(c => c.row);
    const cols = cells.map(c => c.col);

    const sameRow = rows.every(r => r === rows[0]);
    const sameCol = cols.every(c => c === cols[0]);
    if (!sameRow && !sameCol) return false;

    const sorted = sameRow
        ? [...cols].sort((a, b) => a - b)
        : [...rows].sort((a, b) => a - b);

    return sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
}

function getOpponent(game, ws) {
    return game.players[1 - ws.playerIndex];
}

function send(ws, data) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(game, data) {
    game.players.forEach(p => send(p, data));
}

server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
