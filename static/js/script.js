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
    },
    clearCache(cacheKey) {
      if (cacheKey) {
        state.cache.delete(cacheKey);
      } else {
        state.cache.clear();
      }
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

        // Lade Worksets mit Tools separat
        const workspacesWithTools = await helpers.fetchJson('/api/worksets', { cacheKey: 'worksets_with_tools', ttl: TTL_FAST, allowError: true }) || [];
        
        const workspaceCards = workspacesWithTools.map(workspace => {
          const badges = [];
          if (workspace.autostart) badges.push(renderBadge('Autostart'));
          if (workspace.favorite) badges.push(renderBadge('Favorit'));

          // Verwende die bereits geladenen Tools für dieses Workset
          const worksetTools = workspace.tools || [];
          const toolsHtml = worksetTools.length > 0 
            ? worksetTools.map(tool => `
                <div class="workset-tool-item">
                  <i class="fas fa-cog"></i>
                  <span>${helpers.escapeHtml(tool.name || 'Tool')}</span>
                  <button onclick="app.removeToolFromWorkset(${workspace.id}, ${tool.id})" class="remove-tool-btn" title="Entfernen">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join('')
            : `<p class="card-meta no-tools-message">Noch keine Tools zugeordnet.</p>`;

          return `
            <article class="card workspace-card droppable-workset" data-workset-id="${workspace.id}">
              <header class="card-header">
                <h3><i class="fas fa-layer-group"></i> ${helpers.escapeHtml(workspace.name || 'Workspace')}</h3>
                ${badges.join('')}
              </header>
              <div class="card-body workspace-drop-zone">
                <div class="workspace-drop-hint" style="display: none;">
                  <i class="fas fa-plus-circle"></i>
                  <span>Tool hier ablegen</span>
                </div>
                <div class="workset-tools-list">
                  ${toolsHtml}
                </div>
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
      data: [],
      currentTicket: null,
      
      async onMount() {
        console.log('Tickets-Modul geladen - onMount aufgerufen');
        await this.loadTickets();
        console.log('Tickets nach loadTickets:', this.data.length);
      },
      
      async loadTickets() {
        try {
          console.log('Lade Tickets von /api/tickets...');
          const response = await fetch('/api/tickets');
          console.log('Response status:', response.status);
          if (response.ok) {
            this.data = await response.json();
            console.log('Tickets geladen:', this.data);
          } else {
            console.error('Fehler beim Laden der Tickets:', response.status);
          }
        } catch (error) {
          console.error('Fehler beim Laden der Tickets:', error);
        }
      },
      
      async createTicket(ticketData) {
        try {
          const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketData)
          });
          if (response.ok) {
            await this.loadTickets();
            return true;
          }
        } catch (error) {
          console.error('Fehler beim Erstellen des Tickets:', error);
        }
        return false;
      },
      
      async updateTicket(ticketId, ticketData) {
        try {
          const response = await fetch(`/api/tickets/${ticketId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketData)
          });
          if (response.ok) {
            await this.loadTickets();
            return true;
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren des Tickets:', error);
        }
        return false;
      },
      
      showCreateForm() {
        const formHtml = `
          <div class="ticket-form">
            <h3>Neues Ticket erstellen</h3>
            <form id="ticketForm">
              <div class="form-group">
                <label for="ticketPhone">Telefon:</label>
                <input type="text" id="ticketPhone" required>
              </div>
              <div class="form-group">
                <label for="ticketPkz">PKZ:</label>
                <input type="text" id="ticketPkz" required>
              </div>
              <div class="form-group">
                <label for="ticketHeader">Betreff:</label>
                <select id="ticketHeader" required>
                  <option value="">Bitte wählen...</option>
                  <option value="Anwenderunterstützung">Anwenderunterstützung</option>
                  <option value="Benutzerdaten">Benutzerdaten</option>
                  <option value="Hardware-Problem">Hardware-Problem</option>
                  <option value="Software-Problem">Software-Problem</option>
                  <option value="Netzwerk-Problem">Netzwerk-Problem</option>
                  <option value="Sonstiges">Sonstiges</option>
                </select>
              </div>
              <div class="form-group">
                <label for="ticketDescription">Beschreibung:</label>
                <textarea id="ticketDescription" rows="4" required></textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-primary">Ticket erstellen</button>
                <button type="button" onclick="app.switchModule('tickets')" class="btn-secondary">Abbrechen</button>
              </div>
            </form>
          </div>
        `;
        
        return formHtml;
      },
      
      showTicketDetails(ticketId) {
        const ticket = this.data.find(t => t.id === ticketId);
        if (!ticket) return '';
        
        return `
          <div class="ticket-details">
            <div class="ticket-header">
              <h3>Ticket #${ticket.id}</h3>
              <span class="ticket-status status-${(ticket.status || 'offen').toLowerCase().replace(' ', '-')}">${ticket.status || 'Offen'}</span>
            </div>
            <div class="ticket-info">
              <p><strong>Betreff:</strong> ${ticket.headerText || ticket.title || 'Kein Betreff'}</p>
              <p><strong>Telefon:</strong> ${ticket.phone || 'Nicht angegeben'}</p>
              <p><strong>PKZ:</strong> ${ticket.pkz || 'Nicht angegeben'}</p>
              <p><strong>Erstellt:</strong> ${new Date(ticket.created_at).toLocaleString('de-DE')}</p>
              ${ticket.updated ? `<p><strong>Aktualisiert:</strong> ${new Date(ticket.updated).toLocaleString('de-DE')}</p>` : ''}
            </div>
            <div class="ticket-description">
              <h4>Beschreibung:</h4>
              <div class="description-content">${ticket.description || 'Keine Beschreibung'}</div>
            </div>
            <div class="ticket-actions">
              <button onclick="app.showTicketEdit(${ticket.id})" class="btn-primary">Bearbeiten</button>
              <button onclick="app.switchModule('tickets')" class="btn-secondary">Zurück zur Liste</button>
            </div>
          </div>
        `;
      },
      
      async render() {
        if (!this.data || this.data.length === 0) {
          return `
            <div class="tickets-container">
              <div class="tickets-header">
                <h2><i class="fas fa-ticket-alt"></i> Ticket-System</h2>
                <button onclick="app.showTicketCreate()" class="btn-primary">
                  <i class="fas fa-plus"></i> Neues Ticket
                </button>
              </div>
              <div class="empty-state">
                <i class="fas fa-ticket-alt"></i>
                <p>Keine Tickets vorhanden</p>
              </div>
            </div>
          `;
        }
        
        // Zeige das neueste/aktuellste Ticket als Standard
        const sortedTickets = [...this.data].sort((a, b) => (b.id || 0) - (a.id || 0));
        const currentTicket = sortedTickets[0]; // Nehme das neueste Ticket
        
        return this.renderTicketMainView(currentTicket, sortedTickets);
      },
      
      renderTicketMainView(ticket, allTickets) {
        const status = ticket.status || 'Offen';
        const statusClass = status.toLowerCase().replace(' ', '-');
        
        // Erstelle Ticket-Navigation
        const ticketNavigation = allTickets.map(t => `
          <div class="ticket-nav-item ${t.id === ticket.id ? 'active' : ''}" onclick="app.switchToTicket(${t.id})">
            <span class="nav-ticket-id">#${t.id}</span>
            <span class="nav-ticket-status status-${(t.status || 'offen').toLowerCase().replace(' ', '-')}"></span>
          </div>
        `).join('');
        
        return `
          <div class="ticket-main-container">
            <div class="ticket-navigation-bar">
              <div class="ticket-nav-header">
                <h2><i class="fas fa-ticket-alt"></i> Ticket-System</h2>
                <button onclick="app.showTicketCreate()" class="btn-primary">
                  <i class="fas fa-plus"></i> Neues Ticket
                </button>
              </div>
              <div class="ticket-nav-list">
                ${ticketNavigation}
              </div>
            </div>
            
            <div class="ticket-main-view">
              <div class="ticket-view-header">
                <div class="ticket-title-section">
                  <h1 class="ticket-main-title">
                    <i class="fas fa-ticket-alt"></i> Ticket #${ticket.id}
                  </h1>
                  <span class="ticket-main-status status-${statusClass}">
                    <i class="fas fa-circle"></i> ${status}
                  </span>
                </div>
                <div class="ticket-view-actions">
                  <button onclick="app.showTicketEdit(${ticket.id})" class="btn-edit">
                    <i class="fas fa-edit"></i> Bearbeiten
                  </button>
                </div>
                <div class="ticket-timestamp">
                  <i class="fas fa-calendar"></i> ${new Date(ticket.created_at).toLocaleString('de-DE')}
                </div>
              </div>
              
              <div class="ticket-content-layout">
                <div class="ticket-info-section">
                  <div class="info-card-main">
                    <h3><i class="fas fa-info-circle"></i> Ticket-Informationen</h3>
                    <div class="info-grid-main">
                      <div class="info-field">
                        <label>Betreff:</label>
                        <span>${ticket.headerText || ticket.title || 'Kein Betreff'}</span>
                      </div>
                      <div class="info-field">
                        <label>Telefon:</label>
                        <span>${ticket.phone || 'Nicht angegeben'}</span>
                      </div>
                      <div class="info-field">
                        <label>PKZ:</label>
                        <span>${ticket.pkz || 'Nicht angegeben'}</span>
                      </div>
                      <div class="info-field">
                        <label>Erstellt:</label>
                        <span>${new Date(ticket.created_at).toLocaleString('de-DE')}</span>
                      </div>
                      ${ticket.updated ? `
                        <div class="info-field">
                          <label>Aktualisiert:</label>
                          <span>${new Date(ticket.updated).toLocaleString('de-DE')}</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  
                  <div class="description-card-main">
                    <h3><i class="fas fa-file-alt"></i> Beschreibung</h3>
                    <div class="description-content-main">
                      ${ticket.description || 'Keine Beschreibung vorhanden.'}
                    </div>
                  </div>
                </div>
                
                <div class="ticket-sidebar-main">
                  <div class="status-card-main">
                    <h3><i class="fas fa-tasks"></i> Status</h3>
                    <div class="status-indicator">
                      <div class="status-circle-large status-${statusClass}"></div>
                      <span class="status-text-large">${status}</span>
                    </div>
                  </div>
                  
                  <div class="actions-card-main">
                    <h3><i class="fas fa-bolt"></i> Aktionen</h3>
                    <div class="action-list-main">
                      ${ticket.phone ? `
                        <button onclick="app.callContact('${ticket.phone}')" class="action-button-main">
                          <i class="fas fa-phone"></i> Anrufen
                        </button>
                      ` : ''}
                      <button onclick="app.showTicketEdit(${ticket.id})" class="action-button-main">
                        <i class="fas fa-edit"></i> Bearbeiten
                      </button>
                      <button onclick="app.printTicket(${ticket.id})" class="action-button-main">
                        <i class="fas fa-print"></i> Drucken
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    },

    contacts: {
      icon: 'fa-address-book',
      data: [],
      
      async onMount() {
        console.log('Kontakte-Modul geladen');
        await this.loadContacts();
      },
      
      async loadContacts() {
        try {
          const response = await fetch('/api/contacts');
          if (response.ok) {
            this.data = await response.json();
            console.log('Kontakte geladen:', this.data.length);
          } else {
            console.error('Fehler beim Laden der Kontakte:', response.status);
          }
        } catch (error) {
          console.error('Fehler beim Laden der Kontakte:', error);
        }
      },
      
      async render() {
        if (!this.data || this.data.length === 0) {
          return `
            <div class="contacts-container">
              <div class="contacts-header">
                <h2><i class="fas fa-address-book"></i> Telefonbuch</h2>
                <button onclick="app.showContactCreate()" class="btn-primary">
                  <i class="fas fa-plus"></i> Neuer Kontakt
                </button>
              </div>
              <div class="empty-state">
                <i class="fas fa-address-book"></i>
                <p>Keine Kontakte vorhanden</p>
              </div>
            </div>
          `;
        }
        
        // Sortiere Kontakte nach Namen
        const sortedContacts = [...this.data].sort((a, b) => {
          const nameA = (a.name || a.firstName + ' ' + a.lastName || '').toLowerCase();
          const nameB = (b.name || b.firstName + ' ' + b.lastName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        const contactsHtml = sortedContacts.map(contact => {
          const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unbekannt';
          const department = contact.department || contact.abteilung || '';
          const position = contact.position || contact.rolle || '';
          
          return `
            <div class="contact-card draggable-contact" 
                 data-contact-id="${contact.id}" 
                 draggable="true"
                 onclick="app.showContactDetails(${contact.id})">
              <div class="contact-avatar">
                <i class="fas fa-user"></i>
              </div>
              <div class="contact-info">
                <h4 class="contact-name">${helpers.escapeHtml(displayName)}</h4>
                ${department ? `<p class="contact-department">${helpers.escapeHtml(department)}</p>` : ''}
                ${position ? `<p class="contact-position">${helpers.escapeHtml(position)}</p>` : ''}
                <div class="contact-details">
                  ${contact.phone ? `<span class="contact-phone"><i class="fas fa-phone"></i> ${helpers.escapeHtml(contact.phone)}</span>` : ''}
                  ${contact.email ? `<span class="contact-email"><i class="fas fa-envelope"></i> ${helpers.escapeHtml(contact.email)}</span>` : ''}
                  ${contact.extension ? `<span class="contact-extension"><i class="fas fa-phone-square"></i> ${helpers.escapeHtml(contact.extension)}</span>` : ''}
                </div>
              </div>
              <div class="contact-actions">
                ${contact.phone ? `<button onclick="event.stopPropagation(); app.callContact('${contact.phone}')" class="btn-action" title="Anrufen"><i class="fas fa-phone"></i></button>` : ''}
                ${contact.email ? `<button onclick="event.stopPropagation(); app.emailContact('${contact.email}')" class="btn-action" title="E-Mail"><i class="fas fa-envelope"></i></button>` : ''}
                <button onclick="event.stopPropagation(); app.showContactEdit(${contact.id})" class="btn-action" title="Bearbeiten"><i class="fas fa-edit"></i></button>
              </div>
            </div>
          `;
        }).join('');
        
        return `
          <div class="contacts-layout">
            <div class="contacts-sidebar">
              <div class="contacts-header">
                <h2><i class="fas fa-address-book"></i> Telefonbuch</h2>
                <button onclick="app.showContactCreate()" class="btn-primary">
                  <i class="fas fa-plus"></i> Neuer Kontakt
                </button>
              </div>
              <div class="contacts-search">
                <input type="text" id="contactSearch" placeholder="Kontakte suchen..." onkeyup="app.filterContacts(this.value)">
                <i class="fas fa-search"></i>
              </div>
              <div class="contacts-list" id="contactsList">
                ${contactsHtml}
              </div>
            </div>
            <div class="calendar-sidebar">
              <div class="calendar-header">
                <h3><i class="fas fa-calendar-alt"></i> Kalender</h3>
                <div class="calendar-nav">
                  <button onclick="app.previousMonth()" class="btn-nav"><i class="fas fa-chevron-left"></i></button>
                  <span id="currentMonth">${this.getCurrentMonthYear()}</span>
                  <button onclick="app.nextMonth()" class="btn-nav"><i class="fas fa-chevron-right"></i></button>
                </div>
              </div>
              <div class="calendar-container" id="calendarContainer">
                ${this.renderCalendar()}
              </div>
              <div class="calendar-events" id="calendarEvents">
                <h4>Termine heute</h4>
                <div class="today-events">
                  <p class="no-events">Keine Termine</p>
                </div>
              </div>
            </div>
          </div>
        `;
      },
      
      getCurrentMonthYear() {
        const now = new Date();
        return new Intl.DateTimeFormat('de-DE', { 
          month: 'long', 
          year: 'numeric' 
        }).format(now);
      },
      
      renderCalendar() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay() + 1); // Montag als Wochenstart
        
        const weeks = [];
        let currentWeek = [];
        let currentDate = new Date(startDate);
        
        for (let i = 0; i < 42; i++) { // 6 Wochen à 7 Tage
          const isCurrentMonth = currentDate.getMonth() === month;
          const isToday = isCurrentMonth && currentDate.getDate() === today;
          const dateStr = currentDate.toISOString().split('T')[0];
          
          currentWeek.push({
            date: currentDate.getDate(),
            isCurrentMonth,
            isToday,
            dateStr,
            fullDate: new Date(currentDate)
          });
          
          if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        const weekdayHeaders = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
        
        return `
          <div class="calendar-grid">
            <div class="calendar-weekdays">
              ${weekdayHeaders.map(day => `<div class="weekday-header">${day}</div>`).join('')}
            </div>
            <div class="calendar-days">
              ${weeks.map(week => 
                week.map(day => `
                  <div class="calendar-day ${day.isCurrentMonth ? 'current-month' : 'other-month'} ${day.isToday ? 'today' : ''} droppable-date" 
                       data-date="${day.dateStr}"
                       onclick="app.selectCalendarDate('${day.dateStr}')">
                    <span class="day-number">${day.date}</span>
                    <div class="day-events"></div>
                  </div>
                `).join('')
              ).join('')}
            </div>
          </div>
        `;
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

        // Netzwerk-Tools Sektion
        sections.push(`
          <section class="module-section">
            <header class="section-header">
              <h2><i class="fas fa-tools"></i> Netzwerk-Tools</h2>
            </header>
            <div class="network-tools">
              <div class="tool-group">
                <h3><i class="fas fa-search"></i> Diagnostik</h3>
                <div class="tool-buttons">
                  <button class="btn btn-primary" onclick="app.showPingTool()">
                    <i class="fas fa-satellite-dish"></i> Ping Test
                  </button>
                  <button class="btn btn-primary" onclick="app.showTracerouteTool()">
                    <i class="fas fa-route"></i> Traceroute
                  </button>
                  <button class="btn btn-primary" onclick="app.showPortScanTool()">
                    <i class="fas fa-search"></i> Port Scanner
                  </button>
                </div>
              </div>
              
              <div class="tool-group">
                <h3><i class="fas fa-globe"></i> Remote Access</h3>
                <div class="tool-buttons">
                  <button class="btn btn-secondary" onclick="app.showRemoteBrowser()">
                    <i class="fas fa-desktop"></i> Remote Browser
                  </button>
                  <button class="btn btn-secondary" onclick="app.showRDPConnections()">
                    <i class="fas fa-desktop"></i> RDP Verbindungen
                  </button>
                  <button class="btn btn-secondary" onclick="app.showSSHConnections()">
                    <i class="fas fa-terminal"></i> SSH Verbindungen
                  </button>
                </div>
              </div>
              
              <div class="tool-group">
                <h3><i class="fas fa-info-circle"></i> Informationen</h3>
                <div class="tool-buttons">
                  <button class="btn btn-info" onclick="app.showNetworkInfo()">
                    <i class="fas fa-info-circle"></i> Netzwerk Info
                  </button>
                  <button class="btn btn-info" onclick="app.showWiFiNetworks()">
                    <i class="fas fa-wifi"></i> WiFi Scanner
                  </button>
                  <button class="btn btn-info" onclick="app.showIPCalculator()">
                    <i class="fas fa-calculator"></i> IP Rechner
                  </button>
                </div>
              </div>
            </div>
          </section>
        `);

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
                  <article class="card network-device-card">
                    <header class="card-header">
                      <h3><i class="fas fa-server"></i> ${helpers.escapeHtml(device.name || 'Gerät')}</h3>
                    </header>
                    <div class="card-body">
                      ${device.ip ? `<p><i class="fas fa-network-wired"></i> ${helpers.escapeHtml(device.ip)}</p>` : ''}
                      ${device.type ? `<p><i class="fas fa-tag"></i> ${helpers.escapeHtml(device.type)}</p>` : ''}
                      ${device.status ? `<p class="device-status status-${device.status}"><i class="fas fa-circle"></i> ${helpers.escapeHtml(device.status)}</p>` : ''}
                    </div>
                    <div class="card-footer">
                      ${device.ip ? `
                        <button class="btn btn-sm btn-primary" onclick="app.pingDevice('${device.ip}')">
                          <i class="fas fa-satellite-dish"></i> Ping
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="app.openRemoteBrowser('${device.ip}')">
                          <i class="fas fa-globe"></i> Browser
                        </button>
                      ` : ''}
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
                  <article class="card printer-card">
                    <header class="card-header">
                      <h3><i class="fas fa-print"></i> ${helpers.escapeHtml(printer.name || 'Drucker')}</h3>
                    </header>
                    <div class="card-body">
                      ${printer.ip ? `<p><i class="fas fa-network-wired"></i> ${helpers.escapeHtml(printer.ip)}</p>` : ''}
                      ${printer.location ? `<p><i class="fas fa-map-marker-alt"></i> ${helpers.escapeHtml(printer.location)}</p>` : ''}
                      ${printer.model ? `<p><i class="fas fa-print"></i> ${helpers.escapeHtml(printer.model)}</p>` : ''}
                    </div>
                    <div class="card-footer">
                      ${printer.ip ? `
                        <button class="btn btn-sm btn-primary" onclick="app.pingDevice('${printer.ip}')">
                          <i class="fas fa-satellite-dish"></i> Ping
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="app.openPrinterInterface('${printer.ip}')">
                          <i class="fas fa-cog"></i> Interface
                        </button>
                      ` : ''}
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `);
        }

        if (sections.length === 1) {
          return helpers.renderEmpty('Keine Netzwerkdaten verfügbar', 'Es wurden keine Netzwerkressourcen gefunden. Nutzen Sie die Tools oben.', 'fa-network-wired');
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

  function setupContactDragAndDrop() {
    console.log("Setting up contact drag and drop event handlers");
    
    document.querySelectorAll('.draggable-contact').forEach(contact => {
      contact.addEventListener('dragstart', function(e) {
        const contactId = this.getAttribute('data-contact-id');
        e.dataTransfer.setData('text/plain', contactId);
        e.dataTransfer.effectAllowed = 'copy';
        this.classList.add('dragging');
      });
      
      contact.addEventListener('dragend', function(e) {
        this.classList.remove('dragging');
      });
    });
  }

  function setupCalendarDropZone() {
    console.log("Setting up calendar drop zones");
    
    document.querySelectorAll('.droppable-date').forEach(dateCell => {
      dateCell.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.classList.add('drag-over');
      });
      
      dateCell.addEventListener('dragleave', function(e) {
        if (!this.contains(e.relatedTarget)) {
          this.classList.remove('drag-over');
        }
      });
      
      dateCell.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        this.classList.remove('drag-over');
        
        const contactId = e.dataTransfer.getData('text/plain');
        const date = this.getAttribute('data-date');
        
        if (contactId && date) {
          const contact = MODULES.contacts.data.find(c => c.id == contactId);
          if (contact) {
            const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
            const formattedDate = new Date(date).toLocaleDateString('de-DE');
            
            helpers.notify(`Termin mit ${displayName} für ${formattedDate} erstellt!`, 'success');
            
            // Visuelles Feedback auf dem Kalender
            const eventDot = document.createElement('div');
            eventDot.className = 'event-dot';
            eventDot.title = `Termin mit ${displayName}`;
            this.querySelector('.day-events').appendChild(eventDot);
          }
        }
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
          const worksetId = worksetCard.getAttribute('data-workset-id');
          
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
            // Aktualisiere immer das Tools-Modul (dort werden die Worksets angezeigt)
            await loadModule('tools');
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
      // onMount aufrufen falls vorhanden
      if (module.onMount && typeof module.onMount === 'function') {
        await module.onMount();
      }
      
      const result = await module.render();
      state.content.innerHTML = result;
      
      if (moduleKey === 'tools') {
        setupDragAndDropEventHandlers();
        setupWorksetDragAndDrop();
      } else if (moduleKey === 'contacts') {
        setupContactDragAndDrop();
        setupCalendarDropZone();
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

  // Globale Ticket-Funktionen für onclick-Handler
  window.app = {
    switchModule: function(moduleKey) {
      loadModule(moduleKey);
    },

    async loadWorksetTools(worksetId) {
      try {
        const response = await fetch(`/api/worksets/${worksetId}/tools`);
        if (response.ok) {
          const tools = await response.json();
          return tools;
        } else {
          console.error('Failed to load workset tools:', response.status);
          return [];
        }
      } catch (error) {
        console.error('Error loading workset tools:', error);
        return [];
      }
    },

    async removeToolFromWorkset(worksetId, toolId) {
      try {
        const response = await fetch(`/api/worksets/${worksetId}/tools/${toolId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          console.log('Tool successfully removed from workset');
          // Workspaces neu laden
          await loadModule('workspaces');
        } else {
          console.error('Failed to remove tool from workset:', response.status);
          const errorData = await response.json();
          app.showNotification(errorData.error || 'Fehler beim Entfernen des Tools', 'error');
        }
      } catch (error) {
        console.error('Error removing tool from workset:', error);
        app.showNotification('Netzwerkfehler beim Entfernen des Tools', 'error');
      }
    },

    async loadAndRenderWorkspaces() {
      try {
        // Cache für Worksets löschen, damit neue Daten geladen werden
        helpers.clearCache('worksets_with_tools');
        helpers.clearCache('tools');
        
        // Tools-Modul neu rendern (dort werden die Workspaces angezeigt)
        await loadModule('tools');
      } catch (error) {
        console.error('Error loading and rendering workspaces:', error);
      }
    },
    
    showTicketCreate: function() {
      // Schließe eventuell offenes Modal
      app.closeTicketModal();
      
      const modalHtml = `
        <div class="ticket-modal-overlay">
          <div class="ticket-modal create-modal">
            <div class="ticket-modal-header">
              <h3><i class="fas fa-plus"></i> Neues Ticket erstellen</h3>
              <button onclick="app.closeTicketModal()" class="btn-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="ticket-modal-body">
              <form id="ticketForm">
                <div class="form-row">
                  <div class="form-group">
                    <label for="ticketPhone">Telefon:</label>
                    <input type="text" id="ticketPhone" required>
                  </div>
                  <div class="form-group">
                    <label for="ticketPkz">PKZ:</label>
                    <input type="text" id="ticketPkz" required>
                  </div>
                </div>
                <div class="form-group">
                  <label for="ticketHeader">Betreff:</label>
                  <select id="ticketHeader" required>
                    <option value="">Bitte wählen...</option>
                    <option value="Anwenderunterstützung">Anwenderunterstützung</option>
                    <option value="Benutzerdaten">Benutzerdaten</option>
                    <option value="Hardware-Problem">Hardware-Problem</option>
                    <option value="Software-Problem">Software-Problem</option>
                    <option value="Netzwerk-Problem">Netzwerk-Problem</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="ticketDescription">Beschreibung:</label>
                  <textarea id="ticketDescription" rows="4" required></textarea>
                </div>
              </form>
            </div>
            <div class="ticket-modal-footer">
              <button onclick="app.submitTicketForm()" class="btn-primary">
                <i class="fas fa-save"></i> Ticket erstellen
              </button>
              <button onclick="app.closeTicketModal()" class="btn-secondary">
                <i class="fas fa-times"></i> Abbrechen
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // Focus auf erstes Eingabefeld
      setTimeout(() => {
        const phoneInput = document.getElementById('ticketPhone');
        if (phoneInput) phoneInput.focus();
      }, 100);
      
      // ESC-Taste zum Schließen
      document.addEventListener('keydown', app.handleTicketModalKeydown);
    },
    
    showTicketDetails: function(ticketId) {
      // Schließe eventuell bereits offenes Ticket-Fenster
      app.closeTicketModal();
      
      const ticket = MODULES.tickets.data.find(t => t.id === ticketId);
      if (!ticket) return;
      
      const modalHtml = `
        <div class="ticket-modal-overlay">
          <div class="ticket-modal">
            <div class="ticket-modal-header">
              <h3><i class="fas fa-ticket-alt"></i> Ticket #${ticket.id}</h3>
              <span class="ticket-status status-${(ticket.status || 'offen').toLowerCase().replace(' ', '-')}">${ticket.status || 'Offen'}</span>
              <button onclick="app.closeTicketModal()" class="btn-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="ticket-modal-body">
              <div class="ticket-info-grid">
                <div class="info-section">
                  <h4><i class="fas fa-info-circle"></i> Details</h4>
                  <div class="info-item">
                    <span class="label">Betreff:</span>
                    <span class="value">${ticket.headerText || ticket.title || 'Kein Betreff'}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">Telefon:</span>
                    <span class="value">${ticket.phone || 'Nicht angegeben'}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">PKZ:</span>
                    <span class="value">${ticket.pkz || 'Nicht angegeben'}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">Erstellt:</span>
                    <span class="value">${new Date(ticket.created_at).toLocaleString('de-DE')}</span>
                  </div>
                  ${ticket.updated ? `
                    <div class="info-item">
                      <span class="label">Aktualisiert:</span>
                      <span class="value">${new Date(ticket.updated).toLocaleString('de-DE')}</span>
                    </div>
                  ` : ''}
                </div>
                <div class="description-section">
                  <h4><i class="fas fa-file-alt"></i> Beschreibung</h4>
                  <div class="description-content">${ticket.description || 'Keine Beschreibung'}</div>
                </div>
              </div>
            </div>
            <div class="ticket-modal-footer">
              <button onclick="app.showTicketEdit(${ticket.id})" class="btn-primary">
                <i class="fas fa-edit"></i> Bearbeiten
              </button>
              <button onclick="app.closeTicketModal()" class="btn-secondary">
                <i class="fas fa-times"></i> Schließen
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // ESC-Taste zum Schließen
      document.addEventListener('keydown', app.handleTicketModalKeydown);
    },
    
    showTicketEdit: function(ticketId) {
      const ticket = MODULES.tickets.data.find(t => t.id === ticketId);
      if (!ticket) return;
      
      // Schließe aktuelles Modal und öffne Edit-Modal
      app.closeTicketModal();
      
      const modalHtml = `
        <div class="ticket-modal-overlay">
          <div class="ticket-modal edit-modal">
            <div class="ticket-modal-header">
              <h3><i class="fas fa-edit"></i> Ticket #${ticket.id} bearbeiten</h3>
              <button onclick="app.closeTicketModal()" class="btn-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="ticket-modal-body">
              <form id="editTicketForm">
                <div class="form-row">
                  <div class="form-group">
                    <label for="editTicketStatus">Status:</label>
                    <select id="editTicketStatus">
                      <option value="Offen" ${(ticket.status || 'Offen') === 'Offen' ? 'selected' : ''}>Offen</option>
                      <option value="In Bearbeitung" ${ticket.status === 'In Bearbeitung' ? 'selected' : ''}>In Bearbeitung</option>
                      <option value="Gelöst" ${ticket.status === 'Gelöst' ? 'selected' : ''}>Gelöst</option>
                      <option value="Geschlossen" ${ticket.status === 'Geschlossen' ? 'selected' : ''}>Geschlossen</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="editTicketPhone">Telefon:</label>
                    <input type="text" id="editTicketPhone" value="${ticket.phone || ''}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="editTicketPkz">PKZ:</label>
                    <input type="text" id="editTicketPkz" value="${ticket.pkz || ''}">
                  </div>
                  <div class="form-group">
                    <label for="editTicketHeader">Betreff:</label>
                    <input type="text" id="editTicketHeader" value="${ticket.headerText || ticket.title || ''}">
                  </div>
                </div>
                <div class="form-group">
                  <label for="editTicketDescription">Beschreibung:</label>
                  <textarea id="editTicketDescription" rows="4">${ticket.description || ''}</textarea>
                </div>
              </form>
            </div>
            <div class="ticket-modal-footer">
              <button onclick="app.submitTicketEdit(${ticketId})" class="btn-primary">
                <i class="fas fa-save"></i> Speichern
              </button>
              <button onclick="app.showTicketDetails(${ticketId})" class="btn-secondary">
                <i class="fas fa-arrow-left"></i> Zurück zu Details
              </button>
              <button onclick="app.closeTicketModal()" class="btn-secondary">
                <i class="fas fa-times"></i> Schließen
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // ESC-Taste zum Schließen
      document.addEventListener('keydown', app.handleTicketModalKeydown);
    },

    // Modal-Management-Funktionen
    closeTicketModal: function() {
      const existingModal = document.querySelector('.ticket-modal-overlay');
      if (existingModal) {
        existingModal.remove();
        document.removeEventListener('keydown', app.handleTicketModalKeydown);
      }
    },

    handleTicketModalKeydown: function(e) {
      if (e.key === 'Escape') {
        app.closeTicketModal();
      }
    },

    submitTicketForm: async function() {
      const form = document.getElementById('ticketForm');
      if (!form) return;
      
      const ticketData = {
        phone: document.getElementById('ticketPhone').value,
        pkz: document.getElementById('ticketPkz').value,
        headerText: document.getElementById('ticketHeader').value,
        description: document.getElementById('ticketDescription').value
      };
      
      // Validierung
      if (!ticketData.phone || !ticketData.pkz || !ticketData.headerText || !ticketData.description) {
        helpers.notify('Bitte füllen Sie alle Pflichtfelder aus.', 'error');
        return;
      }
      
      const success = await MODULES.tickets.createTicket(ticketData);
      if (success) {
        app.closeTicketModal();
        loadModule('tickets');
        helpers.notify('Ticket erfolgreich erstellt!', 'success');
      } else {
        helpers.notify('Fehler beim Erstellen des Tickets', 'error');
      }
    },

    submitTicketEdit: async function(ticketId) {
      const updatedData = {
        status: document.getElementById('editTicketStatus').value,
        phone: document.getElementById('editTicketPhone').value,
        pkz: document.getElementById('editTicketPkz').value,
        headerText: document.getElementById('editTicketHeader').value,
        description: document.getElementById('editTicketDescription').value
      };
      
      const success = await MODULES.tickets.updateTicket(ticketId, updatedData);
      if (success) {
        helpers.notify('Ticket erfolgreich aktualisiert!', 'success');
        app.showTicketDetails(ticketId); // Zurück zur Detailansicht
      } else {
        helpers.notify('Fehler beim Aktualisieren des Tickets', 'error');
      }
    },

    // Inline Ticket-Ansicht (Standard beim Klick auf Ticket)
    showTicketInline: function(ticketId) {
      const ticket = MODULES.tickets.data.find(t => t.id === ticketId);
      if (!ticket) return;
      
      const inlineHtml = `
        <div class="ticket-inline-view">
          <div class="ticket-inline-header">
            <button onclick="app.switchModule('tickets')" class="btn-back">
              <i class="fas fa-arrow-left"></i> Zurück zur Liste
            </button>
            <h2><i class="fas fa-ticket-alt"></i> Ticket #${ticket.id}</h2>
            <div class="ticket-actions-header">
              <button onclick="app.showTicketEdit(${ticket.id})" class="btn-primary">
                <i class="fas fa-edit"></i> Bearbeiten
              </button>
            </div>
          </div>
          
          <div class="ticket-inline-content">
            <div class="ticket-status-bar">
              <span class="ticket-status status-${(ticket.status || 'offen').toLowerCase().replace(' ', '-')}">
                <i class="fas fa-circle"></i> ${ticket.status || 'Offen'}
              </span>
              <span class="ticket-date">
                <i class="fas fa-calendar"></i> ${new Date(ticket.created_at).toLocaleString('de-DE')}
              </span>
            </div>
            
            <div class="ticket-details-grid">
              <div class="ticket-main-info">
                <div class="info-card">
                  <h3><i class="fas fa-info-circle"></i> Ticket-Informationen</h3>
                  <div class="info-list">
                    <div class="info-row">
                      <span class="label">Betreff:</span>
                      <span class="value">${ticket.headerText || ticket.title || 'Kein Betreff'}</span>
                    </div>
                    <div class="info-row">
                      <span class="label">Telefon:</span>
                      <span class="value">${ticket.phone || 'Nicht angegeben'}</span>
                    </div>
                    <div class="info-row">
                      <span class="label">PKZ:</span>
                      <span class="value">${ticket.pkz || 'Nicht angegeben'}</span>
                    </div>
                    <div class="info-row">
                      <span class="label">Erstellt:</span>
                      <span class="value">${new Date(ticket.created_at).toLocaleString('de-DE')}</span>
                    </div>
                    ${ticket.updated ? `
                      <div class="info-row">
                        <span class="label">Aktualisiert:</span>
                        <span class="value">${new Date(ticket.updated).toLocaleString('de-DE')}</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
                
                <div class="description-card">
                  <h3><i class="fas fa-file-alt"></i> Beschreibung</h3>
                  <div class="description-text">
                    ${ticket.description || 'Keine Beschreibung vorhanden.'}
                  </div>
                </div>
              </div>
              
              <div class="ticket-sidebar">
                <div class="status-card">
                  <h3><i class="fas fa-tasks"></i> Status</h3>
                  <div class="status-display">
                    <div class="status-circle status-${(ticket.status || 'offen').toLowerCase().replace(' ', '-')}"></div>
                    <span class="status-text">${ticket.status || 'Offen'}</span>
                  </div>
                </div>
                
                <div class="quick-actions">
                  <h3><i class="fas fa-bolt"></i> Aktionen</h3>
                  <div class="action-buttons">
                    ${ticket.phone ? `
                      <button onclick="app.callContact('${ticket.phone}')" class="action-btn">
                        <i class="fas fa-phone"></i> Anrufen
                      </button>
                    ` : ''}
                    <button onclick="app.showTicketEdit(${ticket.id})" class="action-btn">
                      <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button onclick="app.printTicket(${ticket.id})" class="action-btn">
                      <i class="fas fa-print"></i> Drucken
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      state.content.innerHTML = inlineHtml;
    },

    printTicket: function(ticketId) {
      helpers.notify('Druckfunktion in Entwicklung', 'info');
    },

    switchToTicket: function(ticketId) {
      const ticket = MODULES.tickets.data.find(t => t.id === ticketId);
      if (!ticket) return;
      
      const allTickets = [...MODULES.tickets.data].sort((a, b) => (b.id || 0) - (a.id || 0));
      const newView = MODULES.tickets.renderTicketMainView(ticket, allTickets);
      state.content.innerHTML = newView;
    },

    // Netzwerk-Tool-Funktionen
    showPingTool: function() {
      const toolHtml = `
        <div class="network-tool-container">
          <h3><i class="fas fa-satellite-dish"></i> Ping Test</h3>
          <form id="pingForm">
            <div class="form-group">
              <label for="pingTarget">Ziel (IP oder Hostname):</label>
              <input type="text" id="pingTarget" placeholder="z.B. 192.168.1.1 oder google.com" required>
            </div>
            <div class="form-group">
              <label for="pingCount">Anzahl Pings:</label>
              <select id="pingCount">
                <option value="4">4</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary">Ping starten</button>
              <button type="button" onclick="app.switchModule('network')" class="btn-secondary">Zurück</button>
            </div>
          </form>
          <div id="pingResults" class="tool-results"></div>
        </div>
      `;
      
      state.content.innerHTML = toolHtml;
      
      document.getElementById('pingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = document.getElementById('pingTarget').value;
        const count = document.getElementById('pingCount').value;
        const resultsDiv = document.getElementById('pingResults');
        
        resultsDiv.innerHTML = '<div class="loading"><i class="fas fa-sync fa-spin"></i> Ping läuft...</div>';
        
        try {
          const response = await fetch('/api/network/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, count: parseInt(count) })
          });
          
          if (response.ok) {
            const result = await response.json();
            resultsDiv.innerHTML = `
              <div class="ping-results">
                <h4>Ping Ergebnisse für ${target}:</h4>
                <pre class="command-output">${result.output || 'Keine Ausgabe'}</pre>
              </div>
            `;
          } else {
            resultsDiv.innerHTML = '<div class="error">Fehler beim Ping-Test</div>';
          }
        } catch (error) {
          resultsDiv.innerHTML = '<div class="error">Netzwerkfehler beim Ping-Test</div>';
        }
      });
    },

    showRemoteBrowser: function() {
      const toolHtml = `
        <div class="network-tool-container">
          <h3><i class="fas fa-desktop"></i> Remote Browser</h3>
          <form id="remoteBrowserForm">
            <div class="form-group">
              <label for="remoteUrl">URL oder IP-Adresse:</label>
              <input type="text" id="remoteUrl" placeholder="z.B. http://192.168.1.1 oder https://example.com" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary">Browser öffnen</button>
              <button type="button" onclick="app.switchModule('network')" class="btn-secondary">Zurück</button>
            </div>
          </form>
          <div class="quick-links">
            <h4>Schnellzugriff:</h4>
            <div class="quick-link-buttons">
              <button onclick="app.openRemoteUrl('http://192.168.1.1')" class="btn btn-sm">Router (192.168.1.1)</button>
              <button onclick="app.openRemoteUrl('http://192.168.0.1')" class="btn btn-sm">Router (192.168.0.1)</button>
              <button onclick="app.openRemoteUrl('http://10.0.0.1')" class="btn btn-sm">Router (10.0.0.1)</button>
            </div>
          </div>
          <div id="remoteBrowserFrame" class="remote-browser-frame"></div>
        </div>
      `;
      
      state.content.innerHTML = toolHtml;
      
      document.getElementById('remoteBrowserForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('remoteUrl').value;
        app.openRemoteUrl(url);
      });
    },

    openRemoteUrl: function(url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      
      const frameDiv = document.getElementById('remoteBrowserFrame');
      if (frameDiv) {
        frameDiv.innerHTML = `
          <div class="iframe-container">
            <div class="iframe-header">
              <span class="iframe-url">${url}</span>
              <button onclick="window.open('${url}', '_blank')" class="btn btn-sm">
                <i class="fas fa-external-link-alt"></i> Neues Fenster
              </button>
            </div>
            <iframe src="${url}" class="remote-iframe" sandbox="allow-same-origin allow-scripts allow-forms"></iframe>
          </div>
        `;
      } else {
        window.open(url, '_blank');
      }
    },

    pingDevice: function(ip) {
      const resultsHtml = `
        <div class="ping-overlay">
          <div class="ping-dialog">
            <h4>Ping Test für ${ip}</h4>
            <div class="ping-progress">
              <div class="loading"><i class="fas fa-sync fa-spin"></i> Ping läuft...</div>
            </div>
            <button onclick="document.querySelector('.ping-overlay').remove()" class="btn btn-sm">Schließen</button>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', resultsHtml);
      
      // Simulation eines Ping-Tests
      setTimeout(() => {
        const progressDiv = document.querySelector('.ping-progress');
        if (progressDiv) {
          progressDiv.innerHTML = `
            <div class="ping-result success">
              <i class="fas fa-check-circle"></i> ${ip} ist erreichbar
              <br><small>Antwortzeit: ~25ms</small>
            </div>
          `;
        }
      }, 2000);
    },

    openRemoteBrowser: function(ip) {
      app.openRemoteUrl(`http://${ip}`);
    },

    openPrinterInterface: function(ip) {
      app.openRemoteUrl(`http://${ip}`);
    },

    showTracerouteTool: function() {
      helpers.notify('Traceroute-Tool in Entwicklung', 'info');
    },

    showPortScanTool: function() {
      helpers.notify('Port-Scanner in Entwicklung', 'info');
    },

    showRDPConnections: function() {
      helpers.notify('RDP-Verbindungen in Entwicklung', 'info');
    },

    showSSHConnections: function() {
      helpers.notify('SSH-Verbindungen in Entwicklung', 'info');
    },

    showNetworkInfo: function() {
      helpers.notify('Netzwerk-Info in Entwicklung', 'info');
    },

    showWiFiNetworks: function() {
      helpers.notify('WiFi-Scanner in Entwicklung', 'info');
    },

    showIPCalculator: function() {
      helpers.notify('IP-Rechner in Entwicklung', 'info');
    },

    // Kontakt-Funktionen
    showContactCreate: function() {
      const formHtml = `
        <div class="contact-form-overlay">
          <div class="contact-form">
            <h3>Neuen Kontakt erstellen</h3>
            <form id="contactForm">
              <div class="form-row">
                <div class="form-group">
                  <label for="firstName">Vorname:</label>
                  <input type="text" id="firstName" required>
                </div>
                <div class="form-group">
                  <label for="lastName">Nachname:</label>
                  <input type="text" id="lastName" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="department">Abteilung:</label>
                  <input type="text" id="department">
                </div>
                <div class="form-group">
                  <label for="position">Position:</label>
                  <input type="text" id="position">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="phone">Telefon:</label>
                  <input type="tel" id="phone">
                </div>
                <div class="form-group">
                  <label for="extension">Durchwahl:</label>
                  <input type="text" id="extension">
                </div>
              </div>
              <div class="form-group">
                <label for="email">E-Mail:</label>
                <input type="email" id="email">
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-primary">Kontakt erstellen</button>
                <button type="button" onclick="app.closeContactForm()" class="btn-secondary">Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', formHtml);
      
      document.getElementById('contactForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const contactData = {
          firstName: document.getElementById('firstName').value,
          lastName: document.getElementById('lastName').value,
          department: document.getElementById('department').value,
          position: document.getElementById('position').value,
          phone: document.getElementById('phone').value,
          extension: document.getElementById('extension').value,
          email: document.getElementById('email').value
        };
        
        // Simuliere API-Aufruf
        helpers.notify('Kontakt erstellt!', 'success');
        app.closeContactForm();
        loadModule('contacts');
      });
    },

    closeContactForm: function() {
      const overlay = document.querySelector('.contact-form-overlay');
      if (overlay) overlay.remove();
    },

    showContactDetails: function(contactId) {
      const contact = MODULES.contacts.data.find(c => c.id === contactId);
      if (!contact) return;
      
      const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      
      const detailsHtml = `
        <div class="contact-details-overlay">
          <div class="contact-details-card">
            <div class="contact-details-header">
              <div class="contact-avatar-large">
                <i class="fas fa-user"></i>
              </div>
              <div>
                <h3>${helpers.escapeHtml(displayName)}</h3>
                ${contact.department ? `<p class="contact-department">${helpers.escapeHtml(contact.department)}</p>` : ''}
                ${contact.position ? `<p class="contact-position">${helpers.escapeHtml(contact.position)}</p>` : ''}
              </div>
              <button onclick="app.closeContactDetails()" class="btn-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="contact-details-body">
              <div class="contact-info-grid">
                ${contact.phone ? `
                  <div class="info-item">
                    <i class="fas fa-phone"></i>
                    <span>Telefon</span>
                    <strong>${helpers.escapeHtml(contact.phone)}</strong>
                    <button onclick="app.callContact('${contact.phone}')" class="btn-sm">Anrufen</button>
                  </div>
                ` : ''}
                ${contact.extension ? `
                  <div class="info-item">
                    <i class="fas fa-phone-square"></i>
                    <span>Durchwahl</span>
                    <strong>${helpers.escapeHtml(contact.extension)}</strong>
                  </div>
                ` : ''}
                ${contact.email ? `
                  <div class="info-item">
                    <i class="fas fa-envelope"></i>
                    <span>E-Mail</span>
                    <strong>${helpers.escapeHtml(contact.email)}</strong>
                    <button onclick="app.emailContact('${contact.email}')" class="btn-sm">E-Mail</button>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="contact-details-footer">
              <button onclick="app.showContactEdit(${contact.id})" class="btn-primary">Bearbeiten</button>
              <button onclick="app.scheduleAppointment(${contact.id})" class="btn-secondary">Termin planen</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', detailsHtml);
    },

    closeContactDetails: function() {
      const overlay = document.querySelector('.contact-details-overlay');
      if (overlay) overlay.remove();
    },

    callContact: function(phone) {
      helpers.notify(`Rufe ${phone} an...`, 'info');
      // In einer echten App würde hier die Telefon-Integration erfolgen
    },

    emailContact: function(email) {
      window.location.href = `mailto:${email}`;
    },

    filterContacts: function(searchTerm) {
      const contactCards = document.querySelectorAll('.contact-card');
      const term = searchTerm.toLowerCase();
      
      contactCards.forEach(card => {
        const name = card.querySelector('.contact-name').textContent.toLowerCase();
        const department = card.querySelector('.contact-department')?.textContent.toLowerCase() || '';
        const position = card.querySelector('.contact-position')?.textContent.toLowerCase() || '';
        
        const matches = name.includes(term) || department.includes(term) || position.includes(term);
        card.style.display = matches ? 'flex' : 'none';
      });
    },

    // Kalender-Funktionen
    previousMonth: function() {
      helpers.notify('Vorheriger Monat - in Entwicklung', 'info');
    },

    nextMonth: function() {
      helpers.notify('Nächster Monat - in Entwicklung', 'info');
    },

    selectCalendarDate: function(dateStr) {
      const selectedDays = document.querySelectorAll('.calendar-day.selected');
      selectedDays.forEach(day => day.classList.remove('selected'));
      
      const clickedDay = document.querySelector(`[data-date="${dateStr}"]`);
      if (clickedDay) {
        clickedDay.classList.add('selected');
      }
      
      app.showDateEvents(dateStr);
    },

    showDateEvents: function(dateStr) {
      const eventsContainer = document.getElementById('calendarEvents');
      if (eventsContainer) {
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('de-DE');
        
        eventsContainer.innerHTML = `
          <h4>Termine für ${formattedDate}</h4>
          <div class="date-events">
            <div class="event-item">
              <div class="event-time">09:00</div>
              <div class="event-title">Team Meeting</div>
            </div>
            <div class="event-item">
              <div class="event-time">14:30</div>
              <div class="event-title">Kundentermin</div>
            </div>
            <div class="drop-zone" data-date="${dateStr}">
              <i class="fas fa-plus"></i>
              <span>Kontakt hier ablegen für neuen Termin</span>
            </div>
          </div>
        `;
        
        app.setupCalendarDropZone();
      }
    },

    setupCalendarDropZone: function() {
      const dropZones = document.querySelectorAll('.drop-zone');
      dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
          e.preventDefault();
          zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', (e) => {
          if (!zone.contains(e.relatedTarget)) {
            zone.classList.remove('drag-over');
          }
        });
        
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('drag-over');
          
          const contactId = e.dataTransfer.getData('text/plain');
          const date = zone.dataset.date;
          
          if (contactId && date) {
            app.createAppointment(contactId, date);
          }
        });
      });
    },

    createAppointment: function(contactId, date) {
      const contact = MODULES.contacts.data.find(c => c.id == contactId);
      if (!contact) return;
      
      const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      const formattedDate = new Date(date).toLocaleDateString('de-DE');
      
      helpers.notify(`Termin mit ${displayName} für ${formattedDate} erstellt!`, 'success');
      
      // Termin zur Liste hinzufügen
      const eventsContainer = document.querySelector('.date-events');
      if (eventsContainer) {
        const appointmentHtml = `
          <div class="event-item appointment">
            <div class="event-time">10:00</div>
            <div class="event-title">Termin mit ${helpers.escapeHtml(displayName)}</div>
            <div class="event-contact">${contact.phone || contact.email || ''}</div>
          </div>
        `;
        
        eventsContainer.insertAdjacentHTML('afterbegin', appointmentHtml);
      }
    },

    scheduleAppointment: function(contactId) {
      helpers.notify('Terminplanung geöffnet - Wählen Sie ein Datum im Kalender', 'info');
      app.closeContactDetails();
    },

    showContactEdit: function(contactId) {
      helpers.notify('Kontakt bearbeiten - in Entwicklung', 'info');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();