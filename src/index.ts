// Archivo: index.ts (TypeScript)

// Definición de las interfaces de los Bindings (usa tus nombres de binding)
interface Env {
    DB_HW: D1Database;
    BUCKET_HW: R2Bucket;
}

// Variables globales (Asegúrate de que este ID sea el correcto)
const CLOUDFLARE_ACCOUNT_ID = "bd5ed32b0fb79bff9258f69dcf4e6476";
const R2_ENDPOINT_URL = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET_NAME = "hw-img-th";
const MAX_RECORDS = 16000;

// =========================================================
// LÓGICA DE PROCESAMIENTO Y CONSULTAS
// =========================================================

function processCarData(row: Record<string, any>): Record<string, any> {
    const data = { ...row };
    const imageFilename = data.portada;

    // 1. Construir la URL de la imagen R2
    if (imageFilename) {
        data.portada_url = `${R2_ENDPOINT_URL}/${BUCKET_NAME}/${imageFilename}`;
    } else {
        data.portada_url = null;
    }

    // 2. Limpiar la categoría (Convertir de cadena JSON simple a cadena)
    try {
        if (data.categoria) {
            // Asumiendo que la DB tiene '["TH"]'
            const catList = JSON.parse(data.categoria);
            // Tomamos la primera categoría limpia (ej: "TH")
            data.categoria = catList[0] || null; 
        }
    } catch {}

    return data;
}

// Función de listado masivo
async function getAllCars(env: Env): Promise<Response> {
    const query = `SELECT * FROM HotWheels LIMIT ${MAX_RECORDS}`;
    const result = await env.DB_HW.prepare(query).all();

    if (!result.results || result.results.length === 0) {
        return new Response(JSON.stringify({ error: "No se encontraron registros de Hot Wheels." }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const dataList = result.results.map(processCarData);

    // Devolver la lista completa
    return new Response(JSON.stringify(dataList), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// Función de detalle por ID
async function getCarDetails(modelId: string, env: Env): Promise<Response> {
    const query = "SELECT * FROM HotWheels WHERE id = ?";
    const result = await env.DB_HW.prepare(query).bind(modelId).first();

    if (!result) {
        return new Response(JSON.stringify({ error: `Coche con ID '${modelId}' no encontrado.` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const processedData = processCarData(result);

    return new Response(JSON.stringify(processedData, null, 2), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// =========================================================
// HANDLER PRINCIPAL (PUNTO DE ENTRADA STANDARD DE WORKERS)
// =========================================================

// Exporta la función fetch() para manejar las solicitudes
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        // Obtener los segmentos del path (ej: ['all-models'] o ['modelo', 'ID000209'])
        const pathSegments = url.pathname.split('/').filter(segment => segment);

        try {
            // 1. Manejar la ruta de listado masivo: /all-models
            if (pathSegments.includes('all-models')) {
                return await getAllCars(env);
            }

            // 2. Manejar la ruta de detalle: /modelo/{ID}
            const modeloIndex = pathSegments.indexOf('modelo');
            if (modeloIndex !== -1 && modeloIndex + 1 < pathSegments.length) {
                const modelId = pathSegments[modeloIndex + 1];
                return await getCarDetails(modelId, env);
            }

            // Respuesta por defecto (root / o ruta no reconocida)
            return new Response(JSON.stringify({ 
                message: "Bienvenido a HotWheels API. Usa /all-models para la colección completa o /modelo/{ID} para detalles." 
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
            
        } catch (e) {
            console.error(e);
            return new Response(`Error 500: Fallo interno del Worker.`, { status: 500 });
        }
    },
} satisfies ExportedHandler<Env>;
