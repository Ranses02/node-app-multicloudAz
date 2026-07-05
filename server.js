require('dotenv').config();
const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 5000;

const AZURE_CONNECTION_STRING = process.env.AZURE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || 'imagenes-productos';

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// Diccionario dinámico para los precios de tus productos
const misPrecios = {
    "monitorMSI.png": 249990
};

// 1. API que lista productos
app.get('/api/productos', async (req, res) => {
    try {
        if (!AZURE_CONNECTION_STRING) {
            return res.json([{ nombre: "Falta AZURE_CONNECTION_STRING en .env", url: "" }]);
        }
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const productos = [];

        for await (const blob of containerClient.listBlobsFlat()) {
            const nombreArchivo = blob.name;
            const nombreLimpio = nombreArchivo.split('.')[0];
            const precioFinal = misPrecios[nombreArchivo] !== undefined ? misPrecios[nombreArchivo] : 99990;

            productos.push({
                nombre: nombreLimpio,
                precio: precioFinal,
                url: `/imagen/${encodeURIComponent(nombreArchivo)}`
            });
        }
        res.json(productos);
    } catch (error) {
        res.json([]);
    }
});

// 2. API que recibe el "Nombre" e "Imagen" del formulario y lo sube directo
app.post('/api/subir', upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio } = req.body;
        const file = req.file;

        if (!file || !nombre) {
            return res.status(400).send("Faltan datos obligatorios del producto.");
        }

        // Obtener la extensión original (.png, .jpg, etc.)
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Creamos el nombre del archivo final usando el texto del campo "Nombre"
        const nombreArchivoFinal = `${nombre.trim()}${ext}`;

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blobClient = containerClient.getBlockBlobClient(nombreArchivoFinal);

        // Subir los bytes a Azure Blob Storage
        await blobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype }
        });

        // Guardamos el precio asociado al nombre final del archivo
        if (precio) {
            misPrecios[nombreArchivoFinal] = parseInt(precio);
        }

        res.redirect('/');
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Error al subir el producto.");
    }
});

// 3. Proxy formateador
app.get('/imagen/:nombre', async (req, res) => {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blobClient = containerClient.getBlobClient(req.params.nombre);
        const downloadBlockBlobResponse = await blobClient.download(0);
        
        const ext = path.extname(req.params.nombre).toLowerCase();
        let contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.gif') contentType = 'image/gif';
        if (ext === '.webp') contentType = 'image/webp';

        res.setHeader('Content-Type', contentType);
        downloadBlockBlobResponse.readableStreamBody.pipe(res);
    } catch (e) {
        res.status(404).send("No encontrada");
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});