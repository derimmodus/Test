/* HelpTool Dashboard Controller - Clean & Minimal Version */
(() => {
  'use strict';

  const TTL_FAST = 15 * 1000;
  const TTL_SLOW = 60 * 1000;

  const state = {
    content: null,
    overlay: null,
    notification: null,
    status: null,
    time: null,
    navButtons: [],
    activeModule: null,
    cache: new Map()
  };

  const helpers = {
    async fetchJson(url, options = {}) {
      const {
        ttl = TTL_FAST,
        cacheKey = url,
        bust = false,
        allowError = false
      } = options;

      if (!bust && state.cache.has(cacheKey)) {
        const entry = state.cache.get(cacheKey);
        if (Date.now() - entry.timestamp < entry.ttl) {
          return entry.value;
        }
      }

      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          if (allowError) {
            return null;
          }
          throw new Error(`HTTP ${response.status} für ${url}`);
        }
        const data = await response.json();
        state.cache.set(cacheKey, { value: data, timestamp: Date.now(), ttl });
        return data;
      } catch (error) {
        if (allowError) {
          console.warn('Fehler beim Laden, ignoriere aufgrund allowError:', error);
          return null;
        }
        throw error;
      }
    },
    escapeHtml(value) {
      if (value == null) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatDate(value) {
      if (!value) return '';
      try {
        return new Intl.DateTimeFormat('de-DE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }).format(new Date(value));
      } catch (error) {
        return value;
      }
    },
    renderEmpty(title, message, icon = 'fa-circle-info') {
      return `
        <section class="empty-state">
          <div class="empty-icon"><i class="fas ${icon}"></i></div>
          <h2>${helpers.escapeHtml(title)}</h2>
          <p>${helpers.escapeHtml(message)}</p>
        </section>
      `;
    },
    notify(message, type = 'info') {
      if (!state.notification) return;
      const toast = document.createElement('div');
      toast.className = `notification ${type}`;
      toast.innerHTML = `
        <span>${helpers.escapeHtml(message)}</span>
        <button type="button" class="notification-close" aria-label="Schließen">
          <i class="fas fa-times"></i>
        </button>
      `;

      const close = () => {
        toast.classList.add('is-hiding');
        setTimeout(() => toast.remove(), 200);
      };

      toast.querySelector('.notification-close')?.addEventListener('click', close);
      state.notification.appendChild(toast);
      setTimeout(close, 5000);
    }
  };

  const MODULES = {
    tools: {
      icon: 'fa-toolbox',
      async render() {
        const tools = await helpers.fetchJson('/api/tools', { cacheKey: 'tools', ttl: TTL_FAST, allowError: true }) || [];
        if (!Array.isArray(tools) || tools.length === 0) {
          return helpers.renderEmpty('Keine Tools vorhanden', 'Fügen Sie Tools über das Backend hinzu.', 'fa-toolbox');
        }

        const normalizeType = tool => (tool?.type || '').toLowerCase();

        const workspaces = tools.filter(tool => normalizeType(tool) === 'workspace');
        const applications = tools.filter(tool => {
          const type = normalizeType(tool);
          return type === 'executable' || type === 'application' || 
                 !type || (tool.tags && tool.tags.includes('system'));
        });
        const networkPaths = tools.filter(tool => normalizeType(tool) === 'network');
        const links = tools.filter(tool => normalizeType(tool) === 'link');
        const handled = new Set([...workspaces, ...applications, ...networkPaths, ...links].map(tool => tool.id));
        const others = tools.filter(tool => !handled.has(tool.id));

        const renderBadge = label => `<span class="badge badge-soft">${helpers.escapeHtml(label)}</span>`;

        const renderMeta = tool => {
          const parts = [];
          if (tool.tags?.length) {
            parts.push(`<p class="card-meta">${tool.tags.map(tag => `<span class="tag">${helpers.escapeHtml(tag)}</span>`).join('')}</p>`);
          }
          if (tool.created_at) {
            parts.push(`<p class="card-meta"><i class="fas fa-clock"></i> ${helpers.formatDate(tool.created_at)}</p>`);
          }
          return parts.join('');
        };

        const workspaceCards = workspaces.map(workspace => {
          const badges = [];
          if (workspace.autostart) badges.push(renderBadge('Autostart'));
          if (workspace.favorite) badges.push(renderBadge('Favorit'));

          return `
            <article class="card workspace-card droppable-workset" data-workspace-id="${workspace.id}">
              <header class="card-header">
                <h3><i class="fas fa-layer-group"></i> ${helpers.escapeHtml(workspace.name || 'Workspace')}</h3>
                ${badges.join('')}
              </header>
              <div class="card-body workspace-drop-zone">
                <div class="workspace-drop-hint" style="display: none;">
                  <i class="fas fa-plus-circle"></i>
                  <span>Tool hier ablegen</span>
                </div>
                <p class="card-meta">Noch keine Tools zugeordnet.</p>
                ${renderMeta(workspace)}
              </div>
            </article>
          `;
        }).join('');

        const renderToolCards = (items, { icon, emptyTitle, emptyMessage, actionLabel }) => {
          if (!items.length) {
            return `
              <div class="empty-state">
                <div class="empty-icon"><i class="fas ${icon}"></i></div>
                <h3>${helpers.escapeHtml(emptyTitle)}</h3>
                <p>${helpers.escapeHtml(emptyMessage)}</p>
              </div>
            `;
          }

          const cards = items.map(tool => {
            const badges = [];
            if (tool.favorite) badges.push(renderBadge('Favorit'));
            if (tool.autostart) badges.push(renderBadge('Autostart'));
            if (tool.admin) badges.push(renderBadge('Admin'));

            return `
              <article class="card tool-card draggable-tool" data-tool-id="${tool.id}" draggable="true" title="Drag & Drop zu Workset">
                <header class="card-header">
                  <h3><i class="fas ${icon}"></i> ${helpers.escapeHtml(tool.name || tool.title || 'Tool')}</h3>
                  ${badges.join('')}
                </header>
                <div class="card-body">
                  ${tool.path ? `<p class="card-path"><i class="fas fa-location-arrow"></i> ${helpers.escapeHtml(tool.path)}</p>` : ''}
                  ${renderMeta(tool)}
                </div>
                <footer class="card-footer">
                  <button class="btn btn-primary" data-action="start-tool" data-tool-id="${tool.id}">
                    <i class="fas fa-play"></i> ${helpers.escapeHtml(actionLabel)}
                  </button>
                  <span class="drag-handle" title="Ziehen zu Workset">
                    <i class="fas fa-grip-vertical"></i>
                  </span>
                </footer>
              </article>
            `;
          }).join('');

          return `<div class="card-grid">${cards}</div>`;
        };

        const sections = [];

        sections.push(`
          <section class="module-section">
            <header class="section-header">
              <h2><i class="fas fa-layer-group"></i> Worksets</h2>
            </header>
            ${workspaces.length ? `<div class="card-grid">${workspaceCards}</div>` : '<div class="empty-state"><div class="empty-icon"><i class="fas fa-layer-group"></i></div><h3>Keine Worksets</h3><p>Erstellen Sie Worksets, um Tools zu gruppieren.</p></div>'}
          </section>
        `);

        sections.push(`
          <section class="module-section">
            <header class="section-header">
              <h2><i class="fas fa-cogs"></i> Anwendungen</h2>
            </header>
            ${renderToolCards(applications, {
              icon: 'fa-cogs',
              emptyTitle: 'Keine Anwendungen',
              emptyMessage: 'Fügen Sie Anwendungen hinzu, um sie hier anzuzeigen.',
              actionLabel: 'Starten'
            })}
          </section>
        `);

        sections.push(`
          <section class="module-section">
            <header class="section-header">
              <h2><i class="fas fa-network-wired"></i> Netzwerkpfade</h2>
            </header>
            ${renderToolCards(networkPaths, {
              icon: 'fa-network-wired',
              emptyTitle: 'Keine Netzwerkpfade',
              emptyMessage: 'Pflegen Sie Netzwerkpfade im Backend.',
              actionLabel: 'Öffnen'
            })}
          </section>
        `);

        sections.push(`
          <section class="module-section">
            <header class="section-header">
              <h2><i class="fas fa-link"></i> Links</h2>
            </header>
            ${renderToolCards(links, {
              icon: 'fa-link',
              emptyTitle: 'Keine Links',
              emptyMessage: 'Pflegen Sie Links im Backend.',
              actionLabel: 'Öffnen'
            })}
          </section>
        `);

        if (others.length) {
          sections.push(`
            <section class="module-section">
              <header class="section-header">
                <h2><i class="fas fa-toolbox"></i> Weitere Tools</h2>
              </header>
              ${renderToolCards(others, {
                icon: 'fa-toolbox',
                emptyTitle: 'Keine weiteren Tools',
                emptyMessage: 'Alle Tools sind kategorisiert.',
                actionLabel: 'Starten'
              })}
            </section>
          `);
        }

        return sections.join('');
      }
    },

    tickets: {
      icon: 'fa-ticket-alt',
      async render() {
        return helpers.renderEmpty('Tickets', 'Ticket-System wird geladen...', 'fa-ticket-alt');
      }
    },

    contacts: {
      icon: 'fa-address-book',
      async render() {
        return helpers.renderEmpty('Telefonbuch', 'Kontakte werden geladen...', 'fa-address-book');
      }
    },

    network: {
      icon: 'fa-network-wired',
      async render() {
        const [networkSettings, networkDevices, printers] = await Promise.all([
          helpers.fetchJson('/api/network/settings', { cacheKey: 'network-settings', ttl: TTL_SLOW, allowError: true }),
          helpers.fetchJson('/api/network/devices', { cacheKey: 'network-devices', ttl: TTL_FAST, allowError: true }),
          helpers.fetchJson('/api/printers', { cacheKey: 'printers', ttl: TTL_SLOW, allowError: true })
        ]);

        const sections = [];

        if (networkSettings && Array.isArray(networkSettings) && networkSettings.length > 0) {
          sections.push(`
            <section class="module-section">
              <header class="section-header">
                <h2><i class="fas fa-sliders-h"></i> Netzwerkeinstellungen</h2>
              </header>
              <div class="card-grid">
                ${networkSettings.map(setting => `
                  <article class="card">
                    <header class="card-header">
                      <h3>${helpers.escapeHtml(setting.name || 'Einstellung')}</h3>
                    </header>
                    <div class="card-body">
                      <p>${helpers.escapeHtml(setting.value || 'Kein Wert')}</p>
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `);
        }

        if (networkDevices && Array.isArray(networkDevices) && networkDevices.length > 0) {
          sections.push(`
            <section class="module-section">
              <header class="section-header">
                <h2><i class="fas fa-server"></i> Netzwerkgeräte</h2>
              </header>
              <div class="card-grid">
                ${networkDevices.map(device => `
                  <article class="card">
                    <header class="card-header">
                      <h3><i class="fas fa-server"></i> ${helpers.escapeHtml(device.name || 'Gerät')}</h3>
                    </header>
                    <div class="card-body">
                      ${device.ip ? `<p><i class="fas fa-network-wired"></i> ${helpers.escapeHtml(device.ip)}</p>` : ''}
                      ${device.type ? `<p><i class="fas fa-tag"></i> ${helpers.escapeHtml(device.type)}</p>` : ''}
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `);
        }

        if (printers && Array.isArray(printers) && printers.length > 0) {
          sections.push(`
            <section class="module-section">
              <header class="section-header">
                <h2><i class="fas fa-print"></i> Drucker</h2>
              </header>
              <div class="card-grid">
                ${printers.map(printer => `
                  <article class="card">
                    <header class="card-header">
                      <h3><i class="fas fa-print"></i> ${helpers.escapeHtml(printer.name || 'Drucker')}</h3>
                    </header>
                    <div class="card-body">
                      ${printer.ip ? `<p><i class="fas fa-network-wired"></i> ${helpers.escapeHtml(printer.ip)}</p>` : ''}
                      ${printer.location ? `<p><i class="fas fa-map-marker-alt"></i> ${helpers.escapeHtml(printer.location)}</p>` : ''}
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `);
        }

        if (sections.length === 0) {
          return helpers.renderEmpty('Keine Netzwerkdaten verfügbar', 'Es wurden keine Netzwerkressourcen gefunden.', 'fa-network-wired');
        }

        return sections.join('');
      }
    },

    calendar: {
      icon: 'fa-calendar-alt',
      async render() {
        return helpers.renderEmpty('Kalender', 'Kalender-Funktionen werden geladen...', 'fa-calendar-alt');
      }
    },

    faq: {
      icon: 'fa-question-circle',
      async render() {
        return helpers.renderEmpty('FAQ', 'FAQ-System wird geladen...', 'fa-question-circle');
      }
    }
  };

  function setupNavigation() {
    state.navButtons = Array.from(document.querySelectorAll('.nav-tab'));
    state.navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const moduleKey = button.dataset.module;
        if (!moduleKey || moduleKey === state.activeModule) return;
        loadModule(moduleKey);
      });
    });
  }

  function setupDragAndDropEventHandlers() {
    console.log("Setting up drag and drop event handlers");
    
    document.querySelectorAll('.draggable-tool').forEach(tool => {
      tool.addEventListener('dragstart', function(e) {
        const toolId = this.getAttribute('data-tool-id');
        e.dataTransfer.setData('text/plain', toolId);
        e.dataTransfer.effectAllowed = 'copy';
        this.classList.add('dragging');
      });
      
      tool.addEventListener('dragend', function(e) {
        this.classList.remove('dragging');
      });
    });
  }

  function setupWorksetDragAndDrop() {
    console.log("Setting up workset drag and drop event handlers");
    
    document.querySelectorAll('.droppable-workset').forEach(worksetCard => {
      const dropZone = worksetCard.querySelector('.workspace-drop-zone');
      const dropHint = worksetCard.querySelector('.workspace-drop-hint');
      
      if (!dropZone) return;
      
      dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        worksetCard.classList.add('drag-over');
        if (dropHint) dropHint.style.display = 'block';
      });
      
      dropZone.addEventListener('dragleave', function(e) {
        if (!dropZone.contains(e.relatedTarget)) {
          worksetCard.classList.remove('drag-over');
          if (dropHint) dropHint.style.display = 'none';
        }
      });
      
      dropZone.addEventListener('drop', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        worksetCard.classList.remove('drag-over');
        if (dropHint) dropHint.style.display = 'none';
        
        try {
          const draggedToolId = e.dataTransfer.getData('text/plain');
          const worksetId = worksetCard.getAttribute('data-workspace-id');
          
          if (!draggedToolId || !worksetId) {
            console.error('Missing tool ID or workset ID');
            return;
          }
          
          const loader = document.createElement('div');
          loader.className = 'loading-spinner';
          loader.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Füge Tool hinzu...';
          dropZone.appendChild(loader);
          
          const response = await fetch(`/api/worksets/${worksetId}/tools`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tool_id: parseInt(draggedToolId)
            })
          });
          
          loader.remove();
          
          if (response.ok) {
            helpers.notify('Tool erfolgreich zum Workset hinzugefügt!', 'success');
            if (state.activeModule === 'tools') {
              loadModule('tools');
            }
          } else {
            const error = await response.json();
            helpers.notify('Fehler beim Hinzufügen: ' + (error.error || 'Unbekannter Fehler'), 'error');
          }
        } catch (error) {
          console.error('Error adding tool to workset:', error);
          helpers.notify('Fehler beim Hinzufügen des Tools zum Workset', 'error');
          
          const loader = dropZone.querySelector('.loading-spinner');
          if (loader) loader.remove();
        }
      });
    });
  }

  async function loadModule(moduleKey) {
    const module = MODULES[moduleKey];
    if (!module) {
      state.content.innerHTML = helpers.renderEmpty('Modul nicht gefunden', 'Dieses Modul ist nicht verfügbar.', 'fa-exclamation-triangle');
      return;
    }

    state.activeModule = moduleKey;
    updateActiveNavigation();
    toggleOverlay(true);

    try {
      const result = await module.render();
      state.content.innerHTML = result;
      
      if (moduleKey === 'tools') {
        setupDragAndDropEventHandlers();
        setupWorksetDragAndDrop();
      }
    } catch (error) {
      console.error(`Fehler beim Laden des Moduls ${moduleKey}:`, error);
      state.content.innerHTML = `
        <section class="error-state">
          <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <h2>Fehler beim Laden</h2>
          <p>${helpers.escapeHtml(error.message || 'Unbekannter Fehler')}</p>
          <button type="button" class="btn btn-secondary" id="retry-module">Erneut versuchen</button>
        </section>
      `;
      state.content.querySelector('#retry-module')?.addEventListener('click', () => loadModule(moduleKey));
      helpers.notify('Das Modul konnte nicht geladen werden.', 'error');
    } finally {
      toggleOverlay(false);
    }
  }

  function updateActiveNavigation() {
    state.navButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.module === state.activeModule);
    });
  }

  function toggleOverlay(show) {
    if (!state.overlay) return;
    state.overlay.classList.toggle('hidden', !show);
  }

  function updateClock() {
    if (!state.time) return;
    const now = new Date();
    state.time.textContent = new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);
  }

  async function checkBackend() {
    if (!state.status) return;
    try {
      const response = await fetch('/api/system/info', { cache: 'no-store' });
      if (response.ok) {
        state.status.textContent = 'Online';
        state.status.classList.remove('offline');
        state.status.classList.add('online');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      state.status.textContent = 'Offline';
      state.status.classList.remove('online');
      state.status.classList.add('offline');
    }
  }

  function init() {
    state.content = document.getElementById('module-content');
    state.overlay = document.getElementById('loading-overlay');
    state.notification = document.querySelector('.notification-container') || document.body;
    state.status = document.getElementById('connection-status');
    state.time = document.getElementById('current-time');

    if (!state.content) {
      console.error('Module content element not found');
      return;
    }

    setupNavigation();
    loadModule('tools');
    
    setInterval(updateClock, 1000);
    setInterval(checkBackend, 30000);
    
    updateClock();
    checkBackend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();