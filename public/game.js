const SHIPS_CONFIG = [
    { name: 'Porta-Aviões', size: 5 },
    { name: 'Encouraçado', size: 4 },
    { name: 'Cruzador',    size: 2 },
    { name: 'Submarino',   size: 1 },
    { name: 'Hidroaviões',  size: 3 },
];

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const ws = new WebSocket(`ws://${location.host}`);

let playerNumber    = null;
let isMyTurn        = false;
let orientation     = 'H';
let selectedShipIdx = 0;
let placedShips     = [];
let setupGrid       = emptyGrid();
let myGrid          = emptyGrid();
let enemyGrid       = emptyGrid();
let hoverCell       = null;

function emptyGrid() {
    return Array.from({ length: 10 }, () => Array(10).fill(null));
}

// ---- WebSocket ----

ws.onopen  = () => console.log('Conectado');
ws.onclose = () => {
    if (currentScreen() !== 'gameover') alert('Conexão com o servidor perdida.');
};

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
        case 'waiting':
            showScreen('waiting');
            break;

        case 'game_start':
            playerNumber = msg.playerNumber;
            document.getElementById('player-badge').textContent = `Jogador ${playerNumber}`;
            showScreen('setup');
            initSetup();
            break;

        case 'opponent_ready':
            document.getElementById('setup-status').textContent =
                'Oponente está pronto! Finalize o seu posicionamento.';
            break;

        case 'battle_start':
            isMyTurn = msg.currentTurn === playerNumber;
            initBattle();
            showScreen('battle');
            updateTurnDisplay();
            break;

        case 'shot_result':
            enemyGrid[msg.row][msg.col] = msg.sunk ? 'sunk' : (msg.hit ? 'hit' : 'miss');
            renderBattleBoards();
            if (msg.hit) setStatus(msg.sunk ? `Afundou o ${msg.shipName}!` : 'Acertou! Atire novamente.');
            else         setStatus('Água! Vez do oponente.');
            break;

        case 'enemy_shot':
            myGrid[msg.row][msg.col] = msg.hit ? 'hit' : 'miss';
            renderBattleBoards();
            break;

        case 'turn_change':
            isMyTurn = msg.currentTurn === playerNumber;
            updateTurnDisplay();
            break;

        case 'game_over':
            showGameOver(msg.winner === playerNumber);
            break;

        case 'opponent_disconnected':
            showGameOver(true, 'Oponente desconectou.');
            break;

        case 'error':
            document.getElementById('setup-status').textContent = msg.message;
            setStatus(msg.message);
            break;
    }
};

// ---- Setup ----

function initSetup() {
    placedShips     = [];
    setupGrid       = emptyGrid();
    selectedShipIdx = 0;
    orientation     = 'H';
    document.getElementById('setup-status').textContent =
        'Selecione um navio e clique no tabuleiro para posicionar.';

    renderShipPanel();
    renderSetupBoard();

    document.getElementById('btn-rotate').onclick = () => {
        orientation = orientation === 'H' ? 'V' : 'H';
        document.getElementById('orient-label').textContent =
            orientation === 'H' ? 'Horizontal' : 'Vertical';
        renderSetupBoard();
    };

    document.getElementById('btn-reset').onclick = () => {
        placedShips = []; setupGrid = emptyGrid(); selectedShipIdx = 0;
        document.getElementById('btn-ready').disabled = true;
        document.getElementById('setup-status').textContent =
            'Selecione um navio e clique no tabuleiro para posicionar.';
        renderShipPanel();
        renderSetupBoard();
    };

    document.getElementById('btn-ready').onclick = () => {
        if (placedShips.length !== SHIPS_CONFIG.length) return;
        document.getElementById('btn-ready').disabled = true;
        document.getElementById('setup-status').textContent = 'Aguardando oponente...';
        ws.send(JSON.stringify({ type: 'setup_done', ships: placedShips }));
    };

    const boardEl = document.getElementById('setup-board');

    boardEl.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const r = +cell.dataset.row, c = +cell.dataset.col;
        if (!hoverCell || hoverCell.row !== r || hoverCell.col !== c) {
            hoverCell = { row: r, col: c };
            renderSetupBoard();
        }
    });

    boardEl.addEventListener('mouseleave', () => {
        hoverCell = null;
        renderSetupBoard();
    });

    boardEl.addEventListener('click', () => {
        const ship = getSelectedShip();
        if (!ship || !hoverCell) return;
        const cells = shipCells(hoverCell.row, hoverCell.col, ship.size, orientation);
        if (!canPlace(cells)) return;

        cells.forEach(({ row, col }) => setupGrid[row][col] = ship.name);
        placedShips.push({ name: ship.name, cells });

        selectedShipIdx = SHIPS_CONFIG.findIndex(s => !placedShips.some(p => p.name === s.name));

        if (placedShips.length === SHIPS_CONFIG.length) {
            document.getElementById('btn-ready').disabled = false;
            document.getElementById('setup-status').textContent =
                'Frota posicionada! Clique em Pronto quando estiver pronto.';
        }

        renderShipPanel();
        renderSetupBoard();
    });
}

function getSelectedShip() {
    if (selectedShipIdx < 0 || selectedShipIdx >= SHIPS_CONFIG.length) return null;
    const s = SHIPS_CONFIG[selectedShipIdx];
    return placedShips.some(p => p.name === s.name) ? null : s;
}

function shipCells(row, col, size, dir) {
    return Array.from({ length: size }, (_, i) => ({
        row: dir === 'V' ? row + i : row,
        col: dir === 'H' ? col + i : col,
    }));
}

function canPlace(cells) {
    for (const { row, col } of cells) {
        if (row < 0 || row > 9 || col < 0 || col > 9) return false;
        if (setupGrid[row][col] !== null) return false;
    }
    for (const { row, col } of cells) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr, nc = col + dc;
                if (nr < 0 || nr > 9 || nc < 0 || nc > 9) continue;
                const partOfSelf = cells.some(c => c.row === nr && c.col === nc);
                if (setupGrid[nr][nc] !== null && !partOfSelf) return false;
            }
        }
    }
    return true;
}

function renderShipPanel() {
    const panel = document.getElementById('ships-panel');
    panel.innerHTML = '';

    SHIPS_CONFIG.forEach((ship, i) => {
        const el     = document.createElement('div');
        el.className = 'ship-item';
        const placed = placedShips.some(p => p.name === ship.name);

        const blocks = document.createElement('div');
        blocks.className = 'ship-blocks';
        for (let j = 0; j < ship.size; j++) {
            const b = document.createElement('div');
            b.className = 'ship-block';
            blocks.appendChild(b);
        }

        const label = document.createElement('span');
        label.className   = 'ship-name';
        label.textContent = ship.name;

        el.appendChild(blocks);
        el.appendChild(label);

        if (placed)                    el.classList.add('placed');
        else if (i === selectedShipIdx) el.classList.add('selected');
        else el.onclick = () => { selectedShipIdx = i; renderShipPanel(); renderSetupBoard(); };

        panel.appendChild(el);
    });
}

function renderSetupBoard() {
    const ship = getSelectedShip();
    const previewMap = new Map();

    if (ship && hoverCell) {
        const cells = shipCells(hoverCell.row, hoverCell.col, ship.size, orientation);
        const valid = canPlace(cells);
        cells.forEach(c => previewMap.set(`${c.row},${c.col}`, valid));
    }

    const container = document.getElementById('setup-board');
    container.innerHTML = '';
    container.appendChild(buildBoardEl(setupGrid, null, previewMap));
}

// ---- Battle ----

function initBattle() {
    myGrid    = emptyGrid();
    enemyGrid = emptyGrid();
    placedShips.forEach(ship =>
        ship.cells.forEach(({ row, col }) => myGrid[row][col] = 'ship')
    );
}

function renderBattleBoards() {
    const myContainer = document.getElementById('my-board');
    myContainer.innerHTML = '';
    myContainer.appendChild(buildBoardEl(myGrid, null, null));

    const enemyContainer = document.getElementById('enemy-board');
    enemyContainer.innerHTML = '';
    enemyContainer.appendChild(buildBoardEl(enemyGrid, isMyTurn ? shoot : null, null));
}

function shoot(row, col) {
    if (!isMyTurn || enemyGrid[row][col] !== null) return;
    isMyTurn = false;
    updateTurnDisplay();
    ws.send(JSON.stringify({ type: 'shoot', row, col }));
}

function updateTurnDisplay() {
    const el = document.getElementById('turn-display');
    if (isMyTurn) {
        el.textContent = 'Sua vez — clique no tabuleiro inimigo para atacar';
        el.className   = 'my-turn';
    } else {
        el.textContent = 'Aguardando o oponente...';
        el.className   = '';
    }
    renderBattleBoards();
}

function setStatus(msg) {
    document.getElementById('status-msg').textContent = msg;
}

// ---- Game Over ----

function showGameOver(won, extra) {
    showScreen('gameover');
    const msg = document.getElementById('gameover-msg');
    const sub = document.getElementById('gameover-sub');
    msg.textContent = won ? 'VITÓRIA!' : 'DERROTA';
    msg.className   = won ? 'win' : 'lose';
    sub.textContent = extra || (won ? 'Você afundou toda a frota inimiga.' : 'Sua frota foi destruída.');
}

// ---- Board builder ----

function buildBoardEl(grid, clickHandler, previewMap) {
    const wrapper = document.createElement('div');
    wrapper.className = 'board-labeled';

    addLabel(wrapper, '');
    for (let c = 0; c < 10; c++) addLabel(wrapper, c + 1);

    for (let r = 0; r < 10; r++) {
        addLabel(wrapper, ROW_LABELS[r]);
        for (let c = 0; c < 10; c++) {
            const cell = document.createElement('div');
            cell.className   = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            const val = grid[r][c];
            const cls = (val === 'hit' || val === 'miss' || val === 'sunk' || val === 'ship')
                ? val : (val ? 'ship' : null);
            if (cls) cell.classList.add(cls);
            if (val === 'hit' || val === 'sunk') cell.textContent = '✕';
            else if (val === 'miss')             cell.textContent = '·';

            if (previewMap) {
                const key = `${r},${c}`;
                if (previewMap.has(key)) {
                    cell.classList.add('preview');
                    if (!previewMap.get(key)) cell.classList.add('invalid');
                }
            }

            if (clickHandler && val === null) cell.onclick = () => clickHandler(r, c);
            else                              cell.classList.add('blocked');

            wrapper.appendChild(cell);
        }
    }
    return wrapper;
}

function addLabel(parent, text) {
    const el = document.createElement('div');
    el.className   = 'board-label';
    el.textContent = text;
    parent.appendChild(el);
}

// ---- Utils ----

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
}

function currentScreen() {
    const a = document.querySelector('.screen.active');
    return a ? a.id.replace('screen-', '') : null;
}
