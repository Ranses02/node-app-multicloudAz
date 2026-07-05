require('dotenv').config();
const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// Conexión directa usando tus variables del .env
const AZURE_CONNECTION_STRING = process.env.AZURE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || 'imagenes-productos';

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

// Servir el HTML y CSS directo desde la carpeta raíz
app.use(express.static(__dirname));

// API que lista las imágenes que tienes arriba en Azure
app.get('/api/productos', async (req, res) => {
    try {
        const productos = [];
        for await (const blob of containerClient.listBlobsFlat()) {
            productos.push({
                nombre: blob.name,
                url: `/imagen/${encodeURIComponent(blob.name)}` // Ruta que formatea la imagen
            });
        }
        res.json(productos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error con Azure" });
    }
});

// El parámetro mágico que descarga cualquier formato de Azure y obliga al navegador a pintarlo
app.get('/imagen/:nombre', async (req, res) => {
    try {
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

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});