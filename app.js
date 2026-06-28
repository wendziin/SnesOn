// State Manager
const state = {
    servers: [],
    activeServer: null,
    roms: [],
    gamepadConnected: false,
    
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
let gamepadStatus, gamepadStatusText;
let menuToggle, sidebarSection, btnCloseSidebar, sidebarOverlay;
let liteModeCheckbox;

// Server Edit state
let editingServerId = null;

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
    
    menuToggle = document.getElementById('menu-toggle');
    sidebarSection = document.getElementById('sidebar-section');
    btnCloseSidebar = document.getElementById('btn-close-sidebar');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    liteModeCheckbox = document.getElementById('lite-mode-checkbox');
}

// Initialize App
function initializeAll() {
    initDOM();
    loadSavedServers();
    initLiteMode();
    setupEventListeners();
    setupGamepadDetection();
}

function initLiteMode() {
    const savedLiteMode = safeStorage.getItem('retrostream_lite_mode');
    
    // Se o valor estiver salvo, aplica; se não, detecta se o user agent é uma TV
    let isLiteActive = false;
    if (savedLiteMode !== null) {
        isLiteActive = (savedLiteMode === 'true');
    } else {
        // Detecção básica de TV/dispositivos lentos
        const ua = navigator.userAgent.toLowerCase();
        isLiteActive = ua.includes('smart-tv') || 
                       ua.includes('smarttv') || 
                       ua.includes('googletv') || 
                       ua.includes('appletv') || 
                       ua.includes('firetv') || 
                       ua.includes('netcast') || 
                       ua.includes('opera tv') || 
                       ua.includes('tizen') || 
                       ua.includes('playstation') || 
                       ua.includes('xbox');
    }
    
    // Sincroniza estado visual
    if (isLiteActive) {
        document.body.classList.add('is-lite');
        if (liteModeCheckbox) liteModeCheckbox.checked = true;
        console.log("RetroStream: Modo Lite ativado para melhor performance.");
    } else {
        document.body.classList.remove('is-lite');
        if (liteModeCheckbox) liteModeCheckbox.checked = false;
    }
    
    // Configura o ouvinte de alteração do checkbox
    if (liteModeCheckbox) {
        liteModeCheckbox.addEventListener('change', (e) => {
            const active = e.target.checked;
            safeStorage.setItem('retrostream_lite_mode', active ? 'true' : 'false');
            if (active) {
                document.body.classList.add('is-lite');
                showToast('Modo Lite ativado! Efeitos visuais desativados.', 'success');
            } else {
                document.body.classList.remove('is-lite');
                showToast('Modo Lite desativado! Efeitos visuais ativados.', 'success');
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAll);
} else {
    initializeAll();
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
    // Server form submission (suporta adição e edição)
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
        
        const serverName = serverNameInput.value.trim();
        
        if (editingServerId !== null) {
            // Editando servidor existente
            const serverIndex = state.servers.findIndex(s => s.id === editingServerId);
            if (serverIndex !== -1) {
                state.servers[serverIndex].name = serverName;
                state.servers[serverIndex].url = url;
                
                // Se o servidor editado for o ativo, atualiza o banner
                if (state.activeServer && state.activeServer.id === editingServerId) {
                    state.activeServer = state.servers[serverIndex];
                    activeServerName.textContent = state.activeServer.name;
                    activeServerUrl.textContent = state.activeServer.url;
                }
                
                saveServers();
                renderServers();
                showToast('Servidor atualizado!');
            }
            cancelEditingServer();
        } else {
            // Adicionando novo servidor
            const newServer = {
                id: Date.now(),
                name: serverName,
                url: url
            };
            
            state.servers.push(newServer);
            saveServers();
            renderServers();
            
            serverForm.reset();
            showToast('Servidor adicionado com sucesso!');
        }
    });

    // Controle da barra lateral (Drawer Settings)
    if (menuToggle && sidebarSection && sidebarOverlay) {
        const closeSidebar = () => {
            sidebarSection.classList.remove('open');
            sidebarOverlay.classList.remove('open');
        };
        
        menuToggle.addEventListener('click', () => {
            sidebarSection.classList.add('open');
            sidebarOverlay.classList.add('open');
        });
        
        if (btnCloseSidebar) {
            btnCloseSidebar.addEventListener('click', closeSidebar);
        }
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
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
            <div class="server-actions">
                <button class="btn-edit-server" title="Editar Servidor">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-delete-server" title="Remover Servidor">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `;
        
        // Click to load server
        item.addEventListener('click', (e) => {
            // Avoid triggering when actions are clicked
            if (e.target.closest('.server-actions')) return;
            loadServer(server);
        });
        
        // Edit server action
        item.querySelector('.btn-edit-server').addEventListener('click', (e) => {
            e.stopPropagation();
            startEditingServer(server);
        });
        
        // Delete server action
        item.querySelector('.btn-delete-server').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteServer(server.id);
        });
        
        serversContainer.appendChild(item);
    });
}

// Auxiliares para Edição de Servidor
function startEditingServer(server) {
    editingServerId = server.id;
    serverNameInput.value = server.name;
    serverUrlInput.value = server.url;
    
    const submitBtn = serverForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Atualizar Servidor';
        submitBtn.classList.add('btn-warning');
    }
    
    let cancelBtn = document.getElementById('btn-cancel-edit');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'btn-cancel-edit';
        cancelBtn.className = 'btn btn-secondary btn-block';
        cancelBtn.style.marginTop = '0.5rem';
        cancelBtn.textContent = 'Cancelar Edição';
        cancelBtn.addEventListener('click', cancelEditingServer);
        serverForm.appendChild(cancelBtn);
    }
    
    serverNameInput.focus();
}

function cancelEditingServer() {
    editingServerId = null;
    serverForm.reset();
    
    const submitBtn = serverForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Salvar Servidor';
        submitBtn.classList.remove('btn-warning');
    }
    
    const cancelBtn = document.getElementById('btn-cancel-edit');
    if (cancelBtn) {
        cancelBtn.remove();
    }
}

// Delete Server logic
function deleteServer(id) {
    state.servers = state.servers.filter(s => s.id !== id);
    saveServers();
    
    // Fechar edição se for o servidor deletado
    if (editingServerId === id) {
        cancelEditingServer();
    }
    
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
    
    // Fechar a barra lateral ao selecionar o servidor
    if (sidebarSection && sidebarOverlay) {
        sidebarSection.classList.remove('open');
        sidebarOverlay.classList.remove('open');
    }
    
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
        romsLoading.classList.remove('hidden');
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
            const isJson = contentType.includes('application/json') || url.toLowerCase().split('?')[0].endsWith('.json');
            
            if (isJson) {
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
                <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px; font-family: monospace; font-size: 0.75rem; color: #fca5a5; max-width: 400px; word-break: break-all; text-align: left; line-height: 1.4;">
                    <strong style="color: #f87171;">Detalhes do Diagnóstico:</strong><br>
                    • <strong>Erro:</strong> ${error.name}<br>
                    • <strong>Mensagem:</strong> ${error.message}<br>
                    • <strong>URL tentada:</strong> <span style="font-size: 0.7rem; color: #93c5fd;">${url}</span>
                </div>
            </div>
        `;
        showToast(isDropboxErr ? 'Dropbox não suportado.' : `Erro: ${error.message}`, 'error');
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

// Limpa o nome do jogo removendo marcas de tradução/hacks para bater melhor com a Libretro CDN
function cleanNameForGuesses(name) {
    // 1. Remover colchetes [...] (geralmente tags de hack/tradutores)
    let clean = name.replace(/\[[^\]]*\]/g, '');
    
    // 2. Filtrar e preservar apenas parênteses com regiões válidas da CDN
    const regionRegex = /\((USA|Europe|Japan|World|En,Fr,De,Es,It|Proto|Beta|France|Germany|Italy|Spain|UK)\)/i;
    
    const regionsMatched = clean.match(/\(([^)]+)\)/g);
    let regionToKeep = null;
    if (regionsMatched) {
        for (let r of regionsMatched) {
            if (regionRegex.test(r)) {
                regionToKeep = r;
                break;
            }
        }
    }
    
    // Remover todas as tags entre parênteses para obter o nome limpo base
    clean = clean.replace(/\([^)]*\)/g, '');
    
    // Limpar espaços extras
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return {
        baseName: clean,
        region: regionToKeep
    };
}

// Normalizar nomes para melhor correspondência de capas (trata minúsculas, underlines, hifens e tags de região)
function normalizeNameForBoxart(name) {
    let clean = name.replace(/[_-]/g, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // Capitalizar Title Case
    clean = clean.toLowerCase().split(' ').map(word => {
        if (word === 'usa') return 'USA';
        if (word === 'jpn' || word === 'jap') return 'Japan';
        if (word === 'eur') return 'Europe';
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    
    clean = clean.replace(/\(usa\)/i, '(USA)');
    clean = clean.replace(/\(europe\)/i, '(Europe)');
    clean = clean.replace(/\(japan\)/i, '(Japan)');
    clean = clean.replace(/\(j\)/i, '(Japan)');
    
    return clean;
}

// Guess official cover art URLs from Libretro CDN com fallback inteligente
function getBoxartGuesses(cleanName) {
    const baseUrl = "https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/";
    
    const { baseName, region } = cleanNameForGuesses(cleanName);
    const normalizedBase = normalizeNameForBoxart(baseName);
    
    const guesses = [];
    
    // 1. Tentar com a região original se ela foi preservada
    if (region) {
        const normalizedRegion = normalizeNameForBoxart(region);
        guesses.push(`${baseUrl}${encodeURIComponent(normalizedBase + ' ' + normalizedRegion)}.png`);
    }
    
    // 2. Tentar com região padrão USA
    guesses.push(`${baseUrl}${encodeURIComponent(normalizedBase + ' (USA)')}.png`);
    
    // 3. Tentar nome bruto sem região
    guesses.push(`${baseUrl}${encodeURIComponent(normalizedBase)}.png`);
    
    // 4. Tentar com região Europe
    guesses.push(`${baseUrl}${encodeURIComponent(normalizedBase + ' (Europe)')}.png`);
    
    // 5. Tentar com região Japan
    guesses.push(`${baseUrl}${encodeURIComponent(normalizedBase + ' (Japan)')}.png`);
    
    return guesses;
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
    if (!window.IntersectionObserver) {
        // Fallback para navegadores antigos: desativa a paginação e renderiza tudo de uma vez
        console.warn("IntersectionObserver não é suportado neste navegador. Carregando todas as ROMs.");
        state.pagination.itemsPerPage = 9999;
        state.pagination.hasMore = false;
        renderNextPage(true);
        updateScrollTriggerMessage();
        return;
    }

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
        
        <!-- Fallback cover decorativo se a boxart falhar -->
        <div class="rom-card-fallback-cover">
            <svg class="fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="6" width="20" height="12" rx="3" />
                <circle cx="6" cy="12" r="1.5" fill="currentColor" />
                <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                <circle cx="15" cy="11" r="1" fill="currentColor" />
                <circle cx="15" cy="13" r="1" fill="currentColor" />
                <circle cx="17" cy="12" r="1" fill="currentColor" />
            </svg>
        </div>
        
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
        } else {
            // Esgotou guesses: adiciona classe de sem capa
            card.classList.add('no-cover');
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
    
    // Converter links do Dropbox para o subdomínio dl.dropboxusercontent.com para ignorar CORS sem proxy
    let targetRomUrl = rom.absoluteUrl;
    if (targetRomUrl.includes('dropbox.com') && !targetRomUrl.includes('dl.dropboxusercontent.com')) {
        targetRomUrl = targetRomUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }
    
    // Encode components correctly for query params
    const encodedRomUrl = encodeURIComponent(targetRomUrl);
    const core = 'snes';
    iframe.src = `emulator.html?v=1.1.4&game=${encodedRomUrl}&core=${core}`;
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
