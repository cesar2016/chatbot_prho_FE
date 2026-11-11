import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, message, mediaUrl, mediaType, tenant_id } = req.body;

  if (!phone || (!message && !mediaUrl)) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (phone y message o mediaUrl)' });
  }

  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
  const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';

  const cleanTenantId = String(tenant_id || '1').replace(/[^a-zA-Z0-9_]/g, '_');
  const instanceName = `hotel_${cleanTenantId}`;

  // Clean phone number: remove non-digits
  const cleanPhone = String(phone).replace(/\D/g, '');

  try {
    let response;

    // 1. Envío de Audio
    if (mediaUrl && mediaType === 'audio') {
      response = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: cleanPhone,
          audio: mediaUrl
        })
      });

      // Fallback a sendMedia si sendWhatsAppAudio requiere otro formato
      if (!response.ok) {
        response = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': evoKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            number: cleanPhone,
            mediatype: 'audio',
            media: mediaUrl
          })
        });
      }
    } 
    // 2. Envío de Imagen
    else if (mediaUrl && mediaType === 'image') {
      response = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: cleanPhone,
          mediatype: 'image',
          media: mediaUrl,
          caption: message || ''
        })
      });
    } 
    // 3. Envío de Texto tradicional
    else {
      response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
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
    }

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
    return res.status(200).json({ status: 'success', data });

  } catch (error: any) {
    console.error('Evolution Send Exception:', error);
    return res.status(500).json({ error: error.message });
  }
}
