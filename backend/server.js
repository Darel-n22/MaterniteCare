require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Servir les fichiers uploadés (pour les visualiser/télécharger)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Clé secrète JWT
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Middleware d'authentification
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Accès non autorisé' });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide ou expiré' });
        req.user = user;
        next();
    });
}

// Connexion PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.connect((err) => {
    if (err) return console.error('❌ Erreur de connexion à PostgreSQL :', err.stack);
    console.log('✅ Connecté à PostgreSQL');
});

// Configuration multer pour l'upload
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Type de fichier non autorisé'), false);
};

const upload = multer({ storage, fileFilter });

// ========== ROUTES ==========

// Santé
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'API MaterniteCare avec PostgreSQL' });
});

// Liste publique des patientes (portail patient)
app.get('/api/patients', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM patiente ORDER BY nom');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Détail patiente (PROTÉGÉ – pour les soignants) avec grossesses et admissions
app.get('/api/patients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const patient = await pool.query('SELECT * FROM patiente WHERE id_patiente = $1', [id]);
        if (patient.rows.length === 0) return res.status(404).json({ error: 'Patiente non trouvée' });
        const grossesses = await pool.query('SELECT * FROM grossesse WHERE patiente_id = $1', [id]);
        const admissions = await pool.query('SELECT * FROM admission WHERE patiente_id = $1 ORDER BY date_admission DESC', [id]);
        res.json({
            patiente: patient.rows[0],
            grossesses: grossesses.rows,
            admissions: admissions.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Détail patiente (PUBLIC – pour le portail patient) sans données sensibles
app.get('/api/patient/public/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const patient = await pool.query('SELECT id_patiente, numero_dossier, nom, prenom, date_naissance, quartier, telephone, adresse, groupe_sanguin, antecedents_medicaux, allergies, date_premiere_consultation FROM patiente WHERE id_patiente = $1', [id]);
        if (patient.rows.length === 0) return res.status(404).json({ error: 'Patiente non trouvée' });
        res.json(patient.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route protégée pour les soignants (avec risque + statut admission)
app.get('/api/soignant/patients', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id_patiente, p.numero_dossier, p.nom, p.prenom, 
                p.date_naissance, p.telephone, p.quartier,
                g.niveau_risque, g.terme_actuel_sa,
                a.statut_admission, a.est_critique
            FROM patiente p
            LEFT JOIN grossesse g ON g.patiente_id = p.id_patiente AND g.statut = 'en_cours'
            LEFT JOIN admission a ON a.patiente_id = p.id_patiente AND a.date_sortie IS NULL
            ORDER BY p.nom
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Patientes d'un workspace (protégé)
app.get('/api/workspaces/:id/patients', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                p.id_patiente, p.numero_dossier, p.nom, p.prenom, p.date_naissance, p.quartier,
                g.niveau_risque, g.terme_actuel_sa,
                a.statut_admission, a.est_critique
            FROM patiente p
            LEFT JOIN grossesse g ON g.patiente_id = p.id_patiente AND g.statut = 'en_cours'
            LEFT JOIN admission a ON a.patiente_id = p.id_patiente AND a.date_sortie IS NULL
            WHERE a.workspace_id = $1 OR EXISTS (SELECT 1 FROM admission WHERE patiente_id = p.id_patiente AND workspace_id = $1)
            ORDER BY a.est_critique DESC, g.niveau_risque DESC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Recherche par lot de vaccin (protégé)
app.get('/api/search/lot/:numero_lot', authenticateToken, async (req, res) => {
    const { numero_lot } = req.params;
    try {
        const result = await pool.query(`
            SELECT DISTINCT p.id_patiente, p.nom, p.prenom, p.numero_dossier, p.quartier,
                            v.type_vaccin, v.date_vaccination, v.numero_lot
            FROM vaccination v
            JOIN patiente p ON p.id_patiente = v.patiente_id
            WHERE v.numero_lot = $1
            ORDER BY p.nom
        `, [numero_lot]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ALERTES ==========

// Récupérer toutes les alertes non traitées (pour le soignant)
app.get('/api/alertes/non-traitees', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, p.nom, p.prenom, p.numero_dossier
            FROM alertes a
            JOIN patiente p ON p.id_patiente = a.patiente_id
            WHERE a.statut = 'non_traitee'
            ORDER BY a.priorite DESC, a.date_creation DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer les alertes d'une patiente
app.get('/api/alertes/patient/:patienteId', authenticateToken, async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM alertes WHERE patiente_id = $1 ORDER BY date_creation DESC',
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Traiter une alerte
app.patch('/api/alertes/:id/traiter', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { notes_traitement } = req.body;
    try {
        await pool.query(
            `UPDATE alertes SET statut = 'traitee', notes_traitement = $1 WHERE id_alerte = $2`,
            [notes_traitement || 'Traitée par le soignant', id]
        );
        res.json({ message: 'Alerte traitée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route de login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    try {
        const user = await pool.query('SELECT * FROM personnel_soignant WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ error: 'Identifiants invalides' });
        const personnel = user.rows[0];
        const validPassword = await bcrypt.compare(password, personnel.mot_de_passe_hash);
        if (!validPassword) return res.status(401).json({ error: 'Identifiants invalides' });
        const token = jwt.sign(
            { id: personnel.id_personnel, email: personnel.email, role: personnel.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        res.json({
            token,
            user: {
                id: personnel.id_personnel,
                nom: personnel.nom,
                prenom: personnel.prenom,
                email: personnel.email,
                role: personnel.role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Upload par patiente (avec code dossier) + alerte automatique
app.post('/api/upload/:codeDossier', upload.single('document'), async (req, res) => {
    const { codeDossier } = req.params;
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
    }
    const typeDocument = req.body.type_document || 'autre';
    try {
        const patient = await pool.query('SELECT id_patiente FROM patiente WHERE numero_dossier = $1', [codeDossier]);
        if (patient.rows.length === 0) {
            return res.status(404).json({ error: 'Code dossier invalide' });
        }
        const result = await pool.query(
            `INSERT INTO document_medical 
             (patiente_id, titre, chemin_fichier, type_mime, taille_octets, upload_par_patiente, est_valide, type_document)
             VALUES ($1, $2, $3, $4, $5, true, true, $6)
             RETURNING id_document`,
            [patient.rows[0].id_patiente, req.file.originalname, req.file.path, req.file.mimetype, req.file.size, typeDocument]
        );
        const docId = result.rows[0].id_document;

        // Créer une alerte pour la sage-femme
        await pool.query(
            `INSERT INTO alertes (patiente_id, type_alerte, description, document_id, priorite)
             VALUES ($1, 'nouveau_document', $2, $3, 'normale')`,
            [patient.rows[0].id_patiente, `Nouveau document uploadé : ${req.file.originalname}`, docId]
        );

        res.json({ message: 'Document uploadé avec succès', documentId: docId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur : ' + err.message });
    }
});

// Upload par soignant (protégé)
app.post('/api/documents', authenticateToken, upload.single('document'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé' });
    const { patienteId } = req.body;
    if (!patienteId) return res.status(400).json({ error: 'ID patiente requis' });
    try {
        const patient = await pool.query('SELECT id_patiente FROM patiente WHERE id_patiente = $1', [patienteId]);
        if (patient.rows.length === 0) return res.status(404).json({ error: 'Patiente non trouvée' });
        await pool.query(
            `INSERT INTO document_medical (patiente_id, personnel_id, titre, chemin_fichier, type_mime, taille_octets, upload_par_patiente, est_valide)
             VALUES ($1, $2, $3, $4, $5, $6, false, true)`,
            [patienteId, req.user.id, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
        );
        res.json({ message: 'Document ajouté au dossier patient' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Rendez-vous d'une patiente (portail)
app.get('/api/rendezvous/patient/:patienteId', async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM rendez_vous WHERE patiente_id = $1 ORDER BY date_heure DESC',
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Vaccinations d'une patiente
app.get('/api/vaccinations/patient/:patienteId', async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM vaccination WHERE patiente_id = $1 ORDER BY date_vaccination DESC',
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Documents d'une patiente
app.get('/api/documents/patient/:patienteId', async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM document_medical WHERE patiente_id = $1 ORDER BY date_upload DESC',
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== CONSTANTES VITALES ==========

// Récupérer les constantes d'une admission
app.get('/api/constantes/admission/:admissionId', authenticateToken, async (req, res) => {
    const { admissionId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM constante_vitale WHERE admission_id = $1 ORDER BY date_heure DESC',
            [admissionId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Ajouter des constantes (avec détection d'alerte hypertension)
app.post('/api/constantes', authenticateToken, async (req, res) => {
    const { patiente_id, admission_id, date_heure, tension_systolique, tension_diastolique,
            frequence_cardiaque_mere, frequence_respiratoire, temperature,
            saturation_o2, dilatation_col, contractions_par_10min,
            frequence_cardiaque_foetale, ocytocine_dose, anesthesie_type, notes } = req.body;

    if (!patiente_id && !admission_id) {
        return res.status(400).json({ error: 'patiente_id ou admission_id requis' });
    }

    let targetAdmissionId = admission_id;
    let targetPatienteId = patiente_id;

    // Si on a patiente_id mais pas admission_id, on crée une admission "consultation externe"
    if (!targetAdmissionId && targetPatienteId) {
        const newAdm = await pool.query(
            `INSERT INTO admission (patiente_id, workspace_id, motif, statut_admission, date_admission)
             VALUES ($1, (SELECT id_workspace FROM workspace WHERE type = 'consultations_prenatales' LIMIT 1), 'Consultation externe', 'observation', NOW())
             RETURNING id_admission`,
            [targetPatienteId]
        );
        targetAdmissionId = newAdm.rows[0].id_admission;
    }

    // Si on a admission_id, on récupère la patiente_id
    if (!targetPatienteId && targetAdmissionId) {
        const pat = await pool.query('SELECT patiente_id FROM admission WHERE id_admission = $1', [targetAdmissionId]);
        targetPatienteId = pat.rows[0].patiente_id;
    }

    try {
        const result = await pool.query(
            `INSERT INTO constante_vitale 
             (admission_id, personnel_id, date_heure, tension_systolique, tension_diastolique,
              frequence_cardiaque_mere, frequence_respiratoire, temperature, saturation_o2,
              dilatation_col, contractions_par_10min, frequence_cardiaque_foetale,
              ocytocine_dose, anesthesie_type, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id_constante`,
            [targetAdmissionId, req.user.id, date_heure, tension_systolique, tension_diastolique,
             frequence_cardiaque_mere, frequence_respiratoire, temperature, saturation_o2,
             dilatation_col, contractions_par_10min, frequence_cardiaque_foetale,
             ocytocine_dose, anesthesie_type, notes]
        );
        const constId = result.rows[0].id_constante;

        // Détection d'alerte : hypertension (TA ≥ 140/90)
        if (tension_systolique >= 140 || tension_diastolique >= 90) {
            await pool.query(
                `INSERT INTO alertes (patiente_id, type_alerte, description, constante_id, priorite)
                 VALUES ($1, 'hypertension', $2, $3, 'eleve')`,
                [targetPatienteId, `TA ${tension_systolique}/${tension_diastolique} mmHg - Hypertension détectée`, constId]
            );
        }

        res.status(201).json({ id_constante: constId, message: 'Mesure ajoutée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ORDONNANCES ==========
app.get('/api/ordonnances/patient/:patienteId', authenticateToken, async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM ordonnance WHERE patiente_id = $1 ORDER BY date_prescription DESC',
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/ordonnances', authenticateToken, async (req, res) => {
    const { patiente_id, contenu } = req.body;
    if (!patiente_id || !contenu) {
        return res.status(400).json({ error: 'patiente_id et contenu requis' });
    }
    try {
        await pool.query(
            `INSERT INTO ordonnance (patiente_id, personnel_id, contenu)
             VALUES ($1, $2, $3)`,
            [patiente_id, req.user.id, contenu]
        );
        res.status(201).json({ message: 'Ordonnance créée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ACCOUCHEMENTS ==========
app.get('/api/accouchements/patient/:patienteId', authenticateToken, async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            `SELECT a.* FROM accouchement a
             JOIN admission adm ON a.admission_id = adm.id_admission
             WHERE adm.patiente_id = $1
             ORDER BY a.date_heure_accouchement DESC`,
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/accouchements', authenticateToken, async (req, res) => {
    const { admission_id, grossesse_id, type_accouchement, date_heure_accouchement,
            duree_travail_minutes, patiente_id } = req.body;
    if (!admission_id || !type_accouchement || !date_heure_accouchement) {
        return res.status(400).json({ error: 'admission_id, type_accouchement, date_heure_accouchement requis' });
    }
    try {
        await pool.query(
            `INSERT INTO accouchement (admission_id, grossesse_id, personnel_responsable_id, type_accouchement, date_heure_accouchement, duree_travail_minutes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [admission_id, grossesse_id || null, req.user.id, type_accouchement, date_heure_accouchement, duree_travail_minutes || null]
        );
        res.status(201).json({ message: 'Accouchement enregistré' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== LITS ==========
app.get('/api/lits/workspace/:workspaceId', authenticateToken, async (req, res) => {
    const { workspaceId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM lit WHERE workspace_id = $1 ORDER BY numero_lit', [workspaceId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.patch('/api/admissions/:id/lit', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { lit_id } = req.body;
    if (!lit_id) return res.status(400).json({ error: 'lit_id requis' });
    try {
        await pool.query('UPDATE admission SET lit_id = $1 WHERE id_admission = $2', [lit_id, id]);
        res.json({ message: 'Lit assigné' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.patch('/api/lits/:id/free', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE lit SET est_disponible = true WHERE id_lit = $1', [id]);
        res.json({ message: 'Lit libéré' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== PATIENTE ==========
app.patch('/api/patients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { quartier, telephone, adresse, antecedents_medicaux } = req.body;
    try {
        await pool.query(
            `UPDATE patiente SET 
                quartier = COALESCE($1, quartier),
                telephone = COALESCE($2, telephone),
                adresse = COALESCE($3, adresse),
                antecedents_medicaux = COALESCE($4, antecedents_medicaux)
             WHERE id_patiente = $5`,
            [quartier, telephone, adresse, antecedents_medicaux, id]
        );
        res.json({ message: 'Patiente mise à jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== GROSSESSE ==========
app.patch('/api/grossesses/:id/risque', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { niveau_risque } = req.body;
    if (!['normal', 'modere', 'eleve'].includes(niveau_risque)) {
        return res.status(400).json({ error: 'niveau_risque invalide' });
    }
    try {
        await pool.query('UPDATE grossesse SET niveau_risque = $1 WHERE id_grossesse = $2', [niveau_risque, id]);
        res.json({ message: 'Risque mis à jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ADMISSIONS ==========
app.post('/api/admissions', authenticateToken, async (req, res) => {
    const { patiente_id, workspace_id, motif } = req.body;
    if (!patiente_id || !workspace_id) {
        return res.status(400).json({ error: 'patiente_id et workspace_id requis' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO admission (patiente_id, workspace_id, motif, statut_admission, date_admission)
             VALUES ($1, $2, $3, 'observation', NOW()) RETURNING id_admission`,
            [patiente_id, workspace_id, motif || 'Admission standard']
        );
        res.status(201).json({ id_admission: result.rows[0].id_admission });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.patch('/api/admissions/:id/close', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { motif_sortie } = req.body;
    try {
        await pool.query(
            `UPDATE admission SET date_sortie = NOW(), statut_admission = 'sortie_autorisee', notes_cliniques = $1
             WHERE id_admission = $2`,
            [motif_sortie || 'Sortie standard', id]
        );
        res.json({ message: 'Admission clôturée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== RECHERCHE ==========
app.get('/api/patients/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === '') {
        return res.status(400).json({ error: 'Paramètre de recherche requis' });
    }
    const searchTerm = `%${q.trim()}%`;
    try {
        const result = await pool.query(
            `SELECT DISTINCT p.*, g.niveau_risque, g.terme_actuel_sa, a.statut_admission
             FROM patiente p
             LEFT JOIN grossesse g ON g.patiente_id = p.id_patiente AND g.statut = 'en_cours'
             LEFT JOIN admission a ON a.patiente_id = p.id_patiente AND a.date_sortie IS NULL
             WHERE p.nom ILIKE $1 OR p.prenom ILIKE $1 OR p.numero_dossier ILIKE $1
                OR p.quartier ILIKE $1 OR g.pathologies_actives ILIKE $1
             ORDER BY p.nom`,
            [searchTerm]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer un rendez-vous (PUBLIC – pour la patiente)
app.post('/api/rendezvous', async (req, res) => {
    const { patiente_id, date_heure, type_rdv, notes } = req.body;
    if (!patiente_id || !date_heure || !type_rdv) {
        return res.status(400).json({ error: 'patiente_id, date_heure et type_rdv requis' });
    }
    try {
        // Récupérer un personnel soignant par défaut (ou assigner automatiquement)
        const personnel = await pool.query('SELECT id_personnel FROM personnel_soignant LIMIT 1');
        const workspace = await pool.query('SELECT id_workspace FROM workspace WHERE type = \'consultations_prenatales\' LIMIT 1');
        const result = await pool.query(
            `INSERT INTO rendez_vous (patiente_id, personnel_id, workspace_id, date_heure, type_rdv, statut, notes)
             VALUES ($1, $2, $3, $4, $5, 'planifie', $6)
             RETURNING id_rdv`,
            [patiente_id, personnel.rows[0].id_personnel, workspace.rows[0].id_workspace, date_heure, type_rdv, notes || null]
        );
        res.status(201).json({ id_rdv: result.rows[0].id_rdv, message: 'Rendez-vous créé' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer les alertes d'une patiente (PUBLIC – pour le portail)
app.get('/api/patient/alertes/:codeDossier', async (req, res) => {
    const { codeDossier } = req.params;
    try {
        const patient = await pool.query('SELECT id_patiente FROM patiente WHERE numero_dossier = $1', [codeDossier]);
        if (patient.rows.length === 0) return res.status(404).json({ error: 'Code dossier invalide' });
        const result = await pool.query(
            'SELECT * FROM alertes WHERE patiente_id = $1 ORDER BY date_creation DESC',
            [patient.rows[0].id_patiente]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== EXPORT PDF ==========
const PDFDocument = require('pdfkit');

app.get('/api/patients/:id/pdf', async (req, res) => {
    const { id } = req.params;
    const token = req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        // Vérifier le token
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded) {
            return res.status(403).json({ error: 'Token invalide' });
        }

        const patient = await pool.query('SELECT * FROM patiente WHERE id_patiente = $1', [id]);
        if (patient.rows.length === 0) return res.status(404).json({ error: 'Patiente non trouvée' });
        const grossesses = await pool.query('SELECT * FROM grossesse WHERE patiente_id = $1', [id]);
        const admissions = await pool.query('SELECT * FROM admission WHERE patiente_id = $1 ORDER BY date_admission DESC', [id]);
        const ordonnances = await pool.query('SELECT * FROM ordonnance WHERE patiente_id = $1 ORDER BY date_prescription DESC', [id]);
        const accouchements = await pool.query('SELECT * FROM accouchement a JOIN admission adm ON a.admission_id = adm.id_admission WHERE adm.patiente_id = $1', [id]);

        const p = patient.rows[0];
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=dossier_${p.numero_dossier}.pdf`);
        doc.pipe(res);

        // En-tête
        doc.fontSize(18).text('MaterniteCare - Dossier Patient', { align: 'center' });
        doc.moveDown();

        // Identité
        doc.fontSize(14).text('Identité', { underline: true });
        doc.fontSize(11).text(`Nom : ${p.nom} ${p.prenom}`);
        doc.text(`Date de naissance : ${new Date(p.date_naissance).toLocaleDateString()}`);
        doc.text(`Quartier : ${p.quartier || 'Non renseigné'}`);
        doc.text(`Dossier n° : ${p.numero_dossier}`);
        doc.moveDown();

        // Grossesses
        if (grossesses.rows.length) {
            doc.fontSize(14).text('Grossesses', { underline: true });
            grossesses.rows.forEach(g => {
                doc.fontSize(11).text(`- Terme : ${g.terme_actuel_sa || '?'} SA - Risque : ${g.niveau_risque || 'normal'}`);
            });
            doc.moveDown();
        }

        // Admissions
        if (admissions.rows.length) {
            doc.fontSize(14).text('Admissions', { underline: true });
            admissions.rows.forEach(a => {
                doc.fontSize(11).text(`- ${new Date(a.date_admission).toLocaleDateString()} : ${a.motif || 'Motif non précisé'}`);
            });
            doc.moveDown();
        }

        // Ordonnances
        if (ordonnances.rows.length) {
            doc.fontSize(14).text('Ordonnances', { underline: true });
            ordonnances.rows.forEach(o => {
                doc.fontSize(11).text(`- ${new Date(o.date_prescription).toLocaleDateString()} : ${o.contenu}`);
            });
            doc.moveDown();
        }

        // Accouchements
        if (accouchements.rows.length) {
            doc.fontSize(14).text('Accouchements', { underline: true });
            accouchements.rows.forEach(a => {
                doc.fontSize(11).text(`- ${new Date(a.date_heure_accouchement).toLocaleDateString()} : ${a.type_accouchement}`);
            });
            doc.moveDown();
        }

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`🚀 Serveur API démarré sur http://localhost:${PORT}`);
    console.log(`   GET /api/health`);
    console.log(`   GET /api/patients`);
    console.log(`   GET /api/patients/:id (protégé)`);
    console.log(`   GET /api/patient/public/:id (public)`);
    console.log(`   GET /api/soignant/patients (protégé)`);
    console.log(`   GET /api/workspaces/:id/patients (protégé)`);
    console.log(`   GET /api/search/lot/:numero_lot (protégé)`);
    console.log(`   POST /api/auth/login`);
    console.log(`   POST /api/upload/:codeDossier`);
    console.log(`   POST /api/documents (protégé)`);
    console.log(`   GET /api/rendezvous/patient/:patienteId`);
    console.log(`   GET /api/vaccinations/patient/:patienteId`);
    console.log(`   GET /api/documents/patient/:patienteId (public)`);
    console.log(`   GET /api/constantes/admission/:admissionId (protégé)`);
    console.log(`   POST /api/constantes (protégé)`);
    console.log(`   GET /api/ordonnances/patient/:patienteId (protégé)`);
    console.log(`   POST /api/ordonnances (protégé)`);
    console.log(`   GET /api/accouchements/patient/:patienteId (protégé)`);
    console.log(`   POST /api/accouchements (protégé)`);
    console.log(`   GET /api/patients/search?q= (protégé)`);
    console.log(`   GET /api/lits/workspace/:workspaceId (protégé)`);
    console.log(`   PATCH /api/admissions/:id/lit (protégé)`);
    console.log(`   PATCH /api/lits/:id/free (protégé)`);
    console.log(`   PATCH /api/grossesses/:id/risque (protégé)`);
    console.log(`   PATCH /api/patients/:id (protégé)`);
    console.log(`   POST /api/admissions (protégé)`);
    console.log(`   PATCH /api/admissions/:id/close (protégé)`);
    console.log(`   GET /api/alertes/non-traitees (protégé)`);
    console.log(`   GET /api/alertes/patient/:patienteId (protégé)`);
    console.log(`   PATCH /api/alertes/:id/traiter (protégé)`);
    console.log(`   POST /api/rendezvous (public)`);
});