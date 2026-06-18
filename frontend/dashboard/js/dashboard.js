const API_URL = 'https://maternitecare-backend.onrender.com';
let token = null;
let currentUser = null;
let allPatients = [];

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
const patientList = document.getElementById('patientList');
const statTotal = document.getElementById('statTotal');
const statRouge = document.getElementById('statRouge');
const statCritique = document.getElementById('statCritique');
const searchInput = document.getElementById('searchLot');
const searchBtn = document.getElementById('btnSearch');

let criticalPatients = JSON.parse(localStorage.getItem('criticalPatients') || '[]');

function riskInfo(niveau) {
    const n = (niveau || '').toLowerCase();
    if (n === 'eleve') return { card: 'card--risque-eleve', badge: 'badge--danger', label: 'Risque élevé' };
    if (n === 'modere') return { card: 'card--risque-modere', badge: 'badge--warning', label: 'Risque modéré' };
    return { card: 'card--risque-normal', badge: 'badge--neutral', label: 'Risque normal' };
}

function admissionInfo(statut) {
    const s = (statut || '').toLowerCase();
    if (s === 'travail_actif') return { badge: 'badge--danger', label: 'Travail actif' };
    if (s === 'observation') return { badge: 'badge--info', label: 'En observation' };
    if (s.includes('partum')) return { badge: 'badge--success', label: 'Post-partum' };
    if (s.includes('sortie')) return { badge: 'badge--success', label: 'Sortie autorisée' };
    return { badge: 'badge--neutral', label: 'Statut inconnu' };
}

// Connexion
loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
        showToast('Veuillez remplir tous les champs', 'error');
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
        await loadAlertes();
    } catch (err) {
        showToast(err.message, 'error');
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

async function loadPatients() {
    try {
        const res = await fetch(`${API_URL}/api/soignant/patients`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        allPatients = await res.json();
        updateStatistics();
        displayPatients(allPatients);
    } catch (err) {
        patientList.innerHTML = '<div class="empty-state">Erreur de chargement</div>';
    }
}

async function loadAlertes() {
    try {
        const res = await fetch(`${API_URL}/api/alertes/non-traitees`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const alertes = await res.json();
        const alertBadge = document.getElementById('alertBadge');
        if (alertBadge) {
            alertBadge.innerText = alertes.length;
            alertBadge.style.display = alertes.length > 0 ? 'inline-block' : 'none';
            alertBadge.style.cursor = 'pointer';
            alertBadge.title = 'Voir les alertes';
            alertBadge.onclick = () => {
                if (alertes.length > 0) {
                    showPatientDetails(alertes[0].patiente_id);
                } else {
                    showToast('Aucune alerte non traitée.', 'info');
                }
            };
        }
    } catch (err) {
        console.error('Erreur chargement alertes:', err);
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
        const risk = riskInfo(p.niveau_risque);
        const admission = admissionInfo(p.statut_admission);
        const isCritical = criticalPatients.includes(p.id_patiente);
        return `
            <div class="card ${risk.card}" data-id="${p.id_patiente}">
                <div class="card-header">
                    <strong>${p.prenom} ${p.nom}</strong>
                    <button class="critical-btn ${isCritical ? 'critical-active' : ''}" data-id="${p.id_patiente}">⭐</button>
                </div>
                <div class="card-meta">
                    <span class="badge ${risk.badge}">${risk.label}</span>
                    <span class="badge ${admission.badge}">${admission.label}</span>
                </div>
                <div>📁 ${p.numero_dossier} · ${p.quartier || '?'}</div>
                <div>🤰 ${p.terme_actuel_sa || '?'} SA</div>
                <button class="details-btn" data-id="${p.id_patiente}">Voir détails</button>
            </div>
        `;
    }).join('');
    attachEvents();
}

function attachEvents() {
    document.querySelectorAll('.critical-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCritical(btn.dataset.id);
        });
    });
    document.querySelectorAll('.details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPatientDetails(btn.dataset.id);
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
    displayPatients(allPatients);
}

// ---------- DÉTAILS PATIENTE ----------
async function showPatientDetails(patientId) {
    try {
        const res = await fetch(`${API_URL}/api/patients/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const p = data.patiente;
        const activeAdmission = data.admissions?.find(a => !a.date_sortie);
        const admissionId = activeAdmission?.id_admission;

        // Constantes
        let constantesHtml = '<p>Aucune constante</p>';
        if (admissionId) {
            const constRes = await fetch(`${API_URL}/api/constantes/admission/${admissionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const constantes = await constRes.json();
            if (constantes.length) {
                constantesHtml = constantes.map(c => `
                    <p>📊 ${new Date(c.date_heure).toLocaleString()} : TA ${c.tension_systolique}/${c.tension_diastolique} mmHg, dilatation ${c.dilatation_col} cm, RCF ${c.frequence_cardiaque_foetale} bpm</p>
                `).join('');
            }
        }

        // Ordonnances
        const ordRes = await fetch(`${API_URL}/api/ordonnances/patient/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const ordonnances = await ordRes.json();

        // Accouchements
        const accRes = await fetch(`${API_URL}/api/accouchements/patient/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const accouchements = await accRes.json();

        // Lits
        let litHtml = '';
        if (activeAdmission) {
            const litsRes = await fetch(`${API_URL}/api/lits/workspace/${activeAdmission.workspace_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const lits = await litsRes.json();
            litHtml = `
                <div class="modal-section">
                    <h4>Attribution du lit</h4>
                    <select id="litSelect">
                        <option value="">-- Choisir --</option>
                        ${lits.filter(l => l.est_disponible).map(lit => `<option value="${lit.id_lit}">${lit.numero_lit} (${lit.type_lit})</option>`).join('')}
                    </select>
                    <button id="assignLitBtn" data-admission="${activeAdmission.id_admission}">Assigner ce lit</button>
                    <button id="freeLitBtn" data-admission="${activeAdmission.id_admission}" data-lit="${activeAdmission.lit_id || ''}" ${!activeAdmission.lit_id ? 'disabled' : ''}>Libérer le lit actuel</button>
                </div>
            `;
        }

        // Documents
        const docRes = await fetch(`${API_URL}/api/documents/patient/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const documents = await docRes.json();

        // Alertes
        const alerteRes = await fetch(`${API_URL}/api/alertes/patient/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const alertes = await alerteRes.json();

        openModal({
            patiente: p,
            constantes: constantesHtml,
            ordonnances: ordonnances,
            accouchements: accouchements,
            lits: litHtml,
            admissionId: admissionId,
            patientId: patientId,
            activeAdmission: activeAdmission,
            grossesse: data.grossesses?.[0],
            documents: documents,
            alertes: alertes
        });
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
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    let inner;
    if (isError || !data) {
        inner = '<div><p>❌ Impossible de charger les détails.</p></div>';
    } else {
        const p = data.patiente;
        const g = data.grossesse;

        // Affichage des documents
        const docHtml = data.documents && data.documents.length
            ? data.documents.map(doc => `
                <div class="card card--neutral" style="border-left-color: #3A77A8; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${doc.titre}</strong>
                        <div class="meta">${doc.type_document || 'Document'} · Déposé le ${new Date(doc.date_upload).toLocaleDateString('fr-FR')}</div>
                    </div>
                    <button class="doc-download-btn" data-file="${doc.chemin_fichier}" data-titre="${doc.titre}" style="background: #3A77A8; color: white; border: none; padding: 6px 12px; border-radius: 20px; cursor: pointer; width: auto; margin: 0;">
                        📥 Télécharger
                    </button>
                </div>
            `).join('')
            : '<p>Aucun document déposé.</p>';

        // Affichage des alertes
        const alertesHtml = data.alertes && data.alertes.length
            ? data.alertes.map(a => `
                <div class="card card--neutral" style="border-left-color: ${a.priorite === 'eleve' ? '#dc2626' : '#f97316'};">
                    <strong>🚨 ${a.type_alerte}</strong>
                    <div class="meta">${a.description} · ${new Date(a.date_creation).toLocaleDateString('fr-FR')}</div>
                    <span class="badge ${a.statut === 'traitee' ? 'badge--success' : 'badge--danger'}">${a.statut}</span>
                    ${a.statut === 'non_traitee' ? `<button class="traiter-alerte-btn" data-id="${a.id_alerte}" style="background:#3A77A8; color:white; border:none; padding:4px 10px; border-radius:20px; cursor:pointer; width:auto; margin-left:8px;">✅ Traiter</button>` : ''}
                </div>
            `).join('')
            : '<p>Aucune alerte.</p>';

        inner = `
            <h3>${p.prenom} ${p.nom}</h3>
            <p class="modal-subtitle">📁 ${p.numero_dossier} · ${p.quartier || '?'}</p>

            <div class="modal-section">
                <h4>📋 Identité et coordonnées</h4>
                <p><strong>Nom :</strong> ${p.nom} ${p.prenom}</p>
                <p><strong>Date de naissance :</strong> ${new Date(p.date_naissance).toLocaleDateString()}</p>
                <p><strong>Téléphone :</strong> ${p.telephone || '-'}</p>
                <p><strong>Adresse :</strong> ${p.adresse || '-'}</p>
                <p><strong>Quartier :</strong> ${p.quartier || '-'}</p>
                <p><strong>Groupe sanguin :</strong> ${p.groupe_sanguin || '-'}</p>
                <p><strong>Antécédents médicaux :</strong> ${p.antecedents_medicaux || '-'}</p>
                <p><strong>Antécédents obstétricaux :</strong> ${p.antecedents_obstetricaux || '-'}</p>
                <p><strong>Allergies :</strong> ${p.allergies || '-'}</p>
            </div>

            <div class="modal-section">
                <h4>✏️ Modifier les informations</h4>
                <input type="text" id="editQuartier" placeholder="Quartier" value="${p.quartier || ''}">
                <input type="text" id="editTelephone" placeholder="Téléphone" value="${p.telephone || ''}">
                <textarea id="editAntecedents" placeholder="Antécédents médicaux">${p.antecedents_medicaux || ''}</textarea>
                <button id="updatePatientBtn">Enregistrer</button>
            </div>

            <div class="modal-section">
                <h4>📄 Exporter le dossier</h4>
                <button id="exportPdfBtn" style="background:#1e3a5f; color:white; width:100%;">📄 Exporter en PDF</button>
            </div>

            ${g ? `
            <div class="modal-section">
                <h4>⚠️ Niveau de risque</h4>
                <select id="risqueSelect">
                    <option value="normal" ${g.niveau_risque === 'normal' ? 'selected' : ''}>Normal (gris)</option>
                    <option value="modere" ${g.niveau_risque === 'modere' ? 'selected' : ''}>Modéré (orange)</option>
                    <option value="eleve" ${g.niveau_risque === 'eleve' ? 'selected' : ''}>Élevé (rouge)</option>
                </select>
                <button id="updateRisqueBtn" data-grossesse="${g.id_grossesse}">Mettre à jour</button>
            </div>` : '<p>⚠️ Aucune grossesse en cours pour définir un risque.</p>'}

            <div class="modal-section">
                <h4>➕ Hospitalisation</h4>
                <select id="workspaceSelect">
                    <option value="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11">Consultations</option>
                    <option value="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12">Bloc obstétrical</option>
                    <option value="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13">Post-partum</option>
                </select>
                <button id="createAdmissionBtn">Créer une admission</button>
                ${data.activeAdmission ? `<button id="closeAdmissionBtn">Clore cette admission</button>` : ''}
            </div>

            <div class="modal-section">
                <h4>🚨 Alertes</h4>
                ${alertesHtml}
            </div>

            <div class="modal-section">
                <h4>📄 Documents de la patiente</h4>
                ${docHtml}
            </div>

            <div class="modal-section">
                <h4>Constantes vitales</h4>
                ${data.constantes}
                <div class="modal-section">
                    <h5>➕ Ajouter des constantes</h5>
                    <input type="number" id="taSys" placeholder="TA systolique (mmHg)">
                    <input type="number" id="taDia" placeholder="TA diastolique (mmHg)">
                    <input type="number" id="pouls" placeholder="Pouls (bpm)">
                    <input type="number" id="temperature" placeholder="Température (°C)" step="0.1">
                    <input type="number" id="dilatation" placeholder="Dilatation (cm)">
                    <input type="number" id="rcf" placeholder="RCF (bpm)">
                    <input type="number" id="contractions" placeholder="Contractions / 10 min">
                    <button id="ajouterConstanteBtn">Ajouter la mesure</button>
                </div>
            </div>

            <div class="modal-section">
                <h4>Ordonnances</h4>
                ${data.ordonnances.length ? data.ordonnances.map(o => `
                    <p>📝 ${new Date(o.date_prescription).toLocaleDateString()} : ${o.contenu}</p>
                `).join('') : '<p>Aucune ordonnance</p>'}
                <textarea id="newOrdonnance" placeholder="Nouvelle prescription" rows="2"></textarea>
                <button id="prescrireBtn">Prescrire</button>
            </div>

            <div class="modal-section">
                <h4>Accouchements</h4>
                ${data.accouchements.length ? data.accouchements.map(acc => `
                    <p>📅 ${new Date(acc.date_heure_accouchement).toLocaleDateString()} - ${acc.type_accouchement} (${acc.duree_travail_minutes || '?'} min)</p>
                `).join('') : '<p>Aucun accouchement</p>'}
                <button id="addAccouchementBtn">Enregistrer un accouchement</button>
                <div id="accouchementForm" style="display:none; margin-top:10px;">
                    <select id="typeAccouchement">
                        <option value="voie_basse">Voie basse</option>
                        <option value="cesarienne">Césarienne</option>
                        <option value="voie_basse_instrumentale">Voie basse instrumentale</option>
                    </select>
                    <input type="number" id="dureeTravail" placeholder="Durée (minutes)">
                    <button id="saveAccouchementBtn">Valider l'accouchement</button>
                </div>
            </div>

            ${data.lits}
        `;
    }

    overlay.innerHTML = `<div class="modal"><button class="modal-close">✕</button>${inner}</div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', closeModal);

    // Gestion du téléchargement des documents
    overlay.querySelectorAll('.doc-download-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const rawPath = btn.dataset.file;
            const fileName = rawPath.split(/[\/\\]/).pop();
            const downloadUrl = `${API_URL}/uploads/${fileName}`;
            window.open(downloadUrl, '_blank');
        });
    });

    // Export PDF
const exportBtn = overlay.querySelector('#exportPdfBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        const url = `${API_URL}/api/patients/${data.patientId}/pdf?token=${token}`;
        window.open(url, '_blank');
    });
}

    // Gestion du traitement des alertes
    overlay.querySelectorAll('.traiter-alerte-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
                const res = await fetch(`${API_URL}/api/alertes/${id}/traiter`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ notes_traitement: 'Prise en charge par la sage-femme' })
                });
                if (res.ok) {
                    showToast('Alerte traitée avec succès', 'success');
                    await loadAlertes();
                    closeModal();
                    showPatientDetails(data.patientId);
                } else {
                    showToast('Erreur lors du traitement de l\'alerte', 'error');
                }
            } catch (err) {
                showToast('Erreur de connexion', 'error');
            }
        });
    });

    // ========== GESTIONNAIRES D'ÉVÉNEMENTS ==========

    // 1. Modifier patiente
    const updateBtn = overlay.querySelector('#updatePatientBtn');
    if (updateBtn) {
        updateBtn.addEventListener('click', async () => {
            const quartier = overlay.querySelector('#editQuartier').value;
            const telephone = overlay.querySelector('#editTelephone').value;
            const antecedents_medicaux = overlay.querySelector('#editAntecedents').value;
            try {
                await fetch(`${API_URL}/api/patients/${data.patientId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ quartier, telephone, antecedents_medicaux })
                });
                showToast('Informations mises à jour', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de la mise à jour', 'error');
            }
        });
    }

    // 2. Modifier le risque
    const updateRisqueBtn = overlay.querySelector('#updateRisqueBtn');
    if (updateRisqueBtn) {
        updateRisqueBtn.addEventListener('click', async () => {
            const niveau_risque = overlay.querySelector('#risqueSelect').value;
            const grossesseId = updateRisqueBtn.dataset.grossesse;
            try {
                await fetch(`${API_URL}/api/grossesses/${grossesseId}/risque`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ niveau_risque })
                });
                showToast('Risque mis à jour', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de la mise à jour du risque', 'error');
            }
        });
    }

    // 3. Créer admission
    const createAdmissionBtn = overlay.querySelector('#createAdmissionBtn');
    if (createAdmissionBtn) {
        createAdmissionBtn.addEventListener('click', async () => {
            const workspaceId = overlay.querySelector('#workspaceSelect').value;
            try {
                await fetch(`${API_URL}/api/admissions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ patiente_id: data.patientId, workspace_id: workspaceId })
                });
                showToast('Admission créée', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de la création de l\'admission', 'error');
            }
        });
    }

    // 4. Clore admission
    const closeAdmissionBtn = overlay.querySelector('#closeAdmissionBtn');
    if (closeAdmissionBtn) {
        closeAdmissionBtn.addEventListener('click', async () => {
            if (!confirm('Clôturer cette admission ?')) return;
            try {
                await fetch(`${API_URL}/api/admissions/${data.activeAdmission.id_admission}/close`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ motif_sortie: 'Fin de séjour' })
                });
                showToast('Admission clôturée', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de la clôture de l\'admission', 'error');
            }
        });
    }

    // 5. Ajouter constantes
    const ajoutConstBtn = overlay.querySelector('#ajouterConstanteBtn');
    if (ajoutConstBtn) {
        ajoutConstBtn.addEventListener('click', async () => {
            const payload = {
                patiente_id: data.patientId,
                date_heure: new Date().toISOString(),
                tension_systolique: overlay.querySelector('#taSys').value || null,
                tension_diastolique: overlay.querySelector('#taDia').value || null,
                frequence_cardiaque_mere: overlay.querySelector('#pouls').value || null,
                temperature: overlay.querySelector('#temperature').value || null,
                dilatation_col: overlay.querySelector('#dilatation').value || null,
                frequence_cardiaque_foetale: overlay.querySelector('#rcf').value || null,
                contractions_par_10min: overlay.querySelector('#contractions').value || null
            };
            try {
                const res = await fetch(`${API_URL}/api/constantes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Constantes ajoutées', 'success');
                    closeModal();
                    showPatientDetails(data.patientId);
                } else {
                    const err = await res.json();
                    showToast('Erreur : ' + (err.error || 'Échec de l\'ajout'), 'error');
                }
            } catch (err) {
                showToast('Erreur de connexion', 'error');
            }
        });
    }

    // 6. Prescrire
    const prescrireBtn = overlay.querySelector('#prescrireBtn');
    if (prescrireBtn) {
        prescrireBtn.addEventListener('click', async () => {
            const contenu = overlay.querySelector('#newOrdonnance').value.trim();
            if (!contenu) {
                showToast('Veuillez saisir une prescription', 'error');
                return;
            }
            try {
                await fetch(`${API_URL}/api/ordonnances`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ patiente_id: data.patientId, contenu })
                });
                showToast('Ordonnance ajoutée', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de l\'ajout de l\'ordonnance', 'error');
            }
        });
    }

    // 7. Accouchement - afficher formulaire
    const addAccBtn = overlay.querySelector('#addAccouchementBtn');
    if (addAccBtn) {
        addAccBtn.addEventListener('click', () => {
            const formDiv = overlay.querySelector('#accouchementForm');
            formDiv.style.display = formDiv.style.display === 'none' ? 'block' : 'none';
        });
    }

    // 8. Accouchement - sauvegarder
    const saveAccBtn = overlay.querySelector('#saveAccouchementBtn');
    if (saveAccBtn && data.admissionId) {
        saveAccBtn.addEventListener('click', async () => {
            const typeAcc = overlay.querySelector('#typeAccouchement').value;
            const duree = overlay.querySelector('#dureeTravail').value;
            try {
                await fetch(`${API_URL}/api/accouchements`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        admission_id: data.admissionId,
                        grossesse_id: null,
                        type_accouchement: typeAcc,
                        date_heure_accouchement: new Date().toISOString(),
                        duree_travail_minutes: duree,
                        patiente_id: data.patientId
                    })
                });
                showToast('Accouchement enregistré', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de l\'enregistrement de l\'accouchement', 'error');
            }
        });
    }

    // 9. Assigner lit
    const assignLitBtn = overlay.querySelector('#assignLitBtn');
    if (assignLitBtn) {
        assignLitBtn.addEventListener('click', async () => {
            const litId = overlay.querySelector('#litSelect').value;
            if (!litId) {
                showToast('Choisissez un lit', 'error');
                return;
            }
            try {
                await fetch(`${API_URL}/api/admissions/${assignLitBtn.dataset.admission}/lit`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ lit_id: litId })
                });
                showToast('Lit assigné', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de l\'assignation du lit', 'error');
            }
        });
    }

    // 10. Libérer lit
    const freeLitBtn = overlay.querySelector('#freeLitBtn');
    if (freeLitBtn && freeLitBtn.dataset.lit) {
        freeLitBtn.addEventListener('click', async () => {
            if (!confirm('Libérer ce lit ?')) return;
            try {
                await fetch(`${API_URL}/api/lits/${freeLitBtn.dataset.lit}/free`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                showToast('Lit libéré', 'success');
                closeModal();
                showPatientDetails(data.patientId);
            } catch (err) {
                showToast('Erreur lors de la libération du lit', 'error');
            }
        });
    }
}

function closeModal() {
    const overlay = document.getElementById('patientModal');
    if (overlay) overlay.remove();
}

// Recherche
searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return loadPatients();
    try {
        const url = query.startsWith('LOT-') ? `${API_URL}/api/search/lot/${query}` : `${API_URL}/api/patients/search?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const results = await res.json();
        if (results.length) displayPatients(results);
        else patientList.innerHTML = '<div class="empty-state">Aucun résultat</div>';
    } catch (err) {
        patientList.innerHTML = '<div class="empty-state">Erreur recherche</div>';
    }
});

searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBtn.click(); });
if (localStorage.getItem('token')) token = localStorage.getItem('token');