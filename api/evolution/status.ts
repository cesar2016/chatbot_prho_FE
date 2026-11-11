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
  const instanceName = `hotel_${tenantId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
  const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';

  try {
    const evoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json'
      }
    });

    if (!evoRes.ok) {
      const errText = await evoRes.text();
      return res.status(evoRes.status).json({ error: 'Error consultando Evolution API', details: errText });
    }

    const instances: any[] = await evoRes.json();
    const inst = Array.isArray(instances)
      ? instances.find((i: any) => i.name === instanceName) || instances[0]
      : null;

    if (!inst) {
      return res.status(200).json({
        connected: false,
        phone: null,
        status: 'not_found',
        instanceName
      });
    }

    const isConnected = inst.connectionStatus === 'open';
    let rawPhone = '';
    if (inst.ownerJid) {
      rawPhone = inst.ownerJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    }

    let formattedPhone = null;
    if (rawPhone) {
      if (rawPhone.startsWith('549') && rawPhone.length === 13) {
        formattedPhone = `+${rawPhone.slice(0, 2)} ${rawPhone.slice(2, 3)} ${rawPhone.slice(3, 7)} ${rawPhone.slice(7)}`;
      } else {
        formattedPhone = `+${rawPhone}`;
      }
    }

    // Sincronizar teléfono con la tabla tenants en Supabase
    const tenantIdNum = parseInt(tenantId, 10);
    if (!isNaN(tenantIdNum)) {
      if (isConnected && formattedPhone) {
        await supabaseAdmin
          .from('tenants')
          .update({ phone: formattedPhone, kapso_phone_number_id: instanceName })
          .eq('id', tenantIdNum);
      } else if (!isConnected) {
        await supabaseAdmin
          .from('tenants')
          .update({ phone: null })
          .eq('id', tenantIdNum);
      }
    }

    return res.status(200).json({
      connected: isConnected,
      phone: isConnected ? formattedPhone : null,
      rawPhone: isConnected ? rawPhone : null,
      profileName: inst.profileName || null,
      profilePicUrl: inst.profilePicUrl || null,
      status: inst.connectionStatus || 'close',
      instanceName
    });

  } catch (error: any) {
    console.error('Error en status de Evolution API:', error);
    return res.status(500).json({ error: error.message });
  }
}
