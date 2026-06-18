const API_URL = 'http://localhost:3003';
let token = null;
let currentUser = null;
let allPatients = [];

// Éléments DOM
const loginBtn = document.getElementById('btnLogin');
const logoutBtn = document.getElementById('btnLogout');
const loginZone = document.getElementById('loginZone');
const dashboardZone = document.getElementById('dashboardZone');
const loginError = document.getElementById('loginError');
const patientList = document.getElementById('patientList');
const statTotal = document.getElementById('statTotal');
const statRouge = document.getElementById('statRouge');
const statCritique = document.getElementById('statCritique');
const searchInput = document.getElementById('searchLot');
const searchBtn = document.getElementById('btnSearch');

// Stockage local des dossiers critiques
let criticalPatients = JSON.parse(localStorage.getItem('criticalPatients') || '[]');

// ---------- Aides d'affichage (couleurs de statut) ----------

// Niveau de risque obstétrical -> classe de carte / badge
function riskInfo(niveau) {
    const n = (niveau || '').toLowerCase();
    if (n === 'eleve') return { card: 'card--risque-eleve', badge: 'badge--danger', label: 'Risque élevé' };
    if (n === 'modere') return { card: 'card--risque-modere', badge: 'badge--warning', label: 'Risque modéré' };
    return { card: 'card--risque-normal', badge: 'badge--neutral', label: 'Risque normal' };
}

// Statut d'admission -> badge + libellé lisible
function admissionInfo(statut) {
    const s = (statut || '').toLowerCase();
    if (s === 'travail_actif') return { badge: 'badge--danger', label: 'Travail actif' };
    if (s === 'observation') return { badge: 'badge--info', label: 'En observation' };
    if (s === 'post_partum' || s.includes('partum')) return { badge: 'badge--success', label: 'Post-partum' };
    if (s === 'sortie' || s.includes('sortie')) return { badge: 'badge--success', label: 'Sortie autorisée' };
    return { badge: 'badge--neutral', label: 'Statut inconnu' };
}

// ---------- Connexion ----------

loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
        loginError.innerText = 'Veuillez remplir tous les champs';
        return;
    }
    loginError.innerText = '';
    loginBtn.disabled = true;
    loginBtn.innerText = 'Connexion...';
    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Identifiants invalides');
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('token', token);
        document.getElementById('userName').innerText = `${currentUser.prenom} ${currentUser.nom}`;
        document.getElementById('userRole').innerText = currentUser.role;
        document.getElementById('userWorkspace').innerText = 'Maternité centrale';
        loginZone.style.display = 'none';
        dashboardZone.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
        await loadPatients();
    } catch (err) {
        loginError.innerText = err.message;
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = 'Se connecter';
    }
});

logoutBtn.addEventListener('click', () => {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    loginZone.style.display = 'block';
    dashboardZone.style.display = 'none';
    logoutBtn.style.display = 'none';
    closeModal();
});

// ---------- Chargement des patientes ----------

async function loadPatients() {
    try {
        const res = await fetch(`${API_URL}/api/patients`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        allPatients = await res.json();
        updateStatistics();
        displayPatients(allPatients);
    } catch (err) {
        console.error(err);
        patientList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Erreur de chargement des patientes.</div>';
    }
}

function updateStatistics() {
    const total = allPatients.length;
    const rougeCount = allPatients.filter(p => p.niveau_risque === 'eleve').length;
    const critiqueCount = allPatients.filter(p => criticalPatients.includes(p.id_patiente)).length;
    statTotal.innerText = total;
    statRouge.innerText = rougeCount;
    statCritique.innerText = critiqueCount;
}

function displayPatients(patients) {
    if (!patients.length) {
        patientList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">🔎</span>Aucune patiente trouvée.</div>';
        return;
    }
    patientList.innerHTML = patients.map(p => {
        const risk = riskInfo(p.niveau_risque);
        const admission = admissionInfo(p.statut_admission);
        const isCritical = criticalPatients.includes(p.id_patiente);
        return `
            <div class="card ${risk.card}" data-id="${p.id_patiente}">
                <div class="card-header">
                    <strong>${p.prenom} ${p.nom}</strong>
                    <button class="critical-btn ${isCritical ? 'critical-active' : ''}" data-id="${p.id_patiente}" title="Marquer comme dossier critique" aria-label="Marquer comme dossier critique">⭐</button>
                </div>
                <div class="card-meta">
                    <span class="badge ${risk.badge}">${risk.label}</span>
                    <span class="badge ${admission.badge}">${admission.label}</span>
                </div>
                <div class="card-line">📁 <strong>${p.numero_dossier}</strong> · ${p.quartier || 'Quartier inconnu'}</div>
                <div class="card-line">🤰 Terme actuel : <strong>${p.terme_actuel_sa || '?'} SA</strong></div>
                <button class="details-btn" data-id="${p.id_patiente}">Voir les détails du dossier</button>
            </div>
        `;
    }).join('');

    // Événements pour les boutons "Marquer critique"
    document.querySelectorAll('.critical-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            toggleCritical(id);
        });
    });

    // Événements pour les boutons "Voir détails"
    document.querySelectorAll('.details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            showPatientDetails(id);
        });
    });
}

function toggleCritical(patientId) {
    if (criticalPatients.includes(patientId)) {
        criticalPatients = criticalPatients.filter(id => id !== patientId);
    } else {
        criticalPatients.push(patientId);
    }
    localStorage.setItem('criticalPatients', JSON.stringify(criticalPatients));
    updateStatistics();
    displayPatients(allPatients); // Rafraîchir l'affichage
    // TODO: appeler une route PATCH pour mettre à jour est_critique en base
}

// ---------- Modal détails patiente ----------

async function showPatientDetails(patientId) {
    try {
        const res = await fetch(`${API_URL}/api/patients/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        openModal(data);
    } catch (err) {
        console.error(err);
        openModal(null, true);
    }
}

function openModal(data, isError = false) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'patientModal';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    let inner;
    if (isError || !data) {
        inner = `
            <div class="modal-section">
                <p>⚠️ Impossible de charger les détails de ce dossier. Vérifiez la connexion au serveur.</p>
            </div>
        `;
    } else {
        const p = data.patiente;
        const risk = riskInfo(p.niveau_risque);
        const admission = admissionInfo(p.statut_admission);

        const grossesses = (data.grossesses || []).map(g => `
            <p>🤰 ${g.terme_actuel_sa || '?'} SA · <strong>${g.type_grossesse || 'Grossesse unique'}</strong>${g.commentaire ? ` — ${g.commentaire}` : ''}</p>
        `).join('') || '<p>Aucune grossesse enregistrée.</p>';

        const admissions = (data.admissions || []).map(a => `
            <p>📅 ${a.date_admission ? new Date(a.date_admission).toLocaleDateString('fr-FR') : 'Date inconnue'} — <strong>${a.motif || 'Motif non précisé'}</strong></p>
        `).join('') || '<p>Aucune admission enregistrée.</p>';

        inner = `
            <h3>${p.prenom} ${p.nom}</h3>
            <p class="modal-subtitle">📁 ${p.numero_dossier} · ${p.quartier || 'Quartier inconnu'}</p>

            <div class="modal-section">
                <h4>Statut clinique</h4>
                <p><span class="badge ${risk.badge}">${risk.label}</span> <span class="badge ${admission.badge}">${admission.label}</span></p>
                <p>Terme actuel : <strong>${p.terme_actuel_sa || '?'} SA</strong></p>
            </div>

            <div class="modal-section">
                <h4>Grossesses (${data.grossesses ? data.grossesses.length : 0})</h4>
                ${grossesses}
            </div>

            <div class="modal-section">
                <h4>Admissions (${data.admissions ? data.admissions.length : 0})</h4>
                ${admissions}
            </div>
        `;
    }

    overlay.innerHTML = `
        <div class="modal">
            <button class="modal-close" id="modalCloseBtn" aria-label="Fermer">✕</button>
            ${inner}
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);

    const escHandler = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;
}

function closeModal() {
    const overlay = document.getElementById('patientModal');
    if (overlay) {
        if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
        overlay.remove();
    }
}

// ---------- Recherche par lot de vaccin ----------

searchBtn.addEventListener('click', async () => {
    const lot = searchInput.value.trim();
    if (!lot) {
        await loadPatients();
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/search/lot/${lot}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await res.json();
        if (results.length === 0) {
            patientList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">🔎</span>Aucune patiente trouvée pour ce lot.</div>';
        } else {
            displayPatients(results);
        }
    } catch (err) {
        console.error(err);
        patientList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Erreur lors de la recherche.</div>';
    }
});

// Recherche déclenchée avec la touche Entrée
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

// Vérifier si un token existe déjà au chargement
if (localStorage.getItem('token')) {
    token = localStorage.getItem('token');
    // On pourrait automatiquement charger les patientes, mais pour simplifier on laisse la connexion manuelle
}
