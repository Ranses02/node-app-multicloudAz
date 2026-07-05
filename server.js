require('dotenv').config();
const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
// Usa el puerto 5000 que tienes configurado en tu .env
const PORT = process.env.PORT || 5000;

// Configuración de Azure usando tus variables exactas del .env
const AZURE_CONNECTION_STRING = process.env.AZURE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || 'imagenes-productos';

if (!AZURE_CONNECTION_STRING) {
    console.error("Error: AZURE_CONNECTION_STRING no está definida en el .env");
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

// Servir archivos estáticos (HTML, CSS)
app.use(express.static(path.join(__dirname)));

// Ruta API para obtener todas las imágenes desde el contenedor de Azure
app.get('/api/imagenes', async (req, res) => {
    try {
        const imagenes = [];
        // Listar los blobs dentro del contenedor
        for await (const blob of containerClient.listBlobsFlat()) {
            // Construir la URL pública de cada imagen
            const url = `${containerClient.url}/${blob.name}`;
            imagenes.push({ nombre: blob.name, url: url });
        }
        res.json(imagenes);
    } catch (error) {
        console.error("Error al obtener blobs de Azure:", error);
        res.status(500).json({ error: 'No se pudieron cargar las imágenes de Azure' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});