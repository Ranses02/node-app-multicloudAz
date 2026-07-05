require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Sesiones para el Login
app.use(session({
    secret: 'clave-secreta-inacap',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 600000 } // La sesión expira en 10 minutos
}));

// Servir la carpeta actual (excepto index.html para que no entren directo)
app.use(express.static(path.join(__dirname), { index: false }));

// Credenciales fijas para cumplir la rúbrica (puedes cambiarlas aquí)
const USUARIO_VALIDO = "admin";
const CLAVE_VALIDA = "inacap2026";

// Configuración AWS RDS
const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

// Configuración Azure
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_CONTAINER_NAME);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware para verificar si el alumno está logueado
function verificarAutenticacion(req, res, next) {
    if (req.session.autenticado) {
        return next();
    }
    res.redirect('/login');
}

// Ruta para ver el Login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// API para procesar el formulario de Login
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USUARIO_VALIDO && password === CLAVE_VALIDA) {
        req.session.autenticado = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
});

// Ruta principal protegida (Si no está logueado, rebota al login)
app.get('/', verificarAutenticacion, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API para cerrar sesión
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// APIs Protegidas del Inventario
app.get('/api/productos', verificarAutenticacion, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM productos ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error en AWS RDS');
    }
});

app.post('/api/productos', verificarAutenticacion, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio } = req.body;
        const file = req.file;
        if (!file) return res.status(400).send('Falta la imagen.');

        const blobName = `${Date.now()}-${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(file.buffer, file.buffer.length, {
            blobHTTPHeaders: { blobContentType: file.mimetype }
        });

        const urlImagen = blockBlobClient.url;
        const queryText = 'INSERT INTO productos (nombre, precio, url_imagen) VALUES ($1, $2, $3) RETURNING *';
        const dbResult = await pool.query(queryText, [nombre, precio, urlImagen]);

        res.status(201).json(dbResult.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error Multicloud');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor protegido corriendo en http://localhost:${PORT}`);
});