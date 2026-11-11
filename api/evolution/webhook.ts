import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

// Helper para obtener Base64 de media desde Evolution API
async function getMediaBase64(
  msg: any,
  instance: string,
  evoUrl: string,
  evoKey: string,
  convertToMp4 = false
): Promise<{ base64: string; mimetype: string } | null> {
  // 1. Verificar si viene incluido directamente en el mensaje
  if (msg.base64) {
    const mime = msg.message?.audioMessage?.mimetype || msg.message?.imageMessage?.mimetype || 'application/octet-stream';
    return { base64: String(msg.base64).replace(/^data:.*?;base64,/, ''), mimetype: mime };
  }
  if (msg.message?.base64) {
    const mime = msg.message?.audioMessage?.mimetype || msg.message?.imageMessage?.mimetype || 'application/octet-stream';
    return { base64: String(msg.message.base64).replace(/^data:.*?;base64,/, ''), mimetype: mime };
  }

  // 2. Solicitar base64 a Evolution API
  try {
    const res = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msg, convertToMp4 })
    });

    if (res.ok) {
      const data: any = await res.json();
      if (data?.base64) {
        return {
          base64: String(data.base64).replace(/^data:.*?;base64,/, ''),
          mimetype: data.mimetype || msg.message?.audioMessage?.mimetype || msg.message?.imageMessage?.mimetype || 'application/octet-stream'
        };
      }
    } else {
      const errTxt = await res.text();
      console.warn('getBase64FromMediaMessage warning:', res.status, errTxt);
    }
  } catch (err) {
    console.error('Error fetching media base64 from Evolution API:', err);
  }
  return null;
}

// Helper para transcribir audio con Groq Whisper
async function transcribeAudio(base64: string, mimetype: string, groqKey: string): Promise<string | null> {
  try {
    const clean = base64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const form = new FormData();
    const ext = mimetype.includes('ogg') ? 'ogg' : (mimetype.includes('mp4') || mimetype.includes('m4a')) ? 'm4a' : 'mp3';
    form.append('file', new Blob([buffer], { type: mimetype || 'audio/ogg' }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: form
    });

    if (res.ok) {
      const data: any = await res.json();
      return data.text?.trim() || null;
    } else {
      const err = await res.text();
      console.error('Groq Whisper error:', err);
    }
  } catch (err) {
    console.error('Exception transcribing audio with Groq:', err);
  }
  return null;
}

// Helper para interpretar imagen con Groq Vision (qwen/qwen3.8-27b)
async function interpretImage(base64: string, caption: string, groqKey: string): Promise<string | null> {
  try {
    const clean = base64.replace(/^data:.*?;base64,/, '');
    const promptText = caption
      ? `El cliente de un hotel envió una imagen por WhatsApp con el siguiente comentario: "${caption}". Analiza detalladamente la imagen, describe qué muestra y extrae cualquier texto o dato relevante (por ejemplo, si es un comprobante de pago/transferencia, extrae monto, fecha, destinatario y número de comprobante; si es una foto de una habitación, consulta, tarjeta o documento, extrae los datos clave):`
      : `El cliente de un hotel envió una imagen por WhatsApp. Analiza detalladamente la imagen, describe qué muestra y extrae cualquier texto o dato relevante (por ejemplo, si es un comprobante de pago/transferencia, extrae monto, fecha, destinatario y número de comprobante; si es una foto de una habitación, consulta o documento, extrae los datos clave):`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${clean}` } }
            ]
          }
        ]
      })
    });

    if (res.ok) {
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } else {
      const err = await res.text();
      console.error('Groq Vision error:', err);
    }
  } catch (err) {
    console.error('Exception interpreting image with Groq:', err);
  }
  return null;
}

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

    const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
    const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';
    const groqKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

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

      const isAudio = !!(msg.message?.audioMessage);
      const isImage = !!(msg.message?.imageMessage);
      const rawText = msg.message?.conversation 
        || msg.message?.extendedTextMessage?.text 
        || msg.message?.imageMessage?.caption 
        || msg.message?.videoMessage?.caption 
        || '';

      let textToSave = rawText;
      let queryForRAG = rawText;
      let mediaType: 'text' | 'audio' | 'image' = 'text';
      let publicMediaUrl = '';
      let mediaMetadata: any = null;

      // 🎙️ Procesamiento de Audio (Voz / WhatsApp Audio)
      if (isAudio && groqKey) {
        console.log(`🎙️ Procesando audio entrante de ${senderName} (${fromPhone})...`);
        const media = await getMediaBase64(msg, instance, evoUrl, evoKey, true);
        if (media?.base64) {
          try {
            const clean = media.base64.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(clean, 'base64');
            const ext = (media.mimetype && (media.mimetype.includes('mp4') || media.mimetype.includes('m4a'))) 
              ? 'm4a' 
              : (media.mimetype && media.mimetype.includes('mp3')) 
                ? 'mp3' 
                : 'ogg';
            const audioPath = `audios/${Date.now()}_${fromPhone}.${ext}`;
            await supabaseAdmin.storage.from('chat-media').upload(audioPath, buffer, {
              contentType: media.mimetype || (ext === 'm4a' ? 'audio/mp4' : 'audio/ogg'),
              upsert: true
            });
            const supUrl = process.env.VITE_SUPABASE_URL || 'https://mtkzkuspevnytwuflfts.supabase.co';
            publicMediaUrl = `${supUrl}/storage/v1/object/public/chat-media/${audioPath}`;
            mediaType = 'audio';
          } catch (storageErr) {
            console.error('Error subiendo audio a storage:', storageErr);
          }

          const transcription = await transcribeAudio(media.base64, media.mimetype, groqKey);
          if (transcription) {
            queryForRAG = transcription;
            mediaMetadata = null;
            console.log(`✅ Audio procesado para sugerencia RAG (no transcrito en chat): "${transcription.substring(0, 80)}..."`);
          } else {
            queryForRAG = 'El cliente envió una nota de voz.';
          }
          textToSave = publicMediaUrl || `🎙️ [Nota de voz recibida]`;
        } else {
          textToSave = `🎙️ [Nota de voz recibida]`;
          queryForRAG = 'El cliente envió una nota de voz.';
        }
      } 
      // 📷 Procesamiento de Imagen (Foto / Comprobante / Voucher)
      else if (isImage && groqKey) {
        console.log(`📷 Procesando imagen entrante de ${senderName} (${fromPhone})...`);
        const media = await getMediaBase64(msg, instance, evoUrl, evoKey);
        const caption = msg.message?.imageMessage?.caption || '';
        if (media?.base64) {
          try {
            const clean = media.base64.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(clean, 'base64');
            const ext = (media.mimetype && media.mimetype.includes('png')) ? 'png' : 'jpg';
            const imgPath = `images/${Date.now()}_${fromPhone}.${ext}`;
            await supabaseAdmin.storage.from('chat-media').upload(imgPath, buffer, {
              contentType: media.mimetype || 'image/jpeg',
              upsert: true
            });
            const supUrl = process.env.VITE_SUPABASE_URL || 'https://mtkzkuspevnytwuflfts.supabase.co';
            publicMediaUrl = `${supUrl}/storage/v1/object/public/chat-media/${imgPath}`;
            mediaType = 'image';
          } catch (storageErr) {
            console.error('Error subiendo imagen a storage:', storageErr);
          }

          const interpretation = await interpretImage(media.base64, caption, groqKey);
          if (interpretation) {
            queryForRAG = caption ? `${caption}. ${interpretation}` : interpretation;
            mediaMetadata = caption ? { caption } : null;
            console.log(`✅ Imagen procesada para sugerencia RAG (no transcrita en chat): "${interpretation.substring(0, 80)}..."`);
          } else {
            queryForRAG = caption || 'El cliente envió una imagen.';
            mediaMetadata = caption ? { caption } : null;
          }
          textToSave = publicMediaUrl || (caption ? `📷 [Imagen]: "${caption}"` : `📷 [Imagen recibida]`);
        } else {
          textToSave = caption ? `📷 [Imagen]: "${caption}"` : `📷 [Imagen recibida]`;
          queryForRAG = caption || 'El cliente envió una imagen.';
        }
      }

      if (!textToSave.trim()) continue;

      console.log(`📩 Mensaje procesado de ${senderName} (${fromPhone}): ${textToSave.substring(0, 80)}... | Instancia: ${instance}`);

      // 1. Guardar mensaje en Supabase vía RPC atómica
      const { data: dbData, error: dbError } = await supabaseAdmin.rpc('save_whatsapp_message', {
        p_phone: fromPhone,
        p_name: senderName,
        p_text: textToSave,
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

      // Si es audio o imagen, actualizar message_type, content con la URL pública y metadata
      if (msgId && (mediaType === 'audio' || mediaType === 'image') && publicMediaUrl) {
        await supabaseAdmin.from('messages').update({
          message_type: mediaType,
          content: publicMediaUrl,
          metadata: mediaMetadata
        }).eq('id', msgId);
      }

      // Asegurar el tenant_id en conversations y messages para Realtime
      if (convId && resolvedTenantId) {
        await supabaseAdmin.from('conversations').update({ tenant_id: resolvedTenantId }).eq('id', convId);
        if (msgId) {
          await supabaseAdmin.from('messages').update({ tenant_id: resolvedTenantId }).eq('id', msgId);
        }
      }

      // 2. Generación automática de Sugerencia IA en segundo plano (RAG)
      if (convId && msgId && queryForRAG) {
        try {
          const voyageKey = process.env.VITE_VOYAGE_API_KEY || process.env.VOYAGE_API_KEY;

          if (voyageKey && groqKey) {
            // A. Embeddings con Voyage AI (con reintento si 429)
            let voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${voyageKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ input: [queryForRAG], model: 'voyage-2' })
            });

            if (voyageRes.status === 429) {
              await new Promise(r => setTimeout(r, 6000));
              voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${voyageKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ input: [queryForRAG], model: 'voyage-2' })
              });
            }

            let contextBlock = 'No hay información adicional en la base de conocimiento.';

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

                if (docs && docs.length > 0) {
                  contextBlock = docs.map((d: any, i: number) => `[Fragmento ${i + 1}]\n${d.content}`).join('\n\n');
                }
              }
            }

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
                    content: `Eres el asistente virtual del hotel. El cliente te contactó por WhatsApp (puede haber enviado un texto, un audio transcripto o una imagen/comprobante analizado). Responde usando SOLO la información del contexto de conocimiento provisto. Si la pregunta no tiene respuesta en el contexto, dilo amablemente sin inventar. Si envió un comprobante o consulta de reserva, respóndele de forma atenta y profesional.\n\n=== CONOCIMIENTO DEL HOTEL ===\n${contextBlock}\n=== FIN DEL CONOCIMIENTO ===\n\nResponde en el mismo idioma que el usuario.`
                  },
                  { role: 'user', content: queryForRAG }
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

                // Si la conversación está en modo 'BOT', responder directamente a WhatsApp
                const { data: convInfo } = await supabaseAdmin
                  .from('conversations')
                  .select('mode')
                  .eq('id', convId)
                  .single();

                if (convInfo?.mode === 'BOT') {
                  console.log(`🤖 Modo BOT activo: Enviando respuesta a WhatsApp (${fromPhone})...`);
                  await fetch(`${evoUrl}/message/sendText/${instance}`, {
                    method: 'POST',
                    headers: {
                      'apikey': evoKey,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      number: fromPhone,
                      text: suggestion
                    })
                  });

                  await supabaseAdmin.from('messages').insert([{
                    conversation_id: convId,
                    sender_type: 'bot',
                    sender_id: 'bot',
                    message_type: 'text',
                    content: suggestion,
                    tenant_id: resolvedTenantId
                  }]);

                  await supabaseAdmin.from('conversations').update({
                    last_message_at: new Date().toISOString()
                  }).eq('id', convId);
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
