import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const tenantId = (req.query.tenant_id as string) || '1';
  if (!tenantId) {
    return res.status(400).json({ error: 'Falta tenant_id' });
  }

  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
  const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';

  const instanceName = `hotel_${tenantId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  try {
    // 0. Verificar si la instancia ya está conectada activamente
    try {
      const checkRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
        headers: { 'apikey': evoKey }
      });
      if (checkRes.ok) {
        const checkList: any[] = await checkRes.json();
        const existingInst = Array.isArray(checkList)
          ? checkList.find((i: any) => i.name === instanceName) || checkList[0]
          : null;
        if (existingInst && existingInst.connectionStatus === 'open') {
          let rawPhone = existingInst.ownerJid ? existingInst.ownerJid.replace('@s.whatsapp.net', '').replace(/\D/g, '') : '';
          let formattedPhone = rawPhone ? `+${rawPhone}` : null;
          return res.status(200).json({
            instanceName,
            status: 'connected',
            phone: formattedPhone,
            profileName: existingInst.profileName || null,
            message: 'Instancia ya conectada activamente'
          });
        }
      }
    } catch (checkErr) {
      console.warn('Advertencia comprobando estado previo de la instancia:', checkErr);
    }

    // 1. Intentar obtener el QR directamente de la instancia si ya existe
    let connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json'
      }
    });

    let connectData: any = null;
    if (connectRes.ok) {
      connectData = await connectRes.json();
    }

    // 2. Si no existe (404) o da error, creamos la instancia
    if (!connectRes.ok || !connectData?.code) {
      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      });

      const createData: any = await createRes.json();
      
      if (createData?.qrcode?.code || createData?.qrcode?.base64) {
        connectData = createData.qrcode;
      } else {
        // Reintentamos /instance/connect
        connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
          headers: {
            'apikey': evoKey,
            'Content-Type': 'application/json'
          }
        });
        if (connectRes.ok) {
          connectData = await connectRes.json();
        }
      }
    }

    // 3. Configurar automáticamente el webhook en Evolution API
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      const webhookUrl = process.env.APP_URL 
        ? `${process.env.APP_URL.replace(/\/$/, '')}/api/evolution/webhook` 
        : `${proto}://${host}/api/evolution/webhook`;

      await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: true,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE'
            ]
          }
        })
      });

      // Asegurar que el tenant en Supabase tenga registrado este instanceName
      const tenantIdNum = parseInt(tenantId, 10);
      if (!isNaN(tenantIdNum)) {
        await supabaseAdmin
          .from('tenants')
          .update({ kapso_phone_number_id: instanceName })
          .eq('id', tenantIdNum);
      }
    } catch (whErr) {
      console.error('Error registrando webhook en Evolution API:', whErr);
    }

    if (connectData && (connectData.code || connectData.base64)) {
      return res.status(200).json({
        instanceName,
        code: connectData.code,
        base64: connectData.base64,
        pairingCode: connectData.pairingCode
      });
    }

    // Si ya está conectada y no genera QR
    return res.status(200).json({
      instanceName,
      status: connectData?.status || 'connected',
      message: 'Instancia ya conectada o inicializada',
      raw: connectData
    });

  } catch (error: any) {
    console.error('Error conectando a Evolution API:', error);
    return res.status(500).json({ error: error.message });
  }
}
