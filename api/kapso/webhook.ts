import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Manejo de verificación (Challenge)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Aquí puedes validar tu propio verify_token si lo deseas
    if (mode && token) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Falta Token' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('🟢 Webhook Kapso Recibido:', JSON.stringify(payload, null, 2));

    const entries = payload?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};
        
        if (!value.messages) continue;

        const phoneNumberId = value.metadata?.phone_number_id;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;

          const fromPhone = msg.from;
          const text = msg.text.body;

          // Busca el nombre del remitente (si viene en el webhook)
          const contact = value.contacts?.find((c: any) => c.wa_id === fromPhone) || value.contacts?.[0];
          const senderName = contact?.profile?.name || 'Usuario';

          // Invocar el procedimiento de la Base de Datos que tenías (save_whatsapp_message)
          const { data: dbData, error: dbError } = await supabaseAdmin.rpc('save_whatsapp_message', {
            p_phone: fromPhone,
            p_name: senderName,
            p_text: text,
            p_is_bot: false,
            p_phone_number_id: phoneNumberId
          });

          if (dbError) {
            console.error('❌ Error Supabase RPC:', dbError);
            continue;
          }

          console.log('✅ Mensaje guardado:', dbData);
          
          // Opcional: Podríamos disparar el RAG aquí haciendo un fetch a nuestro backend de IA.
          // Pero la inserción ya activa Realtime.
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
