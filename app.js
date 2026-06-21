// State Manager
const state = {
    servers: [],
    activeServer: null,
    roms: [],
    gamepadConnected: false,
    isTV: false,
    
    // Pagination & Infinite Scroll State
    pagination: {
        currentPage: 1,
        itemsPerPage: 12,
        filteredRoms: [],
        hasMore: true
    },
    isLoadingRoms: false,
    observer: null
};

// --- Função de Debounce ---
function debounce(func, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Armazenamento seguro de fallback se o localStorage estiver bloqueado (ex: aba anônima)
const memoryStorage = {};
const safeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn("localStorage.getItem inacessível:", e);
            return memoryStorage[key] || null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn("localStorage.setItem inacessível:", e);
            memoryStorage[key] = String(value);
        }
    }
};

// DOM References (serão inicializadas no DOMContentLoaded)
let serverForm, serverNameInput, serverUrlInput, serversContainer;
let searchInput, btnRefresh, activeServerBanner, activeServerName, activeServerUrl;
let romsLoading, romsContainer;
let emulatorOverlay, btnExitEmulator, currentGameTitle, emulatorContainer;
let gamepadStatus, gamepadStatusText, tvModeToggle;

function initDOM() {
    serverForm = document.getElementById('server-form');
    serverNameInput = document.getElementById('server-name');
    serverUrlInput = document.getElementById('server-url');
    serversContainer = document.getElementById('servers-container');

    searchInput = document.getElementById('search-input');
    btnRefresh = document.getElementById('btn-refresh');
    activeServerBanner = document.getElementById('active-server-banner');
    activeServerName = document.getElementById('active-server-name');
    activeServerUrl = document.getElementById('active-server-url');

    romsLoading = document.getElementById('roms-loading');
    romsContainer = document.getElementById('roms-container');

    emulatorOverlay = document.getElementById('emulator-overlay');
    btnExitEmulator = document.getElementById('btn-exit-emulator');
    currentGameTitle = document.getElementById('current-game-title');
    emulatorContainer = document.getElementById('emulator-game-container');

    gamepadStatus = document.getElementById('gamepad-status');
    if (gamepadStatus) {
        gamepadStatusText = gamepadStatus.querySelector('.status-text');
    }
    tvModeToggle = document.getElementById('tv-mode-toggle');
}

// Initialize App
function initializeAll() {
    initDOM();
    detectTV();
    loadSavedServers();
    setupEventListeners();
    setupGamepadDetection();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAll);
} else {
    initializeAll();
}

// Detectar se está rodando em uma Smart TV para desabilitar efeitos visuais pesados
function detectTV() {
    // 1. Verificar parâmetro de URL (Ex: ?tv=1 ou ?tv=true)
    const urlParams = new URLSearchParams(window.location.search);
    const tvParam = urlParams.get('tv');
    
    // 2. Verificar no localStorage se o usuário forçou o modo TV anteriormente
    const savedTvMode = safeStorage.getItem('retrostream_tv_mode');
    
    // 3. Detecção padrão por User Agent
    const ua = navigator.userAgent.toLowerCase();
    const uaDetect = ua.includes('smarttv') || 
                     ua.includes('smart-tv') || 
                     ua.includes('googletv') || 
                     ua.includes('androidtv') || 
                     ua.includes('tcl') || 
                     ua.includes('tv') || 
                     ua.includes('appletv') || 
                     ua.includes('firetv') || 
                     ua.includes('playstation') || 
                     ua.includes('xbox');
                     
    // Decisão final
    if (tvParam === '1' || tvParam === 'true') {
        state.isTV = true;
        safeStorage.setItem('retrostream_tv_mode', 'true');
    } else if (tvParam === '0' || tvParam === 'false') {
        state.isTV = false;
        safeStorage.setItem('retrostream_tv_mode', 'false');
    } else if (savedTvMode !== null) {
        state.isTV = (savedTvMode === 'true');
    } else {
        state.isTV = uaDetect;
    }
                 
    if (state.isTV) {
        document.body.classList.add('is-tv');
        console.log("RetroStream: Smart TV ativada. Recursos pesados de CSS foram desativados para performance.");
    } else {
        document.body.classList.remove('is-tv');
    }
    
    updateTvToggleUI();
}

function updateTvToggleUI() {
    if (!tvModeToggle) return;
    const textSpan = tvModeToggle.querySelector('.status-text');
    if (state.isTV) {
        tvModeToggle.classList.add('active');
        if (textSpan) textSpan.textContent = 'Modo TV: Ativo';
    } else {
        tvModeToggle.classList.remove('active');
        if (textSpan) textSpan.textContent = 'Modo TV: Desativado';
    }
}

// Toast Notification Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Close on click
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Setup Event Listeners
function setupEventListeners() {
    // Server form submission
    serverForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let url = serverUrlInput.value.trim();
        
        // Se o endereço não começar com http:// ou https://, adicionar http:// automaticamente
        if (!/^https?:\/\//i.test(url)) {
            url = 'http://' + url;
        }
        
        // Remove trailing slash for uniformity
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        
        const newServer = {
            id: Date.now(),
            name: serverNameInput.value.trim(),
            url: url
        };
        
        state.servers.push(newServer);
        saveServers();
        renderServers();
        
        serverForm.reset();
        showToast('Servidor adicionado com sucesso!');
    });
    
    // Search ROMs input with debounce and pagination
    const debouncedSearch = debounce((query) => {
        state.pagination.currentPage = 1;
        state.pagination.hasMore = true;
        
        if (query === '') {
            state.pagination.filteredRoms = [...state.roms];
        } else {
            state.pagination.filteredRoms = state.roms.filter(rom => 
                rom.text.toLowerCase().includes(query)
            );
        }
        
        renderNextPage(true);
    }, 300);

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        debouncedSearch(query);
    });
    
    // Refresh button
    btnRefresh.addEventListener('click', () => {
        if (state.activeServer) {
            fetchRomsForActiveServer();
        }
    });
    
    // Exit emulator overlay
    btnExitEmulator.addEventListener('click', () => {
        exitEmulator();
    });
    
    // Alternar modo TV manualmente
    if (tvModeToggle) {
        tvModeToggle.addEventListener('click', () => {
            const newMode = !state.isTV;
            safeStorage.setItem('retrostream_tv_mode', newMode ? 'true' : 'false');
            
            showToast(newMode ? 'Modo TV ativado! Recarregando...' : 'Modo TV desativado! Recarregando...', 'success');
            
            setTimeout(() => {
                // Remover parâmetro da URL de tv se existir
                const url = new URL(window.location.href);
                url.searchParams.delete('tv');
                window.location.href = url.toString();
            }, 1000);
        });
    }
}

// Gamepad API Detection
function setupGamepadDetection() {
    window.addEventListener('gamepadconnected', (e) => {
        state.gamepadConnected = true;
        gamepadStatus.className = 'status-badge connected';
        gamepadStatusText.textContent = `Controle Conectado: ${e.gamepad.id.slice(0, 15)}...`;
        showToast('Controle gamepad detectado!', 'success');
    });

    window.addEventListener('gamepaddisconnected', () => {
        state.gamepadConnected = false;
        gamepadStatus.className = 'status-badge disconnected';
        gamepadStatusText.textContent = 'Controle Desconectado';
        showToast('Controle gamepad desconectado.', 'error');
    });
    
    // Check initially if browser supports it and has one already connected
    if (navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                state.gamepadConnected = true;
                gamepadStatus.className = 'status-badge connected';
                gamepadStatusText.textContent = `Controle Conectado: ${gamepads[i].id.slice(0, 15)}...`;
                break;
            }
        }
    }
}

// LocalStorage Persistence
function loadSavedServers() {
    const raw = safeStorage.getItem('retrostream_servers');
    if (raw) {
        try {
            state.servers = JSON.parse(raw);
        } catch (e) {
            state.servers = [];
        }
    } else {
        // Default helper local server
        state.servers = [
            { id: 1, name: 'Localhost Termux', url: 'http://127.0.0.1:8080' }
        ];
        saveServers();
    }
    renderServers();
}

function saveServers() {
    safeStorage.setItem('retrostream_servers', JSON.stringify(state.servers));
}

// Render Server List
function renderServers() {
    serversContainer.innerHTML = '';
    
    if (state.servers.length === 0) {
        serversContainer.innerHTML = '<div class="empty-state">Nenhum servidor salvo.</div>';
        return;
    }
    
    state.servers.forEach(server => {
        const item = document.createElement('div');
        item.className = 'server-item';
        if (state.activeServer && state.activeServer.id === server.id) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <div class="server-info">
                <span class="server-info-name">${server.name}</span>
                <span class="server-info-url">${server.url}</span>
            </div>
            <button class="btn-delete-server" title="Remover Servidor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        `;
        
        // Click to load server
        item.addEventListener('click', (e) => {
            // Avoid triggering when delete is clicked
            if (e.target.closest('.btn-delete-server')) return;
            loadServer(server);
        });
        
        // Delete server action
        item.querySelector('.btn-delete-server').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteServer(server.id);
        });
        
        serversContainer.appendChild(item);
    });
}

// Delete Server logic
function deleteServer(id) {
    state.servers = state.servers.filter(s => s.id !== id);
    saveServers();
    
    // If the active server was deleted, reset state
    if (state.activeServer && state.activeServer.id === id) {
        state.activeServer = null;
        state.roms = [];
        activeServerBanner.classList.add('hidden');
        searchInput.disabled = true;
        btnRefresh.disabled = true;
        
        // Reset pagination state
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        state.pagination.currentPage = 1;
        state.pagination.filteredRoms = [];
        state.pagination.hasMore = false;
        updateScrollTriggerMessage();
        
        romsContainer.innerHTML = `
            <div class="roms-initial-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 12h8M12 8v8"></path>
                </svg>
                <p>Selecione um servidor ao lado para carregar as ROMs.</p>
            </div>
        `;
    }
    
    renderServers();
    showToast('Servidor removido.');
}

// Load Server Action
function loadServer(server) {
    state.activeServer = server;
    renderServers();
    
    // Update Banner
    activeServerName.textContent = server.name;
    activeServerUrl.textContent = server.url;
    activeServerBanner.classList.remove('hidden');
    
    // Unlock Actions
    searchInput.disabled = false;
    btnRefresh.disabled = false;
    searchInput.value = '';
    
    fetchRomsForActiveServer();
}

// Scrape ROM files from Server (supports standard HTTP servers and GitHub Repository API)
async function fetchRomsForActiveServer() {
    if (!state.activeServer) return;
    
    // Show skeletons and reset loading state
    state.isLoadingRoms = true;
    showSkeletons(12);
    if (romsLoading) {
        romsLoading.classList.add('hidden');
    }
    
    try {
        let fetchedRoms = [];
        let url = state.activeServer.url;
        
        // Detect if it is a Dropbox folder link
        if (url.includes('dropbox.com')) {
            throw new Error('Dropbox não suporta listagem direta de arquivos via navegador (CORS). Por favor, hospede suas ROMs no GitHub ou use o servidor local Termux.');
        }
        
        // Detect if it is a GitHub repository folder link
        const githubRegex = /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/i;
        const githubRootRegex = /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/i;
        
        let isGithub = false;
        let apiUrl = url;
        
        let match = url.match(githubRegex);
        if (match) {
            isGithub = true;
            const owner = match[1];
            const repo = match[2];
            const ref = match[3];
            const path = match[4];
            apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
        } else {
            match = url.match(githubRootRegex);
            if (match) {
                isGithub = true;
                const owner = match[1];
                const repo = match[2];
                apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
            }
        }
        
        if (isGithub) {
            // Fetch from GitHub contents API
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Erro na API do GitHub: status ${response.status}`);
            }
            
            const data = await response.json();
            if (Array.isArray(data)) {
                fetchedRoms = data
                    .filter(item => item.type === 'file')
                    .map(item => {
                        return {
                            href: item.download_url,
                            text: item.name
                        };
                    })
                    .filter(item => {
                        const cleanPath = item.text.toLowerCase();
                        return cleanPath.endsWith('.smc') || 
                               cleanPath.endsWith('.sfc') || 
                               cleanPath.endsWith('.zip') || 
                               cleanPath.endsWith('.7z');
                    });
            }
        } else {
            // Standard static file server (Apache/Node/etc.)
            const response = await fetch(url, {
                mode: 'cors' // Ensure we request CORS
            });
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: status ${response.status}`);
            }
            
            const contentType = response.headers.get('Content-Type') || '';
            
            if (contentType.includes('application/json')) {
                // Server responds directly with JSON array of files/paths
                const data = await response.json();
                if (Array.isArray(data)) {
                    fetchedRoms = data.map(item => {
                        if (typeof item === 'string') {
                            return { href: item, text: getFileName(item) };
                        } else if (item && typeof item === 'object') {
                            return { 
                                href: item.href || item.url || item.path, 
                                text: item.name || item.title || getFileName(item.href || item.url || item.path) 
                            };
                        }
                        return null;
                    }).filter(Boolean);
                }
            } else {
                // Assume directory listing (HTML)
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const links = Array.from(doc.querySelectorAll('a'));
                
                fetchedRoms = links
                    .map(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();
                        return { href, text };
                    })
                    .filter(item => {
                        if (!item.href) return false;
                        
                        // Filter extensions: .smc, .sfc, .zip, .7z
                        const cleanPath = item.href.split('?')[0].toLowerCase();
                        return cleanPath.endsWith('.smc') || 
                               cleanPath.endsWith('.sfc') || 
                               cleanPath.endsWith('.zip') || 
                               cleanPath.endsWith('.7z');
                    });
            }
        }
        
        // Resolve absolute URLs
        state.roms = fetchedRoms.map(rom => {
            let absoluteUrl = rom.href;
            
            // Only resolve relative URLs if it's not a direct GitHub download link
            if (!isGithub) {
                let base = state.activeServer.url;
                if (!base.endsWith('/')) {
                    base += '/';
                }
                try {
                    absoluteUrl = new URL(rom.href, base).toString();
                } catch (e) {
                    absoluteUrl = base + rom.href;
                }
            }
            
            // Clean up visual names
            let displayName = rom.text;
            if (displayName === rom.href) {
                displayName = getFileName(rom.href);
            }
            // Remove file extension for cleaner display
            displayName = displayName.replace(/\.(smc|sfc|zip|7z)$/i, '');
            
            return {
                href: rom.href,
                text: displayName,
                absoluteUrl: absoluteUrl
            };
        });
        
        // Hide loader & render grid
        if (romsLoading) romsLoading.classList.add('hidden');
        
        state.pagination.filteredRoms = [...state.roms];
        state.isLoadingRoms = false;
        renderNextPage(true);
        setupIntersectionObserver();
        
        showToast(`Carregados ${state.roms.length} jogos.`);
        
    } catch (error) {
        console.error('Fetch ROMs error:', error);
        state.isLoadingRoms = false;
        if (romsLoading) romsLoading.classList.add('hidden');
        
        const isDropboxErr = error.message.includes('Dropbox');
        
        romsContainer.innerHTML = `
            <div class="roms-initial-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
                    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p style="color: #ef4444; font-weight: 500;">${isDropboxErr ? 'Dropbox não suportado' : 'Falha ao conectar com o servidor.'}</p>
                <p style="font-size: 0.85rem; max-width: 420px; margin-top: 0.25rem;">
                    ${isDropboxErr ? error.message : 'Certifique-se de que o endereço do servidor (ou link do GitHub) está correto e ativo.'}
                </p>
            </div>
        `;
        showToast(isDropboxErr ? 'Dropbox não suportado.' : 'Erro de conexão com o servidor ou GitHub.', 'error');
    }
}

// Utility to get filename from path
function getFileName(path) {
    if (!path) return '';
    try {
        const decoded = decodeURIComponent(path);
        return decoded.substring(decoded.lastIndexOf('/') + 1);
    } catch (e) {
        return path.substring(path.lastIndexOf('/') + 1);
    }
}

// Normalizar nomes para melhor correspondência de capas (trata minúsculas, underlines, hifens e tags de região)
function normalizeNameForBoxart(name) {
    // Substituir underlines e hifens por espaços
    let clean = name.replace(/[_-]/g, ' ');
    
    // Remover espaços múltiplos e pontas
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // Capitalizar primeira letra de cada palavra (Title Case)
    clean = clean.toLowerCase().split(' ').map(word => {
        if (word === 'usa') return 'USA';
        if (word === 'jpn' || word === 'jap') return 'Japan';
        if (word === 'eur') return 'Europe';
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    
    // Corrigir parênteses de região comuns
    clean = clean.replace(/\(usa\)/i, '(USA)');
    clean = clean.replace(/\(europe\)/i, '(Europe)');
    clean = clean.replace(/\(japan\)/i, '(Japan)');
    clean = clean.replace(/\(j\)/i, '(Japan)');
    
    return clean;
}

// Guess official cover art URLs from Libretro CDN
function getBoxartGuesses(cleanName) {
    const baseUrl = "https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/";
    
    // Normalizar o nome antes de gerar as URLs de tentativa
    const normalizedName = normalizeNameForBoxart(cleanName);
    const encodedName = encodeURIComponent(normalizedName);
    
    // If name already contains parentheses (like "Super Mario World (USA)"), search it directly
    if (/\(.*\)/.test(normalizedName)) {
        return [
            `${baseUrl}${encodedName}.png`
        ];
    }
    
    // Otherwise try most common region extensions
    return [
        `${baseUrl}${encodeURIComponent(normalizedName + ' (USA)')}.png`,
        `${baseUrl}${encodedName}.png`,
        `${baseUrl}${encodeURIComponent(normalizedName + ' (Europe)')}.png`,
        `${baseUrl}${encodeURIComponent(normalizedName + ' (Japan)')}.png`
    ];
}

// Exibir skeletons de carregamento
function showSkeletons(count = 12) {
    romsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'rom-card skeleton-card';
        card.innerHTML = `
            <div class="skeleton skeleton-cover"></div>
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-badge"></div>
        `;
        romsContainer.appendChild(card);
    }
}

// Configurar o Intersection Observer para rolagem com paginação
function setupIntersectionObserver() {
    if (state.observer) {
        state.observer.disconnect();
    }
    
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (!trigger) return;
    
    const options = {
        root: null,
        rootMargin: '150px', // Carrega com antecedência
        threshold: 0.1
    };
    
    const callback = (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !state.isLoadingRoms && state.pagination.hasMore) {
            renderNextPage(false);
        }
    };
    
    state.observer = new IntersectionObserver(callback, options);
    state.observer.observe(trigger);
}

// Atualizar mensagem do trigger do scroll infinito
function updateScrollTriggerMessage() {
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (!trigger) return;
    
    if (state.pagination.hasMore && state.pagination.filteredRoms.length > 0) {
        trigger.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin-right: 8px;"></div> Carregando mais jogos...`;
    } else if (state.pagination.filteredRoms.length > 0) {
        trigger.textContent = 'Todos os jogos foram carregados.';
    } else {
        trigger.textContent = '';
    }
}

// Criar elemento DOM do card do jogo
function createRomCard(rom) {
    const card = document.createElement('div');
    card.className = 'rom-card';
    
    card.innerHTML = `
        <div class="rom-card-bg-gradient"></div>
        <img class="rom-card-cover" alt="" style="display: none;">
        <div class="rom-card-overlay"></div>
        <span class="rom-card-title" title="${rom.text}">${rom.text}</span>
        <div class="rom-card-meta">
            <span class="rom-badge">SNES</span>
            <div class="rom-play-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </div>
        </div>
    `;
    
    // Carregar capa do jogo dinamicamente com base nas alternativas
    const img = card.querySelector('.rom-card-cover');
    const guesses = getBoxartGuesses(rom.text);
    let guessIndex = 0;
    
    img.onload = () => {
        img.style.display = 'block';
        card.classList.add('has-cover');
    };
    
    img.onerror = () => {
        guessIndex++;
        if (guessIndex < guesses.length) {
            img.src = guesses[guessIndex];
        }
    };
    
    img.src = guesses[0];
    
    card.addEventListener('click', () => {
        launchGame(rom);
    });
    
    return card;
}

// Renderizar lote de ROMs
function renderRomsBatch(batch) {
    batch.forEach(rom => {
        const card = createRomCard(rom);
        romsContainer.appendChild(card);
    });
}

// Renderizar próxima página de jogos
function renderNextPage(clearGrid = false) {
    if (clearGrid) {
        state.pagination.currentPage = 1;
        state.pagination.hasMore = true;
        romsContainer.innerHTML = '';
        window.scrollTo(0, 0);
    }
    
    const start = (state.pagination.currentPage - 1) * state.pagination.itemsPerPage;
    const end = start + state.pagination.itemsPerPage;
    const batch = state.pagination.filteredRoms.slice(start, end);
    
    if (batch.length === 0) {
        state.pagination.hasMore = false;
        updateScrollTriggerMessage();
        if (clearGrid) {
            romsContainer.innerHTML = `
                <div class="roms-initial-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p>Nenhuma ROM encontrada.</p>
                </div>
            `;
        }
        return;
    }
    
    renderRomsBatch(batch);
    
    if (end >= state.pagination.filteredRoms.length) {
        state.pagination.hasMore = false;
    } else {
        state.pagination.currentPage++;
    }
    
    updateScrollTriggerMessage();
}

// Launch Game in Iframe Sandbox
function launchGame(rom) {
    // Set titles
    currentGameTitle.textContent = rom.text;
    currentGameTitle.title = rom.text;
    
    // Clear and build iframe
    emulatorContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    
    // Encode components correctly for query params
    const encodedRomUrl = encodeURIComponent(rom.absoluteUrl);
    const core = 'snes';
    iframe.src = `emulator.html?v=1.0.7&game=${encodedRomUrl}&core=${core}`;
    iframe.allow = "autoplay; gamepad";
    
    emulatorContainer.appendChild(iframe);
    
    // Show Screen Overlay
    emulatorOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // block page scrolls
    
    showToast(`Carregando: ${rom.text}...`, 'success');
}

// Destroy Emulator and Close Overlay
function exitEmulator() {
    // Clear out container to destroy WebAssembly instance, audio and free RAM immediately
    emulatorContainer.innerHTML = '';
    
    // Hide Screen Overlay
    emulatorOverlay.classList.add('hidden');
    document.body.style.overflow = ''; // restore scrolling
    
    showToast('Jogo encerrado.', 'success');
}
