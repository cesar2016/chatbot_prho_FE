import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = req.query.tenant_id as string;
  if (!tenantId) {
    return res.status(400).json({ error: 'Falta tenant_id' });
  }

  // KAPSO_API_KEY must be configured in Vercel Environment Variables
  const kapsoApiKey = process.env.KAPSO_API_KEY;
  if (!kapsoApiKey) {
    return res.status(500).json({ error: 'Servidor no tiene KAPSO_API_KEY configurada.' });
  }

  try {
    // 1. Obtener el Customer ID principal del proyecto (requerido por Kapso)
    const customersResponse = await fetch('https://api.kapso.ai/platform/v1/customers', {
      headers: { 'X-API-Key': kapsoApiKey }
    });
    const customersData = await customersResponse.json();
    const customerId = customersData?.data?.[0]?.id;

    if (!customerId) {
        return res.status(500).json({ error: 'No se encontró un Customer_ID válido en tu cuenta Kapso.' });
    }

    // 2. LLamada a la API de Kapso para inicializar un celular en modo coexistencia (Dispositivo Vinculado)
    const url = `https://api.kapso.ai/platform/v1/customers/${customerId}/setup_links`;
    
    // Payload of setup_links
    const payload = {
      setup_link: {
         allowed_connection_types: ["coexistence"]
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': kapsoApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Kapso API Error:', errText);
      return res.status(response.status).json({ error: 'Error de Kapso', details: errText });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error: any) {
    console.error('Kapso Setup Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
