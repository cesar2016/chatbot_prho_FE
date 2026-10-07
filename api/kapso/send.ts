import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, message, phone_number_id } = req.body;

  if (!phone || !message || !phone_number_id) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  // KAPSO_API_KEY must be configured in Vercel Environment Variables
  const kapsoApiKey = process.env.KAPSO_API_KEY;
  if (!kapsoApiKey) {
    return res.status(500).json({ error: 'Servidor no tiene KAPSO_API_KEY configurada.' });
  }

  try {
    // LLamada a la API de Kapso Proxy (que funciona igual a Meta Cloud API)
    const url = `https://api.kapso.ai/meta/whatsapp/v20.0/${phone_number_id}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kapsoApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Kapso API Send Error:', errText);
      return res.status(response.status).json({ error: 'Error enviando mensaje via Kapso', details: errText });
    }

    const data = await response.json();

    // Insertar el mensaje enviado por el bot/humano en la base de datos de Supabase
    const { error: dbError } = await supabaseAdmin.rpc('save_whatsapp_message', {
      p_phone: phone,
      p_name: 'Asistente PrHo',
      p_text: message,
      p_is_bot: true,
      p_phone_number_id: phone_number_id
    });

    if (dbError) {
       console.error('❌ Error guardando mensaje en Supabase:', dbError);
    }

    return res.status(200).json({ status: 'success', data });

  } catch (error: any) {
    console.error('Kapso Send Exception:', error);
    return res.status(500).json({ error: error.message });
  }
}
