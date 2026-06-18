const API_URL = 'http://localhost:3003';
let currentPatient = null;

// ---------- NOTIFICATIONS TOAST ----------
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        const div = document.createElement('div');
        div.id = 'toastContainer';
        div.className = 'toast-container';
        document.body.appendChild(div);
    }
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">✕</button>
    `;
    toastContainer.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Éléments DOM
const loginBtn = document.getElementById('btnLogin');
const logoutBtn = document.getElementById('btnLogout');
const loginZone = document.getElementById('loginZone');
const dashboardZone = document.getElementById('dashboardZone');
const loginError = document.getElementById('loginError');
const uploadStatus = document.getElementById('uploadStatus');
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

// Badge selon statut RDV
function rdvBadgeClass(statut) {
    const s = (statut || '').toLowerCase();
    if (s.includes('effectu') || s.includes('termin')) return 'badge--success';
    if (s.includes('annul')) return 'badge--danger';
    if (s.includes('report')) return 'badge--warning';
    return 'badge--info';
}

// Rappel vaccin
function rappelInfo(dateStr) {
    if (!dateStr) return { label: 'Non prévu', cls: 'badge--neutral' };
    const diff = (new Date(dateStr) - new Date()) / (1000 * 3600 * 24);
    if (diff < 0) return { label: 'Rappel en retard', cls: 'badge--danger' };
    if (diff <= 30) return { label: 'Rappel à venir', cls: 'badge--warning' };
    return { label: 'À jour', cls: 'badge--success' };
}

// Icône selon le type de document
function documentIcon(type) {
    switch(type) {
        case 'echographie': return '🩻';
        case 'bilan_sanguin': return '🩸';
        case 'ordonnance': return '📝';
        case 'compte_rendu': return '📄';
        default: return '📁';
    }
}

function cardClassFromBadge(cls) {
    return cls.replace('badge--', 'card--');
}

// ---------- CONNEXION ----------
loginBtn.addEventListener('click', async () => {
    const code = document.getElementById('codeDossier').value.trim();
    if (!code) {
        showToast('Veuillez entrer votre code dossier', 'error');
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
            showToast('Code dossier invalide', 'error');
            return;
        }
        currentPatient = patient;
        document.getElementById('patientNom').innerText = `${patient.prenom} ${patient.nom}`;
        document.getElementById('patientDossier').innerText = patient.numero_dossier;
        document.getElementById('patientQuartier').innerText = `📍 ${patient.quartier || 'Quartier non renseigné'}`;

        await loadRendezVous(patient.id_patiente);
        await loadVaccinations(patient.id_patiente);
        await loadDocuments(patient.id_patiente);
        await loadAlertesPatient();
        await loadProfil();

        loginZone.style.display = 'none';
        dashboardZone.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
    } catch (err) {
        showToast('Erreur de connexion au serveur. Vérifiez que l\'API tourne.', 'error');
        console.error(err);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = 'Accéder à mon dossier';
    }
});

// ---------- RENDEZ-VOUS ----------
async function loadRendezVous(patienteId) {
    const container = document.getElementById('rdvList');
    container.innerHTML = '<div class="loading">Chargement…</div>';
    try {
        const res = await fetch(`${API_URL}/api/rendezvous/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const rdvs = await res.json();
        if (rdvs.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📅</span>Aucun rendez-vous programmé.</div>';
            return;
        }
        container.innerHTML = rdvs.map(rdv => {
            const badge = rdvBadgeClass(rdv.statut);
            return `
                <div class="card ${cardClassFromBadge(badge)}">
                    <strong>${rdv.type_rdv}</strong>
                    <span class="badge ${badge}">${rdv.statut}</span>
                    <div class="meta">📅 ${new Date(rdv.date_heure).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les rendez-vous.</div>';
    }
}

// ---------- PRENDRE RENDEZ-VOUS ----------
document.getElementById('btnTakeRdv').addEventListener('click', async () => {
    const type_rdv = document.getElementById('rdvType').value;
    const date_heure = document.getElementById('rdvDate').value;
    const notes = document.getElementById('rdvNotes').value.trim();
    const statusDiv = document.getElementById('rdvStatus');

    if (!date_heure) {
        showToast('Veuillez choisir une date et heure', 'error');
        return;
    }

    statusDiv.className = 'upload-feedback';
    statusDiv.innerText = '⏳ Envoi en cours...';

    try {
        const res = await fetch(`${API_URL}/api/rendezvous`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patiente_id: currentPatient.id_patiente,
                date_heure: date_heure,
                type_rdv: type_rdv,
                notes: notes
            })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Rendez-vous pris avec succès !', 'success');
            document.getElementById('rdvDate').value = '';
            document.getElementById('rdvNotes').value = '';
            loadRendezVous(currentPatient.id_patiente);
        } else {
            showToast('❌ Erreur : ' + (data.error || 'Échec de la prise de RDV'), 'error');
        }
    } catch (err) {
        showToast('❌ Erreur de connexion au serveur', 'error');
    }
});

// ---------- VACCINATIONS ----------
async function loadVaccinations(patienteId) {
    const container = document.getElementById('vaccinList');
    container.innerHTML = '<div class="loading">Chargement…</div>';
    try {
        const res = await fetch(`${API_URL}/api/vaccinations/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const vaccins = await res.json();
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
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les vaccinations.</div>';
    }
}

// ---------- DOCUMENTS ----------
async function loadDocuments(patienteId) {
    const container = document.getElementById('documentList');
    container.innerHTML = '<div class="loading">Chargement…</div>';
    try {
        const res = await fetch(`${API_URL}/api/documents/patient/${patienteId}`);
        if (!res.ok) throw new Error();
        const docs = await res.json();
        if (docs.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📄</span>Aucun document déposé.</div>';
            return;
        }
        container.innerHTML = docs.map(doc => `
            <div class="card card--neutral">
                <strong>${documentIcon(doc.type_document)} ${doc.titre}</strong>
                <div class="meta">${doc.type_document} · Déposé le ${new Date(doc.date_upload).toLocaleDateString('fr-FR')}</div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger les documents.</div>';
    }
}

// ---------- ALERTES PATIENT ----------
async function loadAlertesPatient() {
    const container = document.getElementById('alertesList');
    container.className = 'loading';
    container.innerHTML = 'Chargement…';
    try {
        const res = await fetch(`${API_URL}/api/patient/alertes/${currentPatient.numero_dossier}`);
        if (!res.ok) throw new Error();
        const alertes = await res.json();
        container.className = '';
        if (alertes.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">✅</span>Aucune alerte pour le moment.</div>';
            return;
        }
        container.innerHTML = alertes.map(a => `
            <div class="card ${a.statut === 'traitee' ? 'card--success' : 'card--danger'}" style="border-left-color: ${a.priorite === 'eleve' ? '#dc2626' : '#f97316'};">
                <strong>🚨 ${a.type_alerte}</strong>
                <div class="meta">${a.description} · ${new Date(a.date_creation).toLocaleDateString('fr-FR')}</div>
                <span class="badge ${a.statut === 'traitee' ? 'badge--success' : 'badge--danger'}">${a.statut === 'traitee' ? '✅ Traitée' : '⏳ En attente'}</span>
            </div>
        `).join('');
    } catch (err) {
        container.className = '';
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger vos alertes.</div>';
    }
}

// ---------- PROFIL PATIENT ----------
async function loadProfil() {
    const container = document.getElementById('profilInfo');
    container.className = 'loading';
    container.innerHTML = 'Chargement…';
    try {
        const res = await fetch(`${API_URL}/api/patient/public/${currentPatient.id_patiente}`);
        if (!res.ok) throw new Error();
        const p = await res.json();
        container.className = '';
        container.innerHTML = `
            <div class="card card--neutral">
                <p><strong>Nom :</strong> ${p.nom} ${p.prenom}</p>
                <p><strong>Date de naissance :</strong> ${new Date(p.date_naissance).toLocaleDateString('fr-FR')}</p>
                <p><strong>Téléphone :</strong> ${p.telephone || 'Non renseigné'}</p>
                <p><strong>Adresse :</strong> ${p.adresse || 'Non renseignée'}</p>
                <p><strong>Quartier :</strong> ${p.quartier || 'Non renseigné'}</p>
                <p><strong>Groupe sanguin :</strong> ${p.groupe_sanguin || 'Non renseigné'}</p>
                <p><strong>Date première consultation :</strong> ${p.date_premiere_consultation ? new Date(p.date_premiere_consultation).toLocaleDateString('fr-FR') : 'Non renseignée'}</p>
                <p><strong>Antécédents médicaux :</strong> ${p.antecedents_medicaux || 'Aucun'}</p>
                <p><strong>Allergies :</strong> ${p.allergies || 'Aucune'}</p>
            </div>
        `;
    } catch (err) {
        container.className = '';
        container.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span>Impossible de charger votre profil.</div>';
    }
}

// ---------- UPLOAD ----------
document.getElementById('btnUpload').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const docType = document.getElementById('docType').value;

    if (!file) {
        showToast('Veuillez sélectionner un fichier', 'error');
        return;
    }
    uploadStatus.className = 'upload-feedback';
    uploadStatus.innerText = '⏳ Envoi en cours…';
    const formData = new FormData();
    formData.append('document', file);
    formData.append('type_document', docType);

    try {
        const res = await fetch(`${API_URL}/api/upload/${currentPatient.numero_dossier}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Document envoyé avec succès !', 'success');
            fileInput.value = '';
            document.getElementById('docType').value = 'autre';
            loadDocuments(currentPatient.id_patiente);
        } else {
            showToast('❌ Erreur : ' + (data.error || 'Échec de l\'upload'), 'error');
        }
    } catch (err) {
        showToast('❌ Erreur de connexion au serveur', 'error');
    }
});

// ---------- ONGLETS ----------
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

// ---------- DÉCONNEXION ----------
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