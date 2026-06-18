const API_URL = 'http://localhost:3003';
let currentPatient = null;

// Éléments DOM
const loginBtn = document.getElementById('btnLogin');
const logoutBtn = document.getElementById('btnLogout');
const loginZone = document.getElementById('loginZone');
const dashboardZone = document.getElementById('dashboardZone');
const loginError = document.getElementById('loginError');
const uploadStatus = document.getElementById('uploadStatus');
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

// ---------- Aides d'affichage (couleurs de statut) ----------

// Couleur du badge selon le statut d'un rendez-vous
function rdvBadgeClass(statut) {
    const s = (statut || '').toLowerCase();
    if (s.includes('confirm') || s.includes('termin') || s.includes('effectu')) return 'badge--success';
    if (s.includes('annul')) return 'badge--danger';
    if (s.includes('report') || s.includes('attente')) return 'badge--warning';
    if (s.includes('observ') || s.includes('cours') || s.includes('prevu') || s.includes('prévu')) return 'badge--info';
    return 'badge--neutral';
}

// Urgence du rappel vaccinal selon la date du prochain rappel
function rappelInfo(dateStr) {
    if (!dateStr) return { label: 'Non prévu', cls: 'badge--neutral' };
    const diffJours = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
    if (diffJours < 0) return { label: 'Rappel en retard', cls: 'badge--danger' };
    if (diffJours <= 30) return { label: 'Rappel à venir', cls: 'badge--warning' };
    return { label: 'À jour', cls: 'badge--success' };
}

// Icône selon le type de document déposé
function documentIcon(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('écho') || t.includes('echo')) return '🩻';
    if (t.includes('sang') || t.includes('bilan')) return '🩸';
    if (t.includes('ordonnance')) return '📝';
    return '📄';
}

// Déduit la couleur de la bordure d'une carte à partir de la classe du badge
function cardClassFromBadge(badgeCls) {
    return badgeCls.replace('badge--', 'card--');
}

// ---------- Connexion ----------

loginBtn.addEventListener('click', async () => {
    const code = document.getElementById('codeDossier').value.trim();
    if (!code) {
        loginError.innerText = 'Veuillez entrer votre code dossier';
        return;
    }
    loginError.innerText = '';
    loginBtn.disabled = true;
    loginBtn.innerText = 'Connexion…';
    try {
        const res = await fetch(`${API_URL}/api/patients`);
        const patients = await res.json();
        const patient = patients.find(p => p.numero_dossier === code);
        if (!patient) {
            loginError.innerText = 'Code dossier invalide';
            return;
        }
        currentPatient = patient;
        document.getElementById('patientNom').innerText = `${patient.prenom} ${patient.nom}`;
        document.getElementById('patientDossier').innerText = patient.numero_dossier;
        document.getElementById('patientQuartier').innerText = `📍 ${patient.quartier || 'Quartier non renseigné'}`;

        await loadRendezVous(patient.id_patiente);
        await loadVaccinations(patient.id_patiente);
        await loadDocuments(patient.id_patiente);

        loginZone.style.display = 'none';
        dashboardZone.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
    } catch (err) {
        loginError.innerText = 'Erreur de connexion au serveur. Vérifiez que l\'API tourne (node server.js)';
        console.error(err);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = 'Accéder à mon dossier';
    }
});

// ---------- Rendez-vous ----------

async function loadRendezVous(patienteId) {
    const container = document.getElementById('rdvList');
    container.className = 'loading';
    container.innerHTML = 'Chargement…';
    try {
        const res = await fetch(`${API_URL}/api/rendezvous/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const rdvs = await res.json();
        container.className = '';
        if (rdvs.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📅</span>Aucun rendez-vous programmé pour le moment.</div>';
            return;
        }
        container.innerHTML = rdvs.map(rdv => {
            const badge = rdvBadgeClass(rdv.statut);
            return `
            <div class="card ${cardClassFromBadge(badge)}">
                <strong>${rdv.type_rdv}</strong>
                <span class="badge ${badge}">${rdv.statut}</span>
                <div class="meta">📅 ${new Date(rdv.date_heure).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>`;
        }).join('');
    } catch (err) {
        container.className = '';
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les rendez-vous.</div>';
    }
}

// ---------- Vaccinations ----------

async function loadVaccinations(patienteId) {
    const container = document.getElementById('vaccinList');
    container.className = 'loading';
    container.innerHTML = 'Chargement…';
    try {
        const res = await fetch(`${API_URL}/api/vaccinations/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const vaccins = await res.json();
        container.className = '';
        if (vaccins.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">💉</span>Aucune vaccination enregistrée.</div>';
            return;
        }
        container.innerHTML = vaccins.map(v => {
            const rappel = rappelInfo(v.prochain_rappel);
            return `
            <div class="card ${cardClassFromBadge(rappel.cls)}">
                <strong>💉 ${v.type_vaccin}</strong>${v.dose ? ` <span class="meta-inline">· ${v.dose}</span>` : ''}
                <span class="badge ${rappel.cls}">${rappel.label}</span>
                <div class="meta">
                    Administré le ${new Date(v.date_vaccination).toLocaleDateString('fr-FR')}<br>
                    Prochain rappel : ${v.prochain_rappel ? new Date(v.prochain_rappel).toLocaleDateString('fr-FR') : 'Non prévu'}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        container.className = '';
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les vaccinations.</div>';
    }
}

// ---------- Documents ----------

async function loadDocuments(patienteId) {
    const container = document.getElementById('documentList');
    container.className = 'loading';
    container.innerHTML = 'Chargement…';
    try {
        const res = await fetch(`${API_URL}/api/documents/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const docs = await res.json();
        container.className = '';
        if (docs.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📄</span>Aucun document déposé pour le moment.</div>';
            return;
        }
        container.innerHTML = docs.map(doc => `
            <div class="card card--neutral">
                <strong>${documentIcon(doc.type_document)} ${doc.titre}</strong>
                <div class="meta">${doc.type_document} · Déposé le ${new Date(doc.date_upload).toLocaleDateString('fr-FR')}</div>
            </div>
        `).join('');
    } catch (err) {
        container.className = '';
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les documents.</div>';
    }
}

// ---------- Dépôt d'un examen ----------

document.getElementById('btnUpload').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) {
        uploadStatus.className = 'upload-feedback upload-feedback--error';
        uploadStatus.innerText = 'Veuillez sélectionner un fichier';
        return;
    }
    uploadStatus.className = 'upload-feedback';
    uploadStatus.innerText = '⏳ Envoi en cours…';
    const formData = new FormData();
    formData.append('document', file);
    try {
        const res = await fetch(`${API_URL}/api/upload/${currentPatient.numero_dossier}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            uploadStatus.className = 'upload-feedback upload-feedback--success';
            uploadStatus.innerText = '✅ Document envoyé avec succès !';
            fileInput.value = '';
            loadDocuments(currentPatient.id_patiente);
        } else {
            uploadStatus.className = 'upload-feedback upload-feedback--error';
            uploadStatus.innerText = '❌ Erreur : ' + (data.error || 'Échec de l\'upload');
        }
    } catch (err) {
        uploadStatus.className = 'upload-feedback upload-feedback--error';
        uploadStatus.innerText = '❌ Erreur de connexion au serveur';
    }
});

// ---------- Navigation par onglets ----------

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => {
            t.classList.remove('is-active');
            t.setAttribute('aria-selected', 'false');
        });
        panels.forEach(p => p.classList.remove('is-active'));

        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add('is-active');
    });
});

function resetTabs() {
    tabs.forEach((t, i) => {
        t.classList.toggle('is-active', i === 0);
        t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    });
    panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));
}

// ---------- Déconnexion ----------

logoutBtn.addEventListener('click', () => {
    currentPatient = null;
    loginZone.style.display = 'block';
    dashboardZone.style.display = 'none';
    logoutBtn.style.display = 'none';
    document.getElementById('codeDossier').value = '';
    document.getElementById('fileInput').value = '';
    uploadStatus.innerText = '';
    uploadStatus.className = 'upload-feedback';
    loginError.innerText = '';
    resetTabs();
});
