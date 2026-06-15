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

// Liste publique des patientes
app.get('/api/patients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vue_patiente_public ORDER BY nom');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail patiente (protégé)
app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await pool.query('SELECT * FROM vue_soignant_restreint WHERE id_patiente = $1', [id]);
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

// Upload par patiente (avec code dossier)
app.post('/api/upload/:codeDossier', upload.single('document'), async (req, res) => {
  const { codeDossier } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé' });
  try {
    const patient = await pool.query('SELECT id_patiente FROM patiente WHERE numero_dossier = $1', [codeDossier]);
    if (patient.rows.length === 0) return res.status(404).json({ error: 'Code dossier invalide' });
    await pool.query(
      `INSERT INTO document_medical (patiente_id, titre, chemin_fichier, type_mime, taille_octets, upload_par_patiente, est_valide)
       VALUES ($1, $2, $3, $4, $5, true, true)`,
      [patient.rows[0].id_patiente, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
    );
    res.json({ message: 'Document uploadé avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
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
// CONSTANTES VITALES 

// Récupérer les constantes d'une admission
app.get('/api/constantes/admission/:admissionId', authenticateToken, async (req, res) => {
    const { admissionId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM constante_vitale WHERE admission_id = $1 ORDER BY date_heure DESC`,
            [admissionId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Ajouter une nouvelle mesure de constantes
app.post('/api/constantes', authenticateToken, async (req, res) => {
    const { admission_id, date_heure, tension_systolique, tension_diastolique,
            frequence_cardiaque_mere, frequence_respiratoire, temperature,
            saturation_o2, dilatation_col, contractions_par_10min,
            frequence_cardiaque_foetale, ocytocine_dose, anesthesie_type, notes } = req.body;
    if (!admission_id || !date_heure) {
        return res.status(400).json({ error: 'admission_id et date_heure requis' });
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
            [admission_id, req.user.id, date_heure, tension_systolique, tension_diastolique,
             frequence_cardiaque_mere, frequence_respiratoire, temperature, saturation_o2,
             dilatation_col, contractions_par_10min, frequence_cardiaque_foetale,
             ocytocine_dose, anesthesie_type, notes]
        );
        res.status(201).json({ id_constante: result.rows[0].id_constante, message: 'Mesure ajoutée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ORDONNANCES ==========

// Récupérer les ordonnances d'une patiente
app.get('/api/ordonnances/patient/:patienteId', authenticateToken, async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM ordonnance WHERE patiente_id = $1 ORDER BY date_prescription DESC`,
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer une ordonnance (soignant)
app.post('/api/ordonnances', authenticateToken, async (req, res) => {
    const { patiente_id, grossesse_id, contenu, valide_jusqua } = req.body;
    if (!patiente_id || !contenu) {
        return res.status(400).json({ error: 'patiente_id et contenu requis' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO ordonnance (patiente_id, grossesse_id, personnel_id, contenu, valide_jusqua)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_ordonnance`,
            [patiente_id, grossesse_id || null, req.user.id, contenu, valide_jusqua || null]
        );
        res.status(201).json({ id_ordonnance: result.rows[0].id_ordonnance, message: 'Ordonnance créée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== ACCOUCHEMENTS & NOUVEAU-NÉS ==========

// Récupérer les accouchements d'une patiente (via ses admissions)
app.get('/api/accouchements/patient/:patienteId', authenticateToken, async (req, res) => {
    const { patienteId } = req.params;
    try {
        const result = await pool.query(
            `SELECT a.*, ad.numero_dossier, ad.nom, ad.prenom
             FROM accouchement a
             JOIN admission adm ON a.admission_id = adm.id_admission
             JOIN patiente ad ON adm.patiente_id = ad.id_patiente
             WHERE ad.id_patiente = $1
             ORDER BY a.date_heure_accouchement DESC`,
            [patienteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer les nouveau-nés d'un accouchement
app.get('/api/accouchements/:id/newborns', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM nouveau_ne WHERE accouchement_id = $1 ORDER BY numero_gemeau ASC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer un accouchement (avec nouveau-nés)
app.post('/api/accouchements', authenticateToken, async (req, res) => {
    const { admission_id, grossesse_id, type_accouchement, date_heure_accouchement,
            duree_travail_minutes, complications, notes_postpartum, nouveau_nes } = req.body;
    if (!admission_id || !grossesse_id || !type_accouchement || !date_heure_accouchement) {
        return res.status(400).json({ error: 'admission_id, grossesse_id, type_accouchement, date_heure_accouchement requis' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const accRes = await client.query(
            `INSERT INTO accouchement 
             (admission_id, grossesse_id, personnel_responsable_id, type_accouchement,
              date_heure_accouchement, duree_travail_minutes, complications, notes_postpartum)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_accouchement`,
            [admission_id, grossesse_id, req.user.id, type_accouchement,
             date_heure_accouchement, duree_travail_minutes || null, complications || null, notes_postpartum || null]
        );
        const accId = accRes.rows[0].id_accouchement;
        // Insertion des nouveau-nés
        if (nouveau_nes && Array.isArray(nouveau_nes)) {
            for (const nn of nouveau_nes) {
                await client.query(
                    `INSERT INTO nouveau_ne 
                     (accouchement_id, mere_id, sexe, date_heure_naissance, poids_grammes,
                      taille_cm, perimetre_cranien_cm, apgar_1min, apgar_5min, apgar_10min,
                      est_gemeau, numero_gemeau, etat_sante, notes_pediatriques)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                    [accId, req.body.patiente_id, nn.sexe, nn.date_heure_naissance, nn.poids_grammes,
                     nn.taille_cm, nn.perimetre_cranien_cm, nn.apgar_1min, nn.apgar_5min, nn.apgar_10min,
                     nn.est_gemeau || false, nn.numero_gemeau || null, nn.etat_sante || 'bon', nn.notes_pediatriques || null]
                );
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ id_accouchement: accId, message: 'Accouchement enregistré' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        client.release();
    }
});

// ========== RECHERCHE AVANCÉE (mot‑clé) ==========
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

// ========== GESTION DES LITS ==========
// Liste des lits d'un workspace
app.get('/api/lits/workspace/:workspaceId', authenticateToken, async (req, res) => {
    const { workspaceId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM lit WHERE workspace_id = $1 ORDER BY numero_lit`,
            [workspaceId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Assigner un lit à une admission
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
// Démarrer le serveur
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`🚀 Serveur API démarré sur http://localhost:${PORT}`);
  console.log(`   GET /api/health`);
  console.log(`   GET /api/patients`);
  console.log(`   GET /api/patients/:id`);
  console.log(`   GET /api/workspaces/:id/patients`);
  console.log(`   GET /api/search/lot/:numero_lot`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/upload/:codeDossier`);
  console.log(`   GET /api/constantes/admission/:admissionId`);
  console.log(`   POST /api/constantes`);
  console.log(`   GET /api/ordonnances/patient/:patienteId`);
  console.log(`   POST /api/ordonnances`);
  console.log(`   GET /api/accouchements/patient/:patienteId`);
  console.log(`   GET /api/accouchements/:id/newborns`);
  console.log(`   POST /api/accouchements`);
  console.log(`   GET /api/patients/search?q=...`);
  console.log(`   GET /api/lits/workspace/:workspaceId`);
  console.log(`   PATCH /api/admissions/:id/lit`);
  console.log(`   POST /api/documents (protégé JWT)`);
});