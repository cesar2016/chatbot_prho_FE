import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = (req.body?.tenant_id || req.query?.tenant_id || '1') as string;
  const instanceName = `hotel_${String(tenantId).replace(/[^a-zA-Z0-9_]/g, '_')}`;

  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-a710d.up.railway.app';
  const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';

  try {
    // 1. Desconectar / Cerrar sesión en Evolution API
    const logoutRes = await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json'
      }
    });

    let logoutData: any = null;
    try {
      logoutData = await logoutRes.json();
    } catch {
      // Ignorar si no devuelve JSON
    }

    // 2. Limpiar el teléfono en la base de datos de Supabase para este tenant
    const tenantIdNum = parseInt(tenantId, 10);
    if (!isNaN(tenantIdNum)) {
      await supabaseAdmin
        .from('tenants')
        .update({ phone: null })
        .eq('id', tenantIdNum);
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp desconectado exitosamente',
      details: logoutData
    });

  } catch (error: any) {
    console.error('Error desconectando WhatsApp:', error);
    return res.status(500).json({ error: error.message });
  }
}
