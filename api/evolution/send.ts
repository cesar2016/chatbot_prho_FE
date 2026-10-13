import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, message, tenant_id } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (phone, message)' });
  }

  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
  const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';

  const cleanTenantId = String(tenant_id || '1').replace(/[^a-zA-Z0-9_]/g, '_');
  const instanceName = `hotel_${cleanTenantId}`;

  // Clean phone number: remove non-digits
  const cleanPhone = String(phone).replace(/\D/g, '');

  try {
    // 1. Send text message via Evolution API
    const response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: message
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Evolution API Send Error:', errText);
      return res.status(response.status).json({ error: 'Error enviando mensaje via Evolution API', details: errText });
    }

    const data = await response.json();

    // 2. Ensure tenant record has this instanceName registered
    if (tenant_id) {
      await supabaseAdmin.from('tenants').update({ kapso_phone_number_id: instanceName }).eq('id', tenant_id);
    }

    // 3. Save outbound message to Supabase
    const { error: dbError } = await supabaseAdmin.rpc('save_whatsapp_message', {
      p_phone: cleanPhone,
      p_name: 'Asistente PrHo',
      p_text: message,
      p_is_bot: true,
      p_phone_number_id: instanceName
    });

    if (dbError) {
      console.error('Error guardando mensaje saliente en Supabase:', dbError);
    }

    return res.status(200).json({ status: 'success', data });

  } catch (error: any) {
    console.error('Evolution Send Exception:', error);
    return res.status(500).json({ error: error.message });
  }
}
