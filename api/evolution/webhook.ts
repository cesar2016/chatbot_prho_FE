import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Manejo de verificación básica / health check
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'evolution-webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('🟢 Webhook Evolution API Recibido:', JSON.stringify(payload, null, 2));

    const event = payload?.event || payload?.type || '';
    const instance = payload?.instance || '';

    // Filtrar solo eventos de mensajes entrantes
    const validEvents = ['messages.upsert', 'MESSAGES_UPSERT', 'messages.update', 'MESSAGES_UPDATE'];
    if (event && !validEvents.includes(event)) {
      return res.status(200).json({ status: 'ignored_event', event });
    }

    // Normalizar lista de mensajes de Evolution API
    const rawData = payload?.data;
    const messagesList: any[] = Array.isArray(rawData)
      ? rawData
      : (rawData?.messages ? rawData.messages : (rawData ? [rawData] : []));

    if (messagesList.length === 0) {
      return res.status(200).json({ status: 'no_messages' });
    }

    // Extraer ID de tenant numérico desde el nombre de instancia (ej. "hotel_1")
    const tenantMatch = instance.match(/hotel_(\d+)/);
    const tenantIdFromInstance = tenantMatch ? parseInt(tenantMatch[1], 10) : null;

    // Asegurar que el tenant tenga registrado este instanceName como su kapso_phone_number_id
    if (tenantIdFromInstance) {
      await supabaseAdmin
        .from('tenants')
        .update({ kapso_phone_number_id: instance })
        .eq('id', tenantIdFromInstance);
    }

    for (const msg of messagesList) {
      if (!msg || !msg.key) continue;

      // Descartar mensajes salientes enviados desde el teléfono propio para evitar bucles
      if (msg.key.fromMe) {
        continue;
      }

      const remoteJid = msg.key.remoteJid || '';

      // Ignorar grupos de WhatsApp o estados
      if (remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
        continue;
      }

      const fromPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      if (!fromPhone) continue;

      const senderName = msg.pushName || 'Usuario WhatsApp';

      // Extraer texto del mensaje en cualquiera de sus formatos comunes de Baileys
      const text = msg.message?.conversation 
        || msg.message?.extendedTextMessage?.text 
        || msg.message?.imageMessage?.caption 
        || msg.message?.videoMessage?.caption 
        || '';

      if (!text.trim()) continue;

      console.log(`📩 Mensaje de ${senderName} (${fromPhone}): ${text} | Instancia: ${instance}`);

      // 1. Guardar mensaje en Supabase vía RPC atómica
      const { data: dbData, error: dbError } = await supabaseAdmin.rpc('save_whatsapp_message', {
        p_phone: fromPhone,
        p_name: senderName,
        p_text: text,
        p_is_bot: false,
        p_phone_number_id: instance
      });

      if (dbError) {
        console.error('❌ Error Supabase RPC save_whatsapp_message:', dbError);
        continue;
      }

      console.log('✅ Mensaje guardado en Supabase:', dbData);

      const convId = dbData?.conv_id || dbData?.conversation_id;
      const msgId = dbData?.msg_id || dbData?.message_id;
      const resolvedTenantId = dbData?.tenant_id || tenantIdFromInstance;

      // Si por alguna razón la función no asoció el tenant_id, asegurarlo para Supabase Realtime
      if (convId && resolvedTenantId && !dbData?.tenant_id) {
        await supabaseAdmin.from('conversations').update({ tenant_id: resolvedTenantId }).eq('id', convId);
        if (msgId) {
          await supabaseAdmin.from('messages').update({ tenant_id: resolvedTenantId }).eq('id', msgId);
        }
      }

      // 2. Generación automática de Sugerencia IA en segundo plano (RAG)
      if (convId && msgId) {
        try {
          const voyageKey = process.env.VITE_VOYAGE_API_KEY || process.env.VOYAGE_API_KEY;
          const groqKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

          if (voyageKey && groqKey) {
            // A. Embeddings con Voyage AI
            const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${voyageKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ input: [text], model: 'voyage-2' })
            });

            if (voyageRes.ok) {
              const voyageData: any = await voyageRes.json();
              const vector = voyageData?.data?.[0]?.embedding;

              if (vector) {
                const vectorString = '[' + vector.join(',') + ']';

                // B. Búsqueda semántica en Supabase pgvector
                const { data: docs } = await supabaseAdmin.rpc('match_documents', {
                  query_embedding: vectorString,
                  match_threshold: 0.15,
                  match_count: 3,
                  p_tenant_id: resolvedTenantId || null
                });

                const contextBlock = (docs && docs.length > 0)
                  ? docs.map((d: any, i: number) => `[Fragmento ${i + 1}]\n${d.content}`).join('\n\n')
                  : 'No hay información adicional en la base de conocimiento.';

                // C. Generación de respuesta con Groq LLM
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    model: 'qwen/qwen3.8-27b',
                    temperature: 0.4,
                    max_tokens: 350,
                    messages: [
                      {
                        role: 'system',
                        content: `Eres el asistente virtual del hotel. Responde usando SOLO la información del contexto de conocimiento provisto. Si la pregunta no tiene respuesta en el contexto, dilo amablemente sin inventar. Sé conciso y profesional.\n\n=== CONOCIMIENTO DEL HOTEL ===\n${contextBlock}\n=== FIN DEL CONOCIMIENTO ===\n\nResponde en el mismo idioma que el usuario.`
                      },
                      { role: 'user', content: text }
                    ]
                  })
                });

                if (groqRes.ok) {
                  const groqData: any = await groqRes.json();
                  const suggestion = groqData?.choices?.[0]?.message?.content?.trim();

                  if (suggestion) {
                    await supabaseAdmin.from('ai_suggestions').insert([{
                      message_id: msgId,
                      conversation_id: convId,
                      suggestion: suggestion,
                      tenant_id: resolvedTenantId,
                      status: 'PENDING'
                    }]);
                    console.log(`🤖 Sugerencia IA creada para conversación ${convId}`);
                  }
                }
              }
            }
          }
        } catch (ragError) {
          console.error('Error generando sugerencia IA RAG:', ragError);
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('❌ Webhook Evolution error:', error);
    return res.status(500).json({ error: error.message });
  }
}
