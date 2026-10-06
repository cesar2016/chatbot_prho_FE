import { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, UserCircle2, Bot, Send, User, X,
  Settings, CheckCheck, Clock, Search, Bell, Menu, Sparkles, BookOpen, Database, MessageCircle, Trash2, ChevronLeft, Upload, Power, History, ChevronDown, ChevronRight, Shield
} from 'lucide-react';
import { supabase } from './supabase';
import bcrypt from 'bcryptjs';
import { QRCodeSVG } from 'qrcode.react';

const AVAILABLE_SOUNDS = [
  { id: 'https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.1/sounds/button_tiny.mp3', name: 'Toque Corto y Sutil' },
  { id: 'https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.1/sounds/computer_error.mp3', name: 'Alerta Robótica' }
];
const bellSound = new Audio('https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.1/sounds/bell_ring.mp3');
const AUDIO_PLAYERS: Record<string, HTMLAudioElement> = {};

export default function App() {
  const [activeView, setActiveView] = useState('chat');
  const [historyContacts, setHistoryContacts] = useState<any[]>([]);
  const [expandedContact, setExpandedContact] = useState<number|null>(null);
  const [contactConvs, setContactConvs] = useState<Record<number, any[]>>({});
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Super Admin Config
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPass, setNewTenantPass] = useState('');
  const [adminStatusMsg, setAdminStatusMsg] = useState('');

  const handleCreateTenant = async () => {
    if (!newTenantName || !newTenantEmail || !newTenantPass) {
      setAdminStatusMsg('Por favor completa todos los campos.');
      return;
    }
    setAdminStatusMsg('Creando hotel...');
    try {
      // 1. Crear el Tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert([{ name: newTenantName }])
        .select()
        .single();
        
      if (tenantError) throw tenantError;
      
      const hashedPassword = await bcrypt.hash(newTenantPass, 10);
      
      // 2. Crear el Usuario Agente
      const { error: userError } = await supabase
        .from('users')
        .insert([{
          name: 'Admin ' + newTenantName,
          email: newTenantEmail,
          password: hashedPassword,
          role: 'operator', 
          tenant_id: tenantData.id,
        }]);
        
      if (userError) throw userError;
      
      setAdminStatusMsg(`¡Hotel y usuario creados con éxito! Tu nuevo hotel se llama: ${newTenantName}.`);
      setNewTenantName('');
      setNewTenantEmail('');
      setNewTenantPass('');
    } catch (err: any) {
      setAdminStatusMsg('Error: ' + err.message);
    }
  };

  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = localStorage.getItem('agentSession');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginEmail, setLoginEmail] = useState('agente@hotel.com');
  const [loginPassword, setLoginPassword] = useState('password');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Onboarding
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [onboardingQRUrl, setOnboardingQRUrl] = useState('');

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeConv?.mode, activeView]);

  useEffect(() => {
    const unlockAudio = () => {
      // Play and immediately pause to unlock the audio context for ALL sounds on first interaction
      AVAILABLE_SOUNDS.forEach(snd => {
         if (!AUDIO_PLAYERS[snd.id]) {
           AUDIO_PLAYERS[snd.id] = new Audio(snd.id);
           AUDIO_PLAYERS[snd.id].play().then(() => {
             AUDIO_PLAYERS[snd.id].pause();
           }).catch(()=>{});
         }
      });
      bellSound.play().then(() => {
        bellSound.pause();
        bellSound.currentTime = 0;
      }).catch(() => {});
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    return () => document.removeEventListener('click', unlockAudio);
  }, []);

  const [selectedSoundUrl, setSelectedSoundUrl] = useState(() => localStorage.getItem('chatSound') || AVAILABLE_SOUNDS[0].id);

  const playMessageSound = () => {
    // Read directly from localStorage
    const currentSound = localStorage.getItem('chatSound') || AVAILABLE_SOUNDS[0].id;
    if (AUDIO_PLAYERS[currentSound]) {
       AUDIO_PLAYERS[currentSound].currentTime = 0;
       AUDIO_PLAYERS[currentSound].play().catch((e) => console.error("Error playing sound:", e));
    } else {
       // Fallback if somehow not unlocked
       const fallback = new Audio(currentSound);
       fallback.play().catch(()=>{});
    }
  };

  const playNewChatSound = () => {
    bellSound.currentTime = 0;
    bellSound.play().catch((e) => console.error("Error playing bell sound:", e));
  };

  // Update browser tab title when there are unread messages
  useEffect(() => {
    const totalUnread = Object.keys(unreadCounts)
        .filter(conId => conversations.some(c => c.id == conId))
        .reduce((acc: any, conId: any) => acc + unreadCounts[conId as keyof typeof unreadCounts], 0);
    
    let interval: any;
    if (totalUnread > 0) {
      let isFlashing = false;
      interval = setInterval(() => {
        document.title = isFlashing ? `(${totalUnread}) ¡Nuevo Mensaje!` : 'ChatBot PrHo';
        isFlashing = !isFlashing;
      }, 1000);
    } else {
      document.title = 'ChatBot PrHo';
    }

    return () => {
      if (interval) clearInterval(interval);
      document.title = 'ChatBot PrHo';
    };
  }, [unreadCounts, conversations]);

  // Clear unreads for active conversation when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && activeConv?.id) {
         setUnreadCounts((prev: any) => ({ ...prev, [activeConv.id]: 0 }));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeConv?.id]);

  useEffect(() => {
    if (!currentUser?.tenant_id) return;

    // Supabase Realtime Subscription
    const channel = supabase.channel(`chat_realtime_${currentUser.tenant_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `tenant_id=eq.${currentUser.tenant_id}` }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const isIncoming = payload.new.sender_type !== 'agent' && payload.new.sender_type !== 'bot';
          if (isIncoming) {
            playMessageSound();
            // Increment unread badge if the message is NOT for the currently open conversation, OR if the tab is hidden
            setActiveConv((currentActive: any) => {
              if (document.hidden || !currentActive || currentActive.id !== payload.new.conversation_id) {
                setUnreadCounts((prev: any) => ({
                  ...prev,
                  [payload.new.conversation_id]: (prev[payload.new.conversation_id] || 0) + 1
                }));
              }
              return currentActive; // don't change activeConv
            });
          }
        }
        setRefreshTrigger(t => t + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${currentUser.tenant_id}` }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          playNewChatSound();
        }
        setRefreshTrigger(t => t + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_suggestions', filter: `tenant_id=eq.${currentUser.tenant_id}` }, () => setRefreshTrigger(t => t + 1))
      .subscribe();

    return () => { supabase.removeChannel(channel); }
  }, [currentUser?.tenant_id]);

  useEffect(() => {
    if (currentUser?.tenant_id) fetchData();
    if (activeConv?.id) fetchMessages(activeConv.id);
  }, [refreshTrigger, activeConv?.id, currentUser?.tenant_id]);

  const fetchData = async () => {
    if (!currentUser?.tenant_id) return;
    
    let query = supabase.from('conversations').select('*, contacts(*), messages(content, created_at)').eq('tenant_id', currentUser.tenant_id);
    
    if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
      query = query.or(`assigned_user_id.eq.${currentUser.id},assigned_user_id.is.null`);
    }

    const [convsRes, usersRes] = await Promise.all([
       query,
       supabase.from('users').select('id, name, avatar').eq('tenant_id', currentUser.tenant_id)
    ]);
    
    const convs = convsRes.data;
    const usersData = usersRes.data || [];
      
    if (convs && convs.length > 0) {
      // Ordenar por last_message_at descendente
      convs.sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      const formatted = convs.map(c => {
        // Encontrar el agente asignado
        const assignedAgent = c.assigned_user_id ? usersData.find(u => u.id === c.assigned_user_id) : null;
        // Obtener último mensaje del array de mensajes
        const sortedMsgs = c.messages?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
        const lastMsgDesc = sortedMsgs.length > 0 ? sortedMsgs[0].content : 'Sin mensajes aún';

        return {
          id: c.id,
          name: c.contacts?.name || '',
          phone: c.contacts?.phone || 'Desconocido',
          status: c.status,
          mode: c.mode || 'HUMAN',
          agent: assignedAgent,
          time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
          lastMessage: lastMsgDesc,
          unread: 0
        };
      });
      setConversations(formatted);
      // Actualizar activeConv si ya hay uno seleccionado pero con nuevos datos
      if (activeConv) {
         const updated = formatted.find(f => f.id === activeConv.id);
         if (updated) setActiveConv(updated);
      } else {
         setActiveConv(formatted[0]);
      }
    } else {
      setConversations([]);
      setActiveConv(null);
    }
  };

  const sendToN8n = async (phone: string, text: string) => {
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('VITE_N8N_WEBHOOK_URL no está configurada. El mensaje no se envió a WhatsApp.');
      return;
    }
    
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          message: text,
          phone_number_id: currentUser?.tenantInfo?.kapso_phone_number_id || activeConv?.metadata?.phone_number_id || "", // dynamic from tenant
          meta_access_token: currentUser?.tenantInfo?.meta_access_token || ""
        })
      });
    } catch (error) {
      console.error('Error enviando a n8n:', error);
    }
  };

  const handleSendSuggestion = async () => {
    if (!activeConv || !aiSuggestion || !currentUser) return;
    
    const content = aiSuggestion;

    // Optimistic update: show message immediately in panel
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConv.id,
      sender_type: 'agent',
      sender_id: String(currentUser.id),
      content: content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setAiSuggestion('');
    setActiveConv({ ...activeConv, mode: 'HUMAN', assigned_user_id: currentUser.id });

    // 1. Aprobar sugerencia
    await supabase.from('ai_suggestions')
      .update({ status: 'APPROVED' })
      .eq('conversation_id', activeConv.id)
      .eq('status', 'PENDING');
      
    // 2. Guardar mensaje en Supabase
    const { error: msgError } = await supabase.from('messages')
      .insert([{
        conversation_id: activeConv.id,
        sender_type: 'agent',
        sender_id: String(currentUser.id),
        content: content
      }]);

    if (msgError) {
      console.error('Error guardando sugerencia aprobada:', msgError);
    }
      
    // 3. Cambiar status del chat
    await supabase.from('conversations')
      .update({ mode: 'HUMAN', assigned_user_id: currentUser.id, last_message_at: new Date().toISOString() })
      .eq('id', activeConv.id);

    // 4. Enviar a n8n (WhatsApp)
    await sendToN8n(activeConv.phone, content);

    setRefreshTrigger(t => t + 1);
  };

  const handleDiscardSuggestion = async () => {
    if (!activeConv) return;
    
    await supabase.from('ai_suggestions')
      .update({ status: 'REJECTED' })
      .eq('conversation_id', activeConv.id)
      .eq('status', 'PENDING');

    await supabase.from('conversations')
      .update({ mode: 'HUMAN' })
      .eq('id', activeConv.id);

    setAiSuggestion('');
    setActiveConv({ ...activeConv, mode: 'HUMAN' });
    setRefreshTrigger(t => t + 1);
  };

  const handleTakeChat = async () => {
    if (!activeConv || !currentUser) return;
    await supabase.from('conversations')
      .update({ assigned_user_id: currentUser.id, mode: 'HUMAN' })
      .eq('id', activeConv.id);
    setActiveConv({...activeConv, assigned_user_id: currentUser.id, mode: 'HUMAN', agent: { name: currentUser.name, avatar: currentUser.avatar }});
    setRefreshTrigger(t => t+1);
  };

  const handleSendManualMessage = async () => {
    if (!activeConv || !replyText.trim() || !currentUser) return;
    
    const content = replyText.trim();
    setReplyText('');

    // Optimistic update: show message immediately in the panel
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConv.id,
      sender_type: 'agent',
      sender_id: String(currentUser.id),
      content: content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticMsg]);
    
    const { error: msgError } = await supabase.from('messages')
      .insert([{
        conversation_id: activeConv.id,
        sender_type: 'agent',
        sender_id: String(currentUser.id),
        content: content
      }]);
      
    if (msgError) {
      console.error('Error guardando mensaje manual en Supabase:', msgError);
      // Message already shown optimistically; Supabase persistence failed but UX is intact
    }
      
    await supabase.from('conversations')
      .update({ mode: 'HUMAN', assigned_user_id: currentUser.id, last_message_at: new Date().toISOString() })
      .eq('id', activeConv.id);

    // Enviar mensaje a n8n (WhatsApp)
    await sendToN8n(activeConv.phone, content);

    setActiveConv({ ...activeConv, mode: 'HUMAN', assigned_user_id: currentUser.id });
    setRefreshTrigger(t => t + 1);
  };

  const handleResetChats = async () => {
    if (!window.confirm("🚨 Peligro: ¿Estás súper seguro de que quieres borrar TODOS los chats y volver a cero?")) return;
    
    // Borrar todo forzando la condición (Cascade de PostgreSQL limpiará los mensajes y sugerencias)
    await supabase.from('conversations').delete().neq('id', 0);
    await supabase.from('contacts').delete().neq('id', 0);
    
    setConversations([]);
    setActiveConv(null);
    setMessages([]);
    setAiSuggestion('');
    setRefreshTrigger(t => t+1);
  };



  const fetchMessages = async (convId: number) => {
    const { data: msgs, error: msgsError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (msgsError) {
      console.error('Error fetching messages:', msgsError);
      // Don't wipe existing messages on error — keep what's already displayed
    } else {
      setMessages(msgs || []);
    }
    
    // Suggestion Panel Check
    const { data: suggs, error: suggsError } = await supabase
      .from('ai_suggestions')
      .select('*').eq('conversation_id', convId).eq('status', 'PENDING').order('created_at', { ascending: false }).limit(1);
    
    if (suggsError) {
      console.error('Error fetching suggestions:', suggsError);
      return;
    }

    if (suggs && suggs.length > 0) {
      setAiSuggestion(suggs[0].suggestion);
      setActiveConv((prev: any) => ({...prev, mode: 'AI_SUGGEST'}));
    } else {
      setAiSuggestion('');
      // Only reset AI_SUGGEST mode if we're sure there are no pending suggestions
      setActiveConv((prev: any) => prev?.mode === 'AI_SUGGEST' ? {...prev, mode: 'HUMAN'} : prev);
    }
  };
  
  // Knowledge Base State
  const [knowledgeText, setKnowledgeText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Test Bot Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testMessages, setTestMessages] = useState<{role: string, content: string, isLoading?: boolean}[]>([
    { role: 'bot', content: 'Soy el asistente simulado. ¡Hazme una pregunta sobre las reglas o la disponibilidad del hotel que acabas de cargar!' }
  ]);

  const handleSendTestMessage = async () => {
    if (!testInput.trim()) return;
    
    const userMsg = { role: 'user', content: testInput };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    
    const tempBotMsg = { role: 'bot', content: '💬 Pensando...', isLoading: true };
    setTestMessages(prev => [...prev, tempBotMsg]);

    try {
      // 1. Embed user query with Voyage AI
      const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: [userMsg.content], model: 'voyage-2' })
      });
      const voyageData = await voyageRes.json();
      if (!voyageRes.ok) throw new Error('Error Voyage AI: ' + JSON.stringify(voyageData));
      
      const vectorString = '[' + voyageData.data[0].embedding.join(',') + ']';

      // 2. Retrieve top-3 knowledge chunks from Supabase
      const { data: docs, error } = await supabase
        .rpc('match_documents', {
          query_embedding: vectorString,
          match_threshold: 0.15,
          match_count: 3
        });

      if (error) throw error;

      // 3. Build context block
      const contextBlock = (docs && docs.length > 0)
        ? docs.map((d: any, i: number) => `[Fragmento ${i + 1}]\n${d.content}`).join('\n\n')
        : 'No hay información relevante en la base de conocimiento.';

      // 4. Generate response with Groq LLM
      const groqKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!groqKey) throw new Error('Configurá VITE_GROQ_API_KEY en Vercel → Settings → Environment Variables para activar las respuestas IA.');

      // Include last 6 exchanges as conversation history
      const history = testMessages
        .filter(m => !m.isLoading)
        .slice(-6)
        .map(m => ({ role: m.role === 'bot' ? 'assistant' as const : 'user' as const, content: m.content }));

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
              content: `Eres el asistente virtual del hotel. Responde usando SOLO la información del contexto de conocimiento provisto. Si la pregunta no tiene respuesta en el contexto, dilo amablemente sin inventar. Sé conciso y profesional.

=== CONOCIMIENTO DEL HOTEL ===
${contextBlock}
=== FIN DEL CONOCIMIENTO ===

Responde en el mismo idioma que el usuario.`
            },
            ...history,
            { role: 'user', content: userMsg.content }
          ]
        })
      });

      const groqData = await groqRes.json();
      if (!groqRes.ok) throw new Error('Error Groq: ' + (groqData.error?.message || JSON.stringify(groqData)));

      const botReply = groqData.choices[0]?.message?.content?.trim() || 'Sin respuesta.';
      
      setTestMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { role: 'bot', content: botReply }];
      });

    } catch (e: any) {
      setTestMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { role: 'bot', content: `⚠️ ${e.message || 'Error desconocido'}` }];
      });
    }
  };

  const handleSaveKnowledge = async () => {
    if (!knowledgeText.trim()) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      // 1. Get query embedding from Voyage AI directly (Prototyping)
      const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: [knowledgeText], model: 'voyage-2' })
      });
      
      if (!voyageRes.ok) throw new Error('Error al conectar con VoyageAI');
      const voyageData = await voyageRes.json();
      const vector = voyageData.data[0].embedding;
      const vectorString = '[' + vector.join(',') + ']';

      const { error } = await supabase
        .from('knowledge_documents')
        .insert([
          { content: knowledgeText, embedding: vectorString, tenant_id: currentUser?.tenant_id }
        ]);

      if (error) throw error;
      
      setSaveMessage('¡Conocimiento vectorizado y guardado con éxito!');
      setKnowledgeText('');
    } catch (error) {
      console.error(error);
      setSaveMessage('Error: No se pudo conectar con Supabase o Voyage.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      // Login directo contra Supabase (tabla users)
      const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email, password, avatar, tenant_id, role')
        .eq('email', loginEmail)
        .single();

      if (error || !users) throw new Error('Usuario no encontrado');

      // Verificar password hasheado con bcrypt
      const passwordMatch = await bcrypt.compare(loginPassword, users.password);
      if (!passwordMatch) throw new Error('Contraseña incorrecta');

      let tenantInfo = null;
      if (users.tenant_id) {
        const { data: tenData } = await supabase.from('tenants').select('*').eq('id', users.tenant_id).single();
        tenantInfo = tenData;
      }

      const loggedUser = {
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar || '',
        tenant_id: users.tenant_id,
        role: users.role || 'operator',
        tenantInfo: tenantInfo
      };

      setCurrentUser(loggedUser);
      localStorage.setItem('chatUser', JSON.stringify(loggedUser));
      localStorage.setItem('agentSession', JSON.stringify(loggedUser));
      setProfileName(loggedUser.name);
      setProfileAvatar(loggedUser.avatar);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUpdateProfile = async () => {
     if (!currentUser) return;
     try {
       await supabase.from('users').update({ name: profileName, avatar: profileAvatar }).eq('id', currentUser.id);
       const updatedUser = {...currentUser, name: profileName, avatar: profileAvatar};
       setCurrentUser(updatedUser);
       localStorage.setItem('agentSession', JSON.stringify(updatedUser));
       setIsProfileModalOpen(false);
       setRefreshTrigger(t => t+1);
     } catch (e) {
       console.error(e);
     }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('http://localhost:8001/api/upload-avatar', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setProfileAvatar(data.url);
      } else {
        alert('Error al subir imagen: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al subir imagen');
    } finally {
      setIsUploading(false);
    }
  };

  const fetchHistory = async () => {
    if (!currentUser?.tenant_id) return;
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, phone, conversations(id)')
      .eq('tenant_id', currentUser.tenant_id);
    if (contacts) {
      const formatted = contacts
        .map((c: any) => ({ ...c, conv_count: c.conversations?.length || 0 }))
        .sort((a: any, b: any) => b.conv_count - a.conv_count);
      setHistoryContacts(formatted);
    }
  };

  const handleGenerateOnboarding = async () => {
    setIsOnboardingLoading(true);
    setOnboardingQRUrl('');
    try {
      const tenantId = currentUser?.tenant_id || '';
      const res = await fetch(`https://primary-production-5376d.up.railway.app/webhook/onboarding-link?tenant_id=${tenantId}`);
      if (!res.ok) throw new Error('Error al generar Onboarding');
      const data = await res.json();
      
      // N8N a veces envuelve la respuesta en arrays o en ".data" / ".body"
      const rawData = Array.isArray(data) ? data[0] : data;
      const url = rawData?.data?.url || rawData?.data?.setup_url || rawData?.body?.data?.setup_url || rawData?.setup_url || rawData?.url;
      
      if (!url) {
        console.error("No se encontró URL en el payload de N8N:", data);
        alert("N8N no devolvió una URL válida de Kapso. Revisa la consola.");
        setOnboardingQRUrl(JSON.stringify(data).substring(0, 100)); // Just a fallback to see what arrived
      } else {
        setOnboardingQRUrl(url);
      }
    } catch (e) {
      console.error(e);
      alert('Hubo un error contactando a N8n/Kapso para el link.');
    } finally {
      setIsOnboardingLoading(false);
    }
  };

  const toggleContactHistory = async (contactId: number) => {
    if (expandedContact === contactId) {
      setExpandedContact(null);
      return;
    }
    setExpandedContact(contactId);
    if (contactConvs[contactId]) return; // already loaded

    const { data: convs } = await supabase
      .from('conversations')
      .select('id, status, mode, last_message_at, assigned_user_id, messages(content, sender_type, created_at)')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false });

    const usersRes = await supabase.from('users').select('id, name');
    const users = usersRes.data || [];

    const formatted = (convs || []).map((c: any) => {
      const agent = c.assigned_user_id ? users.find((u: any) => u.id === c.assigned_user_id) : null;
      const sortedMsgs = (c.messages || []).sort((a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return { ...c, messages: sortedMsgs, assigned_agent: agent?.name || null };
    });

    setContactConvs(prev => ({ ...prev, [contactId]: formatted }));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setConversations([]);
    setUnreadCounts({});
    setMessages([]);
    setAiSuggestion('');
    setActiveConv(null);
    localStorage.removeItem('agentSession');
  };

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('https://wallpapers.com/images/hd/whatsapp-chat-background-pf4q86mbbm6t6nvo.jpg')] bg-repeat opacity-[0.03] pointer-events-none"></div>
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md z-10">
          <div className="text-center mb-10">
            <div className="mx-auto flex items-center justify-center mb-4">
              <img src="/favicon.png" alt="Bot" className="w-16 h-16 object-contain drop-shadow-lg" />
            </div>
            <img src="/logo-sidebar.png" alt="PrHo-BOT" className="h-10 object-contain mx-auto drop-shadow-sm" />
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Email</label>
              <input 
                type="email" 
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Contraseña</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                required
              />
            </div>
            {loginError && <p className="text-rose-500 text-sm font-bold bg-rose-50 dark:bg-rose-500/10 p-3 rounded-xl border border-rose-200 dark:border-rose-500/20 text-center animate-pulse">{loginError}</p>}
            <button 
              type="submit" 
              disabled={isLoggingIn}
              className={`w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all text-lg flex items-center justify-center gap-3 ${isLoggingIn ? 'opacity-80 scale-95 cursor-not-allowed' : 'hover:-translate-y-0.5 active:scale-95'}`}
            >
              {isLoggingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Iniciando sesión...
                </>
              ) : "Entrar al Panel"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const visibleUnread = Object.keys(unreadCounts)
    .filter(conId => conversations.some(c => c.id == conId))
    .reduce((acc: any, conId: any) => acc + unreadCounts[conId as keyof typeof unreadCounts], 0);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans overflow-hidden">
      
      {/* Sidebar - Navigation */}
      <div className="w-16 flex-shrink-0 bg-gradient-to-b from-indigo-700 to-purple-800 hidden md:flex flex-col items-center py-6 shadow-xl z-20">
        <div className="bg-white/20 p-1 rounded-xl backdrop-blur-md mb-8 shadow-inner shadow-white/30" title={`Agente: ${currentUser.name}`}>
          <img src="/favicon.png" alt="Bot Logo" className="w-8 h-8 object-cover rounded-lg" />
        </div>
        <div className="flex flex-col gap-6 flex-1 text-indigo-200">
          <button 
            onClick={() => setActiveView('chat')}
            className={`relative p-2 rounded-xl transition ${activeView === 'chat' ? 'text-white bg-white/20 shadow-inner' : 'hover:text-white hover:bg-white/10'}`}>
            <MessageSquare size={24} />
            {visibleUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-900 animate-pulse shadow-md">
                {visibleUnread}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => setActiveView('knowledge')}
            className={`p-2 rounded-xl transition ${activeView === 'knowledge' ? 'text-white bg-white/20 shadow-inner' : 'hover:text-white hover:bg-white/10'}`}>
            <BookOpen size={24} />
          </button>

          <button 
            onClick={() => { setActiveView('history'); fetchHistory(); }}
            className={`p-2 rounded-xl transition ${activeView === 'history' ? 'text-white bg-white/20 shadow-inner' : 'hover:text-white hover:bg-white/10'}`}
            title="Historial">
            <History size={24} />
          </button>

          <button className="p-2 hover:text-white hover:bg-white/10 rounded-xl transition"><Bell size={24} /></button>
        </div>
        <div className="mt-auto flex flex-col items-center gap-4">
          <button onClick={handleLogout} title="Cerrar sesión" className="p-2 text-indigo-300 hover:text-red-400 hover:bg-red-500/20 rounded-xl transition">
            <Power size={24} />
          </button>
          <button 
            onClick={() => setActiveView('settings')}
            className={`p-2 rounded-xl transition shadow ${activeView === 'settings' ? 'text-white bg-white/20 shadow-indigo-500/20' : 'text-indigo-200 hover:text-white hover:bg-white/10'}`}
            title="Configuración"
          >
            <Settings size={24} />
          </button>
          <button onClick={handleResetChats} title="Resetear todo el sistema" className="p-2 text-pink-300 hover:text-white hover:bg-pink-600/50 rounded-xl transition shadow shadow-pink-500/20"><Trash2 size={24} /></button>
        </div>
      </div>

      {activeView === 'chat' ? (
        <>
          {/* Conversations List */}
          <div className={`${isMobileChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-shrink-0 flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-lg z-10`}>
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-700 to-purple-800 md:from-slate-50 md:to-white md:dark:from-slate-900 md:dark:to-slate-950">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="flex items-center gap-3">
                  <img src="/logo-sidebar.png" alt="PrHo-BOT" className="h-8 object-contain drop-shadow-sm brightness-0 invert md:brightness-100 md:invert-0" />
                  {currentUser?.tenantInfo && (
                    <div className="flex flex-col hidden sm:flex">
                      <span className="text-[10px] uppercase font-bold text-indigo-300 md:text-indigo-500 tracking-wider leading-none">
                        {currentUser.tenantInfo.name}
                      </span>
                      <span className="text-xs font-semibold text-white md:text-slate-700 leading-tight">
                        {currentUser.tenantInfo.phone || currentUser.tenantInfo.kapso_phone_number_id || 'Sin número'}
                      </span>
                    </div>
                  )}
                </div>
                <button 
                  className="md:hidden p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  onClick={() => setIsMobileNavOpen(true)}
                >
                  <Menu size={24} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-white/50 md:text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar chats..." 
                  className="w-full bg-white/15 md:bg-slate-100 md:dark:bg-slate-900 border-none rounded-full py-2 pl-10 pr-4 text-white md:text-slate-800 md:dark:text-slate-200 placeholder-white/50 md:placeholder-slate-400 focus:ring-2 focus:ring-white/30 md:focus:ring-purple-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto w-full">
              {conversations.length === 0 && <p className="p-5 text-sm text-slate-500 text-center">No hay conversaciones</p>}
              {conversations.map(conv => {
                const unread = unreadCounts[conv.id] || 0;
                const isActive = activeConv?.id === conv.id;
                return (
                <div 
                  key={conv.id} 
                  onClick={() => {
                    setActiveConv(conv);
                    setIsMobileChatOpen(true);
                    // Clear unread badge on open
                    setUnreadCounts(prev => ({ ...prev, [conv.id]: 0 }));
                  }}
                  className={`p-4 border-b border-slate-50 dark:border-slate-800/50 cursor-pointer transition-all duration-300 relative group
                    ${isActive ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : unread > 0 ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-r shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                  {!isActive && unread > 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-green-500 rounded-r"></div>}
                  
                  <div className="flex justify-between items-start mb-1 px-1">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm border border-white dark:border-slate-700 ${
                        unread > 0 && !isActive 
                          ? 'bg-gradient-to-tr from-emerald-400 to-green-500 text-white' 
                          : 'bg-gradient-to-tr from-blue-100 to-indigo-100 dark:from-slate-800 dark:to-slate-700 text-indigo-700 dark:text-indigo-400'
                      }`}>
                        {conv.name ? conv.name.charAt(0) : '#'}
                      </div>
                      <div>
                        <span className={`${unread > 0 && !isActive ? 'font-extrabold text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                          {conv.name || conv.phone}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full 
                            ${conv.mode === 'AI_SUGGEST' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 
                              conv.mode === 'HUMAN' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 
                              'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-500'}`}>
                            {conv.mode}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-400 font-medium">{conv.time}</span>
                      {unread > 0 && (
                        <span className="bg-gradient-to-r from-emerald-500 to-green-500 text-white text-xs font-bold min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full shadow-md shadow-green-500/40 animate-pulse">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm truncate pl-14 ${unread > 0 && !isActive ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                    {conv.lastMessage}
                  </p>
                </div>
                );
              })}
            </div>
          </div>

          {/* Main Chat Area */}
          {activeConv ? (
          <div className={`${isMobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col relative bg-[#f0f2f5] dark:bg-[#0b141a] pb-16 md:pb-0`}>
            {/* Chat Header */}
            <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-4 md:px-6 shadow-sm z-10 w-full relative">
              <div className="flex items-center gap-3 md:gap-4">
                <button 
                  className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  onClick={() => setIsMobileChatOpen(false)}
                >
                  <ChevronLeft size={24} />
                </button>
                <UserCircle2 size={36} className="text-slate-400" />
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {activeConv.name || activeConv.phone}
                  </h2>
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> En línea
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {activeConv.agent && (
                   <button
                     onClick={() => setIsProfileModalOpen(true)}
                     title="Configurar Perfil"
                     className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 rounded-full shadow-sm border border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer"
                   >
                      <div className="flex -space-x-1">
                         {activeConv.agent.avatar ? (
                            <img src={activeConv.agent.avatar} className="w-6 h-6 rounded-full object-cover border border-white dark:border-slate-800 shadow-sm" alt="Agent" />
                         ) : (
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex justify-center items-center text-[10px] font-bold border border-white shadow-sm">
                               {activeConv.agent.name.charAt(0)}
                            </div>
                         )}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                         {activeConv.agent.name}
                      </span>
                   </button>
                )}
                {(!activeConv.agent || activeConv.agent.id !== currentUser?.id) && (
                  <button onClick={handleTakeChat} className="px-5 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600 text-white rounded-full text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2 transform hover:scale-105 active:scale-95">
                    <User size={16} /> Tomar Chat Manual
                  </button>
                )}
              </div>
            </div>
            
            {/* Chat Background & Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
              <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015] pointer-events-none bg-[url('https://wallpapers.com/images/hd/whatsapp-chat-background-pf4q86mbbm6t6nvo.jpg')] bg-repeat"></div>
              
              <div className="flex justify-center mb-6">
                <span className="text-xs bg-slate-200/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium px-4 py-1.5 rounded-full shadow-sm">
                  Hoy
                </span>
              </div>

              {messages.length === 0 && (
                <div className="text-center text-slate-500 mt-10 text-sm">No hay mensajes cargados para este chat.</div>
              )}

              {messages.map((msg, index) => {
                const isBot = msg.sender_type === 'bot' || msg.sender_type === 'agent';
                return (
                  <div key={msg.id || index} className={`flex ${isBot ? 'justify-end' : 'justify-start'}`}>
                    <div className={`${isBot ? 'bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/60 dark:to-slate-800 border-indigo-50/50' : 'bg-white dark:bg-slate-800'} p-3.5 rounded-2xl ${isBot ? 'rounded-tr-sm' : 'rounded-tl-sm'} w-fit max-w-[75%] shadow hover:shadow-md transition-shadow relative group border dark:border-slate-700/50`}>
                      <p className="text-slate-800 dark:text-slate-200 leading-snug break-words whitespace-pre-wrap">{msg.content}</p>
                      <div className={`flex ${isBot ? 'justify-end' : 'justify-start'} items-center gap-1 mt-1 text-[10px] ${isBot ? 'text-indigo-400' : 'text-slate-400'}`}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''} 
                        {isBot && <CheckCheck size={14} className="text-blue-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Invisible spacer so absolute panel doesn't hide the last message */}
              {activeConv.mode === 'AI_SUGGEST' && (
                <div className="h-[220px] w-full flex-shrink-0"></div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggestion Premium Panel (Glassmorphism) */}
            {activeConv.mode === 'AI_SUGGEST' && (
              <div className="px-6 py-4 absolute bottom-20 left-0 right-0 z-20">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-indigo-100 dark:border-indigo-900/50 p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-1.5 rounded-lg">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-indigo-700 dark:from-purple-400 dark:to-indigo-400 text-sm">
                        Sugerencia IA generada
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-200 dark:border-green-800/50">
                      <Clock size={12} /> 95% Confianza
                    </div>
                  </div>
                  <textarea 
                    className="w-full p-4 border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-slate-50/50 dark:bg-slate-950/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none shadow-inner text-sm leading-relaxed"
                    rows={2}
                    value={aiSuggestion}
                    onChange={(e) => setAiSuggestion(e.target.value)}
                  />
                  <div className="flex gap-3 mt-4">
                    <button onClick={handleSendSuggestion} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold w-full shadow-lg shadow-indigo-500/30 transform hover:-translate-y-0.5 transition-all active:scale-95">
                      <Send size={18} /> Enviar Sugerencia
                    </button>
                    <button onClick={handleDiscardSuggestion} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl font-semibold w-1/3 transition-all active:scale-95 border border-slate-200 dark:border-slate-700">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Reply Input Space */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-3 shadow-ambient relative z-30">
              <button 
                title="Mensaje de Presentación"
                onClick={() => setReplyText(`Hola Soy ${currentUser?.name || 'Agente'} del hotel Colinas, en que puedo ayudarte?`)}
                className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors text-lg"
              >
                👋
              </button>

              <input 
                type="text" 
                placeholder="Escribe un mensaje al cliente..." 
                className="flex-1 px-5 py-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium" 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendManualMessage()}
              />
              <button 
                onClick={handleSendManualMessage}
                className="px-5 p-3 relative group w-14 rounded-2xl flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transform transition-all active:scale-95">
                <Send size={20} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a]">
              <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
                <MessageSquare size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Comienza a chatear</h3>
                <p className="text-slate-500">Selecciona una conversación de la lista lateral o espera nuevos mensajes.</p>
              </div>
            </div>
          )}
        </>
      ) : activeView === 'settings' ? (
        /* SETTINGS VIEW */
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col p-4 pb-20 md:p-12 relative w-full items-center">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
              <Settings className="text-indigo-600 dark:text-indigo-400" size={32} />
              Configuración
            </h2>
            
            <div className="space-y-8">
              {/* Notificaciones */}
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Bell size={20} className="text-indigo-500" />
                  Sonido de Mensajes Nuevos
                </h3>
                <div className="space-y-3">
                  {AVAILABLE_SOUNDS.map(sound => (
                    <label key={sound.id} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors">
                      <input 
                        type="radio" 
                        name="sound" 
                        value={sound.id} 
                        checked={selectedSoundUrl === sound.id}
                        onChange={(e) => {
                          setSelectedSoundUrl(e.target.value);
                          localStorage.setItem('chatSound', e.target.value);
                          const testSound = new Audio(e.target.value);
                          testSound.play().catch(()=>{});
                        }}
                        className="w-5 h-5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{sound.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Super Admin Panel */}
              {currentUser?.role === 'super_admin' && (
                <div className="p-6 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-800/50">
                  <h3 className="text-lg font-bold text-rose-900 dark:text-rose-200 mb-4 flex items-center gap-2">
                    <Shield size={20} className="text-rose-500" />
                    Alta de Nuevo Hotel (Súper Administrador)
                  </h3>
                   <div className="space-y-4">
                     <div>
                       <label className="text-sm font-semibold text-rose-800 dark:text-rose-300">Nombre del Nuevo Hotel</label>
                       <input type="text" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="Ej: Hotel del Mar" className="w-full mt-1 p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-rose-400 text-slate-700 dark:text-slate-200" />
                     </div>
                     <div>
                       <label className="text-sm font-semibold text-rose-800 dark:text-rose-300">Correo del Único Agente Responsable</label>
                       <input type="email" value={newTenantEmail} onChange={e => setNewTenantEmail(e.target.value)} placeholder="admin@hoteldelmar.com" className="w-full mt-1 p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-rose-400 text-slate-700 dark:text-slate-200" />
                     </div>
                     <div>
                       <label className="text-sm font-semibold text-rose-800 dark:text-rose-300">Contraseña Local Inicial</label>
                       <input type="text" value={newTenantPass} onChange={e => setNewTenantPass(e.target.value)} placeholder="123456" className="w-full mt-1 p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-rose-400 text-slate-700 dark:text-slate-200" />
                     </div>
                     <button onClick={handleCreateTenant} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition">
                       Crear Hotel y Generar Accesos
                     </button>
                   </div>
                   {adminStatusMsg && (
                      <p className={`mt-4 text-sm font-bold text-center ${adminStatusMsg.includes('Error') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {adminStatusMsg}
                      </p>
                   )}
                </div>
              )}

            </div>
          </div>
        </div>
      ) : activeView === 'history' ? (
        /* HISTORY VIEW */
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col p-4 pb-20 md:p-12 relative w-full items-center">
          <div className="w-full max-w-4xl">
            <div className="mb-10 text-center">
              <div className="inline-flex items-center justify-center p-4 bg-gradient-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-3xl mb-4 shadow-sm border border-indigo-200 dark:border-indigo-800/50">
                <History size={40} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 tracking-tight">
                Historial de Conversaciones
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg">
                Consulta el historial de chats organizados por cliente.
              </p>
            </div>

            {historyContacts.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No hay historial disponible</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyContacts.map(contact => (
                  <div key={contact.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {/* Contact Row */}
                    <button
                      onClick={() => toggleContactHistory(contact.id)}
                      className="w-full flex items-center justify-between p-5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow">
                          {contact.name ? contact.name.charAt(0).toUpperCase() : '#'}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800 dark:text-slate-200">{contact.name || 'Sin nombre'}</p>
                          <p className="text-sm text-slate-500">{contact.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold px-3 py-1 rounded-full">
                          {contact.conv_count} conversación{contact.conv_count !== 1 ? 'es' : ''}
                        </span>
                        {expandedContact === contact.id ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded Conversations */}
                    {expandedContact === contact.id && (
                      <div className="border-t border-slate-100 dark:border-slate-800">
                        {(contactConvs[contact.id] || []).length === 0 ? (
                          <p className="text-sm text-slate-400 p-5 text-center">Cargando...</p>
                        ) : (
                          (contactConvs[contact.id] || []).map((conv: any) => (
                            <div key={conv.id} className="p-5 border-b last:border-0 border-slate-50 dark:border-slate-800/50">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full 
                                    ${conv.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-500'}`}>
                                    {conv.status}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString('es-ES', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}
                                  </span>
                                </div>
                                {conv.assigned_agent && (
                                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">
                                    Agente: {conv.assigned_agent}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                {(conv.messages || []).map((msg: any, i: number) => (
                                  <div key={i} className={`flex ${msg.sender_type === 'agent' || msg.sender_type === 'bot' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`text-xs px-3 py-2 rounded-xl max-w-[80%] ${
                                      msg.sender_type === 'agent' || msg.sender_type === 'bot'
                                        ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-900 dark:text-indigo-200'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}>
                                      <p>{msg.content}</p>
                                      <span className="text-[10px] opacity-50 mt-0.5 block">{msg.created_at ? new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* KNOWLEDGE BASE VIEW */
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col p-4 pb-20 md:p-12 relative w-full items-center">
          
          <div className="w-full max-w-4xl">
            <div className="mb-10 text-center">
              <div className="inline-flex items-center justify-center p-4 bg-gradient-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-3xl mb-4 shadow-sm border border-indigo-200 dark:border-indigo-800/50">
                <Database size={40} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 tracking-tight">
                Alimentar Conocimiento IA
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg mx-auto">
                Introduce información sobre tu hotel y la guardaremos optimizada como Embeddings y RAG utilizando <span className="font-bold text-indigo-500">Voyage AI</span>.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
              <div className="p-8">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 ml-1 uppercase tracking-wider">
                  Fragmento de Conocimiento
                </label>
                <textarea 
                  className="w-full h-56 p-5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 transition-all resize-none shadow-inner text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                  placeholder="Ej: El horario de check-in es a las 14:00 y el late check-out a las 18:00 hrs cuesta 20 USD adicionales. La piscina techada abre al público a las 9 am."
                  value={knowledgeText}
                  onChange={(e) => setKnowledgeText(e.target.value)}
                />

                <div className="flex gap-4 mt-8 flex-col sm:flex-row">
                  <button 
                    onClick={handleSaveKnowledge}
                    disabled={isSaving}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(99,102,241,0.3)] transform hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 disabled:transform-none">
                    <Database size={22} /> {isSaving ? 'Guardando...' : 'Generar conocimiento y guardar'}
                  </button>
                  <button 
                    onClick={() => setIsTestModalOpen(true)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-md border border-slate-200 dark:border-slate-700 transform hover:-translate-y-1 active:scale-95 transition-all">
                    <MessageCircle size={22} /> Probar Bot (Testing RAG)
                  </button>
                </div>
                {saveMessage && (
                  <p className={`mt-4 text-center font-semibold text-sm ${saveMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                    {saveMessage}
                  </p>
                )}
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 p-4 text-center">
                <span className="text-xs text-slate-500 flex items-center justify-center gap-1.5 font-medium">
                  <Sparkles size={14} className="text-indigo-400" /> Powered by Voyage AI & Supabase pgvector
                </span>
              </div>
            </div>
          </div>
          
          {/* Test Bot Modal Overlay */}
          {isTestModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
                <div 
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                  onClick={() => {
                    setIsTestModalOpen(false);
                    setTestMessages([{ role: 'bot', content: 'Soy el asistente simulado. ¡Hazme una pregunta sobre las reglas o la disponibilidad del hotel que acabas de cargar!' }]);
                    setTestInput('');
                  }}
                ></div>
              <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[600px] animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">Bot Tester</h3>
                      <p className="text-indigo-100 text-xs">Simulador RAG Voyage AI</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsTestModalOpen(false);
                      setTestMessages([{ role: 'bot', content: 'Soy el asistente simulado. ¡Hazme una pregunta sobre las reglas o la disponibilidad del hotel que acabas de cargar!' }]);
                      setTestInput('');
                    }}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                {/* Modal Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
                  {testMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.isLoading ? (
                           <div className="flex items-center gap-2">
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                           </div>
                        ) : (
                          <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Modal Input */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    placeholder="Haz una pregunta al bot..."
                    className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-950 rounded-xl outline-none text-sm transition-all text-slate-700 dark:text-slate-200"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendTestMessage()}
                  />
                  <button 
                    onClick={handleSendTestMessage}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Profile Configuration Modal */}
      {isProfileModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsProfileModalOpen(false)}
          ></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col p-8 animate-in fade-in zoom-in-95 duration-200 z-10">
             <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-200 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-500">Configurar Perfil</h3>
             <div className="space-y-5">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Avatar (URL o Imagen)</label>
                   <div className="flex items-center gap-3">
                       <div className="relative group shrink-0">
                           {profileAvatar ? <img src={profileAvatar} alt="preview" className="w-14 h-14 rounded-full object-cover shadow border border-slate-200" /> : <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center"><User className="text-slate-400" /></div>}
                           {isUploading && <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div></div>}
                       </div>
                       <input 
                          type="text" 
                          placeholder="Ej: https://x.com/foto.jpg"
                          value={profileAvatar}
                          onChange={e => setProfileAvatar(e.target.value)}
                          className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all min-w-0"
                       />
                       <button onClick={() => fileInputRef.current?.click()} className="shrink-0 p-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/50 dark:text-indigo-300 rounded-xl transition-colors shadow-sm" title="Subir desde PC">
                          <Upload size={20} />
                       </button>
                       <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                   </div>
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Nombre Público</label>
                   <input 
                      type="text" 
                      placeholder="Tu nombre real"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                   />
                </div>
                <div className="pt-4 flex gap-3">
                   <button onClick={handleUpdateProfile} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transform hover:-translate-y-0.5 active:scale-95 transition-all">
                      Guardar Cambios
                   </button>
                   <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl border border-slate-200 transition-all">
                      Cancelar
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ── MOBILE SLIDE-OUT NAV DRAWER ── */}
      {isMobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileNavOpen(false)}
          />
          {/* Drawer */}
          <div className="relative w-72 h-full bg-gradient-to-b from-indigo-700 to-purple-900 flex flex-col py-8 px-5 shadow-2xl">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-10">
              <div className="bg-white/20 p-1.5 rounded-xl backdrop-blur-md">
                <img src="/favicon.png" alt="Logo" className="w-8 h-8 object-cover rounded-lg" />
              </div>
              <img src="/logo-sidebar.png" alt="PrHo-BOT" className="h-8 object-contain brightness-0 invert" />
            </div>

            {/* Nav Items */}
            <nav className="flex flex-col gap-2 flex-1">
              <button
                onClick={() => { setActiveView('chat'); setIsMobileNavOpen(false); setIsMobileChatOpen(false); }}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-left ${
                  activeView === 'chat' ? 'bg-white/20 text-white shadow-inner' : 'text-indigo-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MessageSquare size={22} />
                <span className="font-semibold text-base">Chats</span>
              </button>

              <button
                onClick={() => { setActiveView('knowledge'); setIsMobileNavOpen(false); setIsMobileChatOpen(false); }}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-left ${
                  activeView === 'knowledge' ? 'bg-white/20 text-white shadow-inner' : 'text-indigo-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <BookOpen size={22} />
                <span className="font-semibold text-base">Conocimiento IA</span>
              </button>

              <button
                onClick={() => { setActiveView('history'); fetchHistory(); setIsMobileNavOpen(false); setIsMobileChatOpen(false); }}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-left ${
                  activeView === 'history' ? 'bg-white/20 text-white shadow-inner' : 'text-indigo-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <History size={22} />
                <span className="font-semibold text-base">Historial</span>
              </button>

              <button
                className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left text-indigo-200 hover:bg-white/10 hover:text-white transition-all"
              >
                <Bell size={22} />
                <span className="font-semibold text-base">Notificaciones</span>
              </button>
            </nav>

            {/* Bottom actions */}
            <div className="border-t border-white/20 pt-6 flex flex-col gap-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 mb-2">
                {currentUser?.avatar 
                  ? <img src={currentUser.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-white/30" alt="avatar" />
                  : <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">{currentUser?.name?.charAt(0)}</div>
                }
                <div>
                  <p className="text-white font-bold text-sm leading-tight">{currentUser?.name}</p>
                  <p className="text-indigo-300 text-xs">{currentUser?.email}</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsMobileNavOpen(false); handleResetChats(); }}
                className="flex items-center gap-4 px-4 py-3 rounded-2xl text-pink-300 hover:bg-pink-600/30 hover:text-white transition-all text-left"
              >
                <Trash2 size={20} />
                <span className="font-semibold">Resetear Sistema</span>
              </button>
              <button 
                onClick={() => { setIsMobileNavOpen(false); handleLogout(); }}
                className="flex items-center gap-4 px-4 py-3 rounded-2xl text-red-300 hover:bg-red-600/30 hover:text-white transition-all text-left"
              >
                <Power size={20} />
                <span className="font-semibold">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-indigo-700 to-purple-800 border-t border-indigo-600/50 flex items-center justify-around py-1.5 shadow-2xl">
        <button
          onClick={() => { setActiveView('chat'); setIsMobileChatOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
            activeView === 'chat' ? 'text-white bg-white/20' : 'text-indigo-300 hover:text-white'
          }`}
        >
          <MessageSquare size={20} />
          <span className="text-[10px] font-bold">Chats</span>
        </button>

        <button
          onClick={() => { setActiveView('knowledge'); setIsMobileChatOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
            activeView === 'knowledge' ? 'text-white bg-white/20' : 'text-indigo-300 hover:text-white'
          }`}
        >
          <BookOpen size={20} />
          <span className="text-[10px] font-bold">IA</span>
        </button>

        <button
          onClick={() => { setActiveView('history'); fetchHistory(); setIsMobileChatOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
            activeView === 'history' ? 'text-white bg-white/20' : 'text-indigo-300 hover:text-white'
          }`}
        >
          <History size={20} />
          <span className="text-[10px] font-bold">Historial</span>
        </button>

        <button
          onClick={() => setIsMobileNavOpen(true)}
          className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-indigo-300 hover:text-white transition-all"
        >
          <Menu size={20} />
          <span className="text-[10px] font-bold">Menú</span>
        </button>
      </div>

      {/* Onboarding QR Modal */}
      {isOnboardingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800/50 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-900">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Settings size={20} className="text-indigo-600 dark:text-indigo-400" />
                Conectar WhatsApp
              </h2>
              <button 
                onClick={() => setIsOnboardingModalOpen(false)} 
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 flex flex-col items-center text-center">
              {isOnboardingLoading ? (
                <div className="py-12 flex flex-col items-center">
                  <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                  <p className="font-bold text-slate-500">Generando QR Exclusivo...</p>
                </div>
              ) : onboardingQRUrl ? (
                <>
                  <p className="text-slate-600 dark:text-slate-400 mb-6 font-medium text-sm">
                    Haz que el dueño del hotel escanee este código o ingresa a este link en su navegador para enlazar su número.
                  </p>
                  
                  <div className="bg-white p-4 rounded-3xl shadow-lg border-2 border-indigo-100 dark:border-indigo-500/20 mb-6">
                    <QRCodeSVG value={onboardingQRUrl} size={200} level="M" />
                  </div>
                  
                  <div className="flex items-center gap-2 w-full mb-6">
                    <input 
                      type="text" 
                      readOnly 
                      value={onboardingQRUrl} 
                      className="flex-1 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(onboardingQRUrl);
                        alert("¡Enlace copiado al portapapeles!");
                      }}
                      className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
                    >
                      Copiar
                    </button>
                  </div>
                  
                  <p className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-full uppercase tracking-wider">
                    Powered by Kapso Embedded Signup
                  </p>
                </>
              ) : (
                <div className="py-10 text-rose-500 font-bold">
                  No se pudo generar el QR. Verifica tu webhook.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
