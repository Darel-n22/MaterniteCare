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

// Connexion
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
});

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
        patientList.innerHTML = '<div class="error">Erreur de chargement des patientes</div>';
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
        patientList.innerHTML = '<div class="empty-state">Aucune patiente trouvée</div>';
        return;
    }
    patientList.innerHTML = patients.map(p => {
        const riskClass = p.niveau_risque === 'eleve' ? 'card--risque-eleve' : (p.niveau_risque === 'modere' ? 'card--risque-modere' : 'card--risque-normal');
        const riskBadge = p.niveau_risque === 'eleve' ? 'badge--danger' : (p.niveau_risque === 'modere' ? 'badge--warning' : 'badge--neutral');
        const admissionBadge = p.statut_admission === 'travail_actif' ? 'badge--danger' : (p.statut_admission === 'observation' ? 'badge--info' : 'badge--neutral');
        const isCritical = criticalPatients.includes(p.id_patiente);
        return `
            <div class="card ${riskClass}" data-id="${p.id_patiente}">
                <div class="card-header">
                    <strong>${p.prenom} ${p.nom}</strong>
                    <button class="critical-btn ${isCritical ? 'critical-active' : ''}" data-id="${p.id_patiente}">⭐</button>
                </div>
                <div class="card-meta">
                    <span class="badge ${riskBadge}">${p.niveau_risque || 'normal'}</span>
                    <span class="badge ${admissionBadge}">${p.statut_admission || 'inconnu'}</span>
                </div>
                <div>📁 ${p.numero_dossier} · ${p.quartier || 'Quartier inconnu'}</div>
                <div>🤰 ${p.terme_actuel_sa || '?'} SA</div>
                <button class="details-btn" data-id="${p.id_patiente}">Voir détails</button>
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

async function showPatientDetails(patientId) {
    try {
        const res = await fetch(`${API_URL}/api/patients/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        alert(`Détails de ${data.patiente.prenom} ${data.patiente.nom}\nGrossesses : ${data.grossesses.length}\nAdmissions : ${data.admissions.length}`);
        // Ici on ouvrira un modal dans le commit 10
    } catch (err) {
        console.error(err);
        alert('Erreur de chargement des détails');
    }
}

// Recherche par lot de vaccin
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
            patientList.innerHTML = '<div class="empty-state">Aucune patiente trouvée pour ce lot</div>';
        } else {
            displayPatients(results);
        }
    } catch (err) {
        console.error(err);
    }
});

// Vérifier si un token existe déjà au chargement
if (localStorage.getItem('token')) {
    token = localStorage.getItem('token');
    // On pourrait automatiquement charger les patientes, mais pour simplifier on laisse la connexion manuelle
}