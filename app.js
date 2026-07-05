require('dotenv').config();
const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

const AZURE_CONNECTION_STRING = process.env.AZURE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || 'imagenes-productos';

// Servir el HTML estático
app.use(express.static(__dirname));

// API súper protegida para detectar el error exacto
app.get('/api/productos', async (req, res) => {
    try {
        if (!AZURE_CONNECTION_STRING) {
            return res.json([{ nombre: "Falta la variable en el .env", url: "https://picsum.photos/800/600" }]);
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const productos = [];

        for await (const blob of containerClient.listBlobsFlat()) {
            productos.push({
                nombre: blob.name,
                url: `/imagen/${encodeURIComponent(blob.name)}`
            });
        }
        
        res.json(productos);
    } catch (error) {
        console.error("ERROR DETECTADO:", error.message);
        // Si Azure falla, le enviamos el error al HTML en formato de producto para que lo leas en pantalla
        res.json([{
            nombre: `Error de Azure: ${error.message}`,
            url: "https://picsum.photos/800/600"
        }]);
    }
});

// Proxy para forzar el formato
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

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});